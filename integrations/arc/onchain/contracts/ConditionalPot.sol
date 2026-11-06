// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IConditionalPot} from "./IConditionalPot.sol";
import {IReceiveWithAuthorization} from "./interfaces/IReceiveWithAuthorization.sol";
import {PotMath} from "./PotMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ConditionalPot
/// @notice A conditional multi-party pot with equal stakes and pull-based payouts.
/// @dev No admin, owner, pause, upgrade or fee. Seats authorize terms and cooperative
/// settlement; an optional per-pot oracle can only propose, subject to a seat's contest.
/// Refunds are permissionless under the fixed lifecycle rules. Stray tokens sent
/// directly are unrecoverable. A token issuer's blocklist can freeze a recipient or
/// this contract. Allowed assets must implement payee-only receiveWithAuthorization.
contract ConditionalPot is IConditionalPot, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant override MIN_RETAINED_BALANCE = 50_000;
    uint256 public constant override MIN_CHALLENGE_WINDOW = 60;

    bytes32 private constant TERMS_HEAD_TYPEHASH =
        keccak256("TermsHead(bytes32 potId,address asset,uint256 stake,bytes32 seatsHash,uint8 rule)");
    bytes32 private constant TERMS_TAIL_TYPEHASH = keccak256(
        "TermsTail(address oracle,uint64 fundDeadline,uint64 settleDeadline,uint32 challengeWindow,uint32 minPlaySeconds,bytes32 metadataHash)"
    );
    bytes32 private constant TERMS_TYPEHASH = keccak256("Terms(bytes32 head,bytes32 tail)");
    bytes32 private constant ACCEPT_TYPEHASH = keccak256("Accept(bytes32 potId,bytes32 termsHash)");
    bytes32 private constant SETTLE_TYPEHASH = keccak256("Settle(bytes32 potId,bytes32 placesHash)");
    bytes32 private constant CONTEST_TYPEHASH = keccak256("Contest(bytes32 potId)");

    struct Pot {
        address asset;
        uint8 seatCount;
        uint8 fundedBitmap;
        uint8 acceptedBitmap;
        Rule rule;
        State state;
        uint256 stake;
        uint64 fundDeadline;
        uint64 settleDeadline;
        address oracle;
        uint32 challengeWindow;
        uint32 minPlaySeconds;
        uint64 lockedAt;
        address[4] seats;
        bytes32 metadataHash;
        bytes32 termsHash;
        Proposal proposal;
    }

    // Written only during construction; there is deliberately no allowlist setter.
    address[] private _assets;
    mapping(address asset => bool allowed) private _allowed;
    mapping(bytes32 potId => Pot pot) private _pots;
    mapping(bytes32 potId => mapping(address seat => uint256 amount)) private _claimable;

    constructor(address[] memory assets) EIP712("ChonksPot", "1") {
        if (assets.length == 0 || assets.length > 4) revert BadAssetList();
        // Validate the whole list before making any token calls.
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            if (asset == address(0) || _allowed[asset]) revert BadAssetList();
            _allowed[asset] = true;
            _assets.push(asset);
        }
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            try IERC20Metadata(asset).decimals() returns (uint8 decimals_) {
                if (decimals_ != 6) revert BadDecimals(asset);
            } catch {
                revert BadDecimals(asset);
            }
        }
    }

    /// @inheritdoc IConditionalPot
    function create(bytes32 potId, CreateParams calldata p) external override {
        Pot storage pot = _pots[potId];
        if (pot.state != State.None) revert PotExists();
        if (!_allowed[p.asset]) revert AssetNotAllowed(p.asset);
        if (p.seats.length < 2 || p.seats.length > 4) revert BadSeatCount();
        for (uint256 i; i < p.seats.length; ++i) {
            if (p.seats[i] == address(0)) revert ZeroSeat();
            for (uint256 j; j < i; ++j) {
                if (p.seats[i] == p.seats[j]) revert DuplicateSeat();
            }
        }
        if (p.stake == 0) revert ZeroStake();
        if (p.stake > type(uint256).max / p.seats.length) revert StakeTooLarge();
        if (p.challengeWindow < MIN_CHALLENGE_WINDOW) revert WindowTooShort();
        if (p.minPlaySeconds == 0) revert BadMinPlay();
        if (
            block.timestamp >= p.fundDeadline ||
            uint256(p.fundDeadline) + p.minPlaySeconds >= p.settleDeadline
        ) revert BadDeadlines();

        pot.asset = p.asset;
        pot.stake = p.stake;
        pot.seatCount = uint8(p.seats.length);
        for (uint256 i; i < p.seats.length; ++i) pot.seats[i] = p.seats[i];
        pot.rule = p.rule;
        pot.oracle = p.oracle;
        pot.fundDeadline = p.fundDeadline;
        pot.settleDeadline = p.settleDeadline;
        pot.challengeWindow = p.challengeWindow;
        pot.minPlaySeconds = p.minPlaySeconds;
        pot.metadataHash = p.metadataHash;
        pot.termsHash = hashTerms(potId, p);
        pot.state = State.Funding;
        emit Created(
            potId, p.asset, p.stake, p.seats, p.rule, p.oracle,
            p.fundDeadline, p.settleDeadline, p.challengeWindow, p.minPlaySeconds, p.metadataHash, pot.termsHash
        );
    }

    /// @inheritdoc IConditionalPot
    function fundWithAuthorization(
        bytes32 potId,
        address seat,
        bytes calldata acceptSig,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata authSig
    ) external override nonReentrant {
        Pot storage pot = _existingPot(potId);
        _requireState(pot, State.Funding);
        if (block.timestamp >= pot.fundDeadline) revert FundingClosed();
        uint8 index = _seatIndex(pot, seat);
        uint8 bit = uint8(1 << index);
        if ((pot.fundedBitmap & bit) != 0) revert AlreadyFunded();
        bytes32 expectedNonce = fundingNonce(potId, seat);
        if (nonce != expectedNonce) revert BadNonce(expectedNonce);
        if (validBefore > pot.fundDeadline) revert AuthorizationTooLong();
        if (!SignatureChecker.isValidSignatureNowCalldata(seat, acceptDigest(potId, pot.termsHash), acceptSig)) {
            revert BadSignature(seat);
        }

        pot.fundedBitmap |= bit;
        pot.acceptedBitmap |= bit;
        _receiveFunding(pot, seat, validAfter, validBefore, nonce, authSig);
        emit Funded(potId, seat, index, pot.stake);
        if (pot.fundedBitmap == uint8((uint256(1) << pot.seatCount) - 1)) {
            pot.state = State.Locked;
            pot.lockedAt = uint64(block.timestamp);
            emit Locked(potId, pot.lockedAt);
        }
    }

    function _receiveFunding(
        Pot storage pot,
        address seat,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata authSig
    ) private {
        IERC20 asset = IERC20(pot.asset);
        uint256 beforeBalance = asset.balanceOf(address(this));
        IReceiveWithAuthorization(pot.asset).receiveWithAuthorization(
            seat, address(this), pot.stake, validAfter, validBefore, nonce, authSig
        );
        uint256 afterBalance = asset.balanceOf(address(this));
        // A decreasing balance is also a mismatch, rather than an arithmetic panic.
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != pot.stake) revert BalanceDeltaMismatch(pot.stake, received);
        uint256 retained = asset.balanceOf(seat);
        if (retained < MIN_RETAINED_BALANCE) revert RetainedBalanceTooLow(retained, MIN_RETAINED_BALANCE);
    }

    /// @inheritdoc IConditionalPot
    function settleCooperative(bytes32 potId, uint8[] calldata places, bytes[] calldata sigs)
        external override nonReentrant
    {
        Pot storage pot = _existingPot(potId);
        _requireState(pot, State.Locked);
        if (block.timestamp >= pot.settleDeadline) revert SettlementClosed();
        if (sigs.length != pot.seatCount) revert WrongSignatureCount();
        _validatePlaces(places, pot.seatCount);
        bytes32 placesHash = hashPlaces(places);
        bytes32 digest = settleDigest(potId, placesHash);
        for (uint256 i; i < pot.seatCount; ++i) {
            if (!SignatureChecker.isValidSignatureNowCalldata(pot.seats[i], digest, sigs[i])) {
                revert BadSignature(pot.seats[i]);
            }
        }
        _allocate(potId, pot, places);
        pot.state = State.Settled;
        emit Settled(potId, placesHash, "cooperative");
    }

    /// @inheritdoc IConditionalPot
    function propose(bytes32 potId, uint8[] calldata places, bytes32 resultHash) external override {
        Pot storage pot = _existingPot(potId);
        if (pot.oracle == address(0) || msg.sender != pot.oracle) revert NotOracle();
        _requireState(pot, State.Locked);
        if (block.timestamp < uint256(pot.lockedAt) + pot.minPlaySeconds) revert TooEarly();
        if (block.timestamp >= pot.settleDeadline) revert SettlementClosed();
        _validatePlaces(places, pot.seatCount);
        bytes32 placesHash = hashPlaces(places);
        uint64 at = uint64(block.timestamp);
        pot.proposal = Proposal({placesHash: placesHash, resultHash: resultHash, at: at});
        pot.state = State.Proposed;
        emit Proposed(potId, placesHash, resultHash, places, uint64(uint256(at) + pot.challengeWindow));
    }

    /// @inheritdoc IConditionalPot
    function contestWithSig(bytes32 potId, address seat, bytes calldata sig) external override {
        Pot storage pot = _existingPot(potId);
        _requireState(pot, State.Proposed);
        if (block.timestamp >= uint256(pot.proposal.at) + pot.challengeWindow) revert ChallengeClosed();
        _seatIndex(pot, seat);
        if (!SignatureChecker.isValidSignatureNowCalldata(seat, contestDigest(potId), sig)) {
            revert BadSignature(seat);
        }
        pot.state = State.Contested;
        emit Contested(potId, seat);
    }

    /// @inheritdoc IConditionalPot
    function finalize(bytes32 potId, uint8[] calldata places) external override {
        Pot storage pot = _existingPot(potId);
        _requireState(pot, State.Proposed);
        if (block.timestamp < uint256(pot.proposal.at) + pot.challengeWindow) revert ChallengeOpen();
        bytes32 placesHash = hashPlaces(places);
        if (placesHash != pot.proposal.placesHash) revert PlacesMismatch();
        // The commitment was validated by propose; identical places need no revalidation.
        _allocate(potId, pot, places);
        pot.state = State.Settled;
        emit Settled(potId, placesHash, "oracle");
    }

    /// @inheritdoc IConditionalPot
    function refund(bytes32 potId) external override nonReentrant {
        Pot storage pot = _existingPot(potId);
        RefundReason reason;
        if (pot.state == State.Funding) {
            if (block.timestamp < pot.fundDeadline) revert NotRefundable();
            reason = RefundReason.FundingExpired;
        } else if (pot.state == State.Locked) {
            if (block.timestamp < pot.settleDeadline) revert NotRefundable();
            reason = RefundReason.SettleExpired;
        } else if (pot.state == State.Contested) {
            reason = RefundReason.Contested;
        } else {
            revert WrongState(pot.state);
        }
        pot.state = State.Refunded;
        for (uint256 i; i < pot.seatCount; ++i) {
            if ((pot.fundedBitmap & uint8(1 << i)) != 0) _claimable[potId][pot.seats[i]] = pot.stake;
        }
        emit Refunded(potId, reason);
    }

    /// @inheritdoc IConditionalPot
    function claim(bytes32 potId, address seat) external override nonReentrant {
        Pot storage pot = _existingPot(potId);
        if (pot.state != State.Settled && pot.state != State.Refunded) revert WrongState(pot.state);
        uint256 amount = _claimable[potId][seat];
        if (amount == 0) revert NothingToClaim();
        _claimable[potId][seat] = 0;
        IERC20(pot.asset).safeTransfer(seat, amount);
        emit Claimed(potId, seat, amount);
    }

    /// @inheritdoc IConditionalPot
    function getPot(bytes32 potId) external view override returns (PotView memory v) {
        Pot storage pot = _existingPot(potId);
        v.asset = pot.asset;
        v.stake = pot.stake;
        v.seats = new address[](pot.seatCount);
        for (uint256 i; i < pot.seatCount; ++i) v.seats[i] = pot.seats[i];
        v.fundedBitmap = pot.fundedBitmap;
        v.acceptedBitmap = pot.acceptedBitmap;
        v.rule = pot.rule;
        v.oracle = pot.oracle;
        v.fundDeadline = pot.fundDeadline;
        v.settleDeadline = pot.settleDeadline;
        v.challengeWindow = pot.challengeWindow;
        v.minPlaySeconds = pot.minPlaySeconds;
        v.lockedAt = pot.lockedAt;
        v.metadataHash = pot.metadataHash;
        v.termsHash = pot.termsHash;
        v.state = pot.state;
        v.proposal = pot.proposal;
        v.total = pot.stake * pot.seatCount; // cannot overflow: create bounds stake <= max / seatCount
    }

    /// @inheritdoc IConditionalPot
    function claimableOf(bytes32 potId, address seat) external view override returns (uint256) {
        return _claimable[potId][seat];
    }

    /// @inheritdoc IConditionalPot
    function isAllowedAsset(address asset) external view override returns (bool) {
        return _allowed[asset];
    }

    /// @inheritdoc IConditionalPot
    function allowedAssets() external view override returns (address[] memory) {
        return _assets;
    }

    /// @inheritdoc IConditionalPot
    function hashTerms(bytes32 potId, CreateParams calldata p) public pure override returns (bytes32) {
        bytes32 head = keccak256(
            abi.encode(TERMS_HEAD_TYPEHASH, potId, p.asset, p.stake, keccak256(abi.encodePacked(p.seats)), uint8(p.rule))
        );
        bytes32 tail = keccak256(
            abi.encode(
                TERMS_TAIL_TYPEHASH, p.oracle, p.fundDeadline, p.settleDeadline, p.challengeWindow, p.minPlaySeconds, p.metadataHash
            )
        );
        return keccak256(abi.encode(TERMS_TYPEHASH, head, tail));
    }

    /// @inheritdoc IConditionalPot
    function fundingNonce(bytes32 potId, address seat) public pure override returns (bytes32) {
        return keccak256(abi.encode("chonks-fund", potId, seat));
    }

    /// @inheritdoc IConditionalPot
    function hashPlaces(uint8[] calldata places) public pure override returns (bytes32) {
        return keccak256(abi.encode(places));
    }

    /// @inheritdoc IConditionalPot
    function acceptDigest(bytes32 potId, bytes32 termsHash) public view override returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ACCEPT_TYPEHASH, potId, termsHash)));
    }

    /// @inheritdoc IConditionalPot
    function settleDigest(bytes32 potId, bytes32 placesHash) public view override returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(SETTLE_TYPEHASH, potId, placesHash)));
    }

    /// @inheritdoc IConditionalPot
    function contestDigest(bytes32 potId) public view override returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CONTEST_TYPEHASH, potId)));
    }

    function _existingPot(bytes32 potId) private view returns (Pot storage pot) {
        pot = _pots[potId];
        if (pot.state == State.None) revert UnknownPot();
    }

    function _requireState(Pot storage pot, State expected) private view {
        if (pot.state != expected) revert WrongState(pot.state);
    }

    function _seatIndex(Pot storage pot, address seat) private view returns (uint8) {
        for (uint8 i; i < pot.seatCount; ++i) {
            if (pot.seats[i] == seat) return i;
        }
        revert NotASeat();
    }

    function _validatePlaces(uint8[] calldata places, uint8 seatCount) private pure {
        if (!PotMath.isDensePlacing(places, seatCount)) revert BadPlaces();
    }

    /// @dev Caller supplies validated dense ranks; no external calls during allocation.
    function _allocate(bytes32 potId, Pot storage pot, uint8[] calldata places) private {
        uint256[4] memory paid = PotMath.shares(pot.rule, pot.stake, places);
        for (uint256 i; i < pot.seatCount; ++i) _claimable[potId][pot.seats[i]] = paid[i];
    }
}
