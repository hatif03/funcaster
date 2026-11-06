// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEIP3009 {
    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, uint8 v, bytes32 r, bytes32 s
    ) external;
}

/// @title Funcaster Creator Commerce revenue router
/// @notice Creator commerce only; unrelated to wagers or markets. Target: Arc testnet (5042002).
/// @dev EIP-712 uses the live chain ID, not the target-chain hint. The immutable operator can
/// register immutable versions and relay payments, but cannot forge payer signatures or move
/// credits. There is no owner, admin, pause, upgrade, rake, or withdrawal of accounted credits.
/// Deployment must pin token_ to genuine six-decimal USDC supporting EIP-3009; checking decimals
/// alone does not authenticate USDC. EURC is excluded: USD threshold conversion needs a documented rate.
/// The constant platform fee schedule taxes only creator-global gross above FREE_BAND: standard 10%,
/// creator-brought 5%, both at most the 15% hard cap. Signed attribution selects the rate;
/// provenance is an off-chain assumption, not independently proven here. Signed referred and
/// atVenue slots enable configured referral and venue shares of gross, separate from the platform
/// fee, which is never reduced by those shares. Attribution and external referral are mutually exclusive.
/// Platform, venue and referral divisions round down; the creator pool receives the remainder.
/// At most five creator-side recipients include the creator and up to four collaborators.
/// Collaborator shares round down and all creator-pool dust goes to the creator.
/// Passes reset to 24 hours from each payment, never stack, separately per version, room and payer.
/// Payment IDs are global one-use EIP-3009 nonces. Claim nonces are sequential per recipient
/// and consumed only by successful claims; ERC-1271 recipients are supported for claims.
/// Claims always transfer to the signing recipient, never an alternate destination.
/// Independent pull credits isolate failed or blocklisted recipients to their own claims.
contract RevenueRouter is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PRICE = 100e6;
    uint256 public constant STANDARD_FEE_BPS = 1000;
    uint256 public constant CREATOR_BROUGHT_FEE_BPS = 500;
    uint256 public constant HARD_CAP_FEE_BPS = 1500;
    uint256 public constant FREE_BAND = 1000e6;
    uint256 public constant VENUE_SHARE_BPS = 1000;
    uint256 public constant MIN_REFERRAL_BPS = 500;
    uint256 public constant MAX_REFERRAL_BPS = 2000;
    uint256 public constant MAX_COLLABORATORS = 4;
    uint256 public constant MAX_CREATOR_SIDE_RECIPIENTS = 5;
    uint256 public constant BPS = 10000;
    uint256 public constant PASS_DURATION = 24 hours;
    uint256 public constant MAX_PERMIT_WINDOW = 1 days;

    bytes32 public constant PASS_PERMIT_TYPEHASH = keccak256(
        "PassPermit(bytes32 paymentId,bytes32 versionId,address payer,bytes32 roomHash,bool attribution,bool referred,bool atVenue,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 public constant CLAIM_PERMIT_TYPEHASH = keccak256(
        "ClaimPermit(address recipient,uint256 nonce,uint256 deadline)"
    );

    IERC20 public immutable token;
    address public immutable platform;
    address public immutable operator;

    struct Collaborator {
        address account;
        uint16 weightBps;
    }

    struct Version {
        address creator;
        uint256 price;
        address venue;
        address referral;
        uint16 referralBps;
        uint16 creatorWeightBps;
        Collaborator[] collaborators;
        bool exists;
    }

    struct PayRequest {
        bytes32 paymentId;
        bytes32 versionId;
        address payer;
        bytes32 roomHash;
        bool attribution;
        bool referred;
        bool atVenue;
        uint256 validAfter;
        uint256 validBefore;
    }

    struct ClaimPermit {
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    mapping(bytes32 => Version) private _versions;
    mapping(bytes32 => mapping(bytes32 => mapping(address => uint64))) private _passExpiries;
    mapping(address => uint256) public credit;
    mapping(address => uint256) public lifetimeGross;
    mapping(bytes32 => bool) public paymentUsed;
    mapping(address => uint256) public claimNonces;
    uint256 public totalCredited;

    error ZeroAddress();
    error UnsupportedDecimals();
    error OnlyOperator();
    error UnauthorizedPayer();
    error InvalidVersionId();
    error VersionAlreadyRegistered();
    error UnknownVersion();
    error InvalidPrice();
    error InvalidReferral();
    error VenueNotConfigured();
    error ReferralNotConfigured();
    error InvalidSlotCombination();
    error TooManyCollaborators();
    error InvalidCollaborator();
    error DuplicateCollaborator();
    error InvalidWeights();
    error InvalidPaymentId();
    error PaymentAlreadyProcessed();
    error InvalidRoomHash();
    error InvalidPermitWindow();
    error PermitExpired();
    error PermitNotYetValid();
    error InvalidPermitSignature();
    error UnexpectedReceivedAmount();
    error ClaimExpired();
    error NothingToClaim();
    error RecipientBlocklisted();

    event VersionRegistered(
        bytes32 indexed versionId, address indexed creator, uint256 price,
        address venue, address referral, uint16 referralBps
    );
    event Credited(bytes32 indexed paymentId, address indexed recipient, uint256 amount);
    event PassPaid(
        bytes32 indexed paymentId, bytes32 indexed versionId, address indexed payer,
        bytes32 roomHash, uint256 amount
    );
    event PassGranted(
        bytes32 indexed versionId, bytes32 indexed roomHash, address indexed payer, uint64 expiry
    );
    event Claimed(address indexed recipient, uint256 amount, uint256 nonce);

    constructor(address token_, address platform_, address operator_)
        EIP712("ChonksRevenueRouter", "1")
    {
        if (token_ == address(0) || platform_ == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        if (IERC20Metadata(token_).decimals() != 6) revert UnsupportedDecimals();
        assert(STANDARD_FEE_BPS <= HARD_CAP_FEE_BPS && CREATOR_BROUGHT_FEE_BPS <= HARD_CAP_FEE_BPS);
        token = IERC20(token_);
        platform = platform_;
        operator = operator_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    function registerVersion(
        bytes32 versionId, address creator, uint256 price, address venue,
        address referral, uint16 referralBps, uint16 creatorWeightBps,
        Collaborator[] calldata collaborators
    ) external onlyOperator {
        if (versionId == bytes32(0)) revert InvalidVersionId();
        if (_versions[versionId].exists) revert VersionAlreadyRegistered();
        if (creator == address(0)) revert ZeroAddress();
        if (price == 0 || price > MAX_PRICE) revert InvalidPrice();
        if (referral == address(0)) {
            if (referralBps != 0) revert InvalidReferral();
        } else if (referralBps < MIN_REFERRAL_BPS || referralBps > MAX_REFERRAL_BPS) {
            revert InvalidReferral();
        }
        if (collaborators.length > MAX_COLLABORATORS) revert TooManyCollaborators();
        if (creatorWeightBps == 0) revert InvalidWeights();
        uint256 weight = creatorWeightBps;
        for (uint256 i = 0; i < collaborators.length; ++i) {
            Collaborator calldata collaborator = collaborators[i];
            if (collaborator.account == address(0) || collaborator.account == creator || collaborator.weightBps == 0) {
                revert InvalidCollaborator();
            }
            for (uint256 j = 0; j < i; ++j) {
                if (collaborators[j].account == collaborator.account) revert DuplicateCollaborator();
            }
            weight += collaborator.weightBps;
        }
        if (weight != BPS) revert InvalidWeights();

        Version storage version = _versions[versionId];
        version.creator = creator;
        version.price = price;
        version.venue = venue;
        version.referral = referral;
        version.referralBps = referralBps;
        version.creatorWeightBps = creatorWeightBps;
        for (uint256 i = 0; i < collaborators.length; ++i) {
            version.collaborators.push(collaborators[i]);
        }
        version.exists = true;
        emit VersionRegistered(versionId, creator, price, venue, referral, referralBps);
    }

    function getVersion(bytes32 versionId) external view returns (Version memory) {
        if (!_versions[versionId].exists) revert UnknownVersion();
        return _versions[versionId];
    }

    function pay(PayRequest calldata r, bytes calldata permitSig, uint8 v, bytes32 rr, bytes32 s)
        external nonReentrant
    {
        if (msg.sender != operator && msg.sender != r.payer) revert UnauthorizedPayer();
        Version storage version = _versions[r.versionId];
        if (!version.exists) revert UnknownVersion();
        if (r.atVenue && version.venue == address(0)) revert VenueNotConfigured();
        if (r.referred && version.referral == address(0)) revert ReferralNotConfigured();
        if (r.attribution && r.referred) revert InvalidSlotCombination();
        if (r.paymentId == bytes32(0)) revert InvalidPaymentId();
        if (paymentUsed[r.paymentId]) revert PaymentAlreadyProcessed();
        if (r.roomHash == bytes32(0)) revert InvalidRoomHash();
        if (r.payer == address(0)) revert ZeroAddress();
        if (r.validBefore <= r.validAfter || r.validBefore - r.validAfter > MAX_PERMIT_WINDOW) {
            revert InvalidPermitWindow();
        }
        if (block.timestamp < r.validAfter) revert PermitNotYetValid();
        if (block.timestamp >= r.validBefore) revert PermitExpired();
        if (ECDSA.recover(hashPassPermit(r), permitSig) != r.payer) revert InvalidPermitSignature();

        paymentUsed[r.paymentId] = true;
        _allocate(r.paymentId, version, r.attribution, r.referred, r.atVenue);
        uint64 expiry = _grantPass(r.versionId, r.roomHash, r.payer);
        _receivePayment(r, version.price, v, rr, s);
        emit PassPaid(r.paymentId, r.versionId, r.payer, r.roomHash, version.price);
        emit PassGranted(r.versionId, r.roomHash, r.payer, expiry);
    }

    /// @notice Claims all accrued credit, transferring only to the signing recipient.
    /// @dev Supports ERC-1271 signatures and consumes the recipient's sequential nonce only on success.
    function claim(address recipient, uint256 deadline, bytes calldata signature)
        external nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert ClaimExpired();
        uint256 nonce = claimNonces[recipient];
        if (!SignatureChecker.isValidSignatureNow(
            recipient, hashClaimPermit(recipient, nonce, deadline), signature
        )) revert InvalidPermitSignature();
        uint256 amount = credit[recipient];
        if (amount == 0) revert NothingToClaim();
        credit[recipient] = 0;
        totalCredited -= amount;
        claimNonces[recipient] = nonce + 1;
        token.safeTransfer(recipient, amount);
        emit Claimed(recipient, amount, nonce);
    }

    function hashPassPermit(PayRequest calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            PASS_PERMIT_TYPEHASH, r.paymentId, r.versionId, r.payer, r.roomHash,
            r.attribution, r.referred, r.atVenue, r.validAfter, r.validBefore
        )));
    }

    /// @notice Returns the claim digest binding the recipient, sequential nonce and deadline.
    function hashClaimPermit(address recipient, uint256 nonce, uint256 deadline)
        public view returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(
            CLAIM_PERMIT_TYPEHASH, recipient, nonce, deadline
        )));
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function passExpiry(bytes32 versionId, bytes32 roomHash, address account) public view returns (uint64) {
        return _passExpiries[versionId][roomHash][account];
    }

    function hasActivePass(bytes32 versionId, bytes32 roomHash, address account) external view returns (bool) {
        return block.timestamp < passExpiry(versionId, roomHash, account);
    }

    /// @dev Tracks creator-global gross across versions. Only gross above FREE_BAND is taxed for
    /// the platform; enabled venue and referral slots receive separate percentages of the full price.
    /// Each cut rounds down, leaving the exact remainder to the creator pool. Collaborator shares
    /// round down from that pool and the creator receives all remaining dust.
    function _allocate(
        bytes32 paymentId, Version storage version, bool attribution, bool referred, bool atVenue
    ) private {
        uint256 beforeGross = lifetimeGross[version.creator];
        uint256 afterGross = beforeGross + version.price;
        uint256 taxable = afterGross <= FREE_BAND ? 0
            : (beforeGross >= FREE_BAND ? version.price : afterGross - FREE_BAND);
        lifetimeGross[version.creator] = afterGross;
        uint256 platformFee = taxable * (attribution ? CREATOR_BROUGHT_FEE_BPS : STANDARD_FEE_BPS) / BPS;
        uint256 venueCut = (atVenue && version.venue != address(0)) ? version.price * VENUE_SHARE_BPS / BPS : 0;
        uint256 referralCut = (referred && version.referral != address(0)) ? version.price * version.referralBps / BPS : 0;
        _credit(paymentId, version.venue, venueCut);
        _credit(paymentId, version.referral, referralCut);
        _credit(paymentId, platform, platformFee);

        uint256 creatorPool = version.price - platformFee - venueCut - referralCut;
        uint256 distributed;
        for (uint256 i = 0; i < version.collaborators.length; ++i) {
            Collaborator storage collaborator = version.collaborators[i];
            uint256 share = creatorPool * collaborator.weightBps / BPS;
            distributed += share;
            _credit(paymentId, collaborator.account, share);
        }
        _credit(paymentId, version.creator, creatorPool - distributed);
    }

    /// @dev USDC blocklist check on the credited recipient, so a blocklisted recipient cannot
    /// route its credit through an unblocked destination. A token without isBlacklisted(address)
    /// is treated as not blocklisted. Read-only staticcall; no state change.
    function _isBlocklisted(address account) private view returns (bool) {
        (bool ok, bytes memory data) =
            address(token).staticcall(abi.encodeWithSignature("isBlacklisted(address)", account));
        return ok && data.length == 32 && abi.decode(data, (uint256)) == 1;
    }

    function _credit(bytes32 paymentId, address recipient, uint256 amount) private {
        if (amount == 0) return;
        credit[recipient] += amount;
        totalCredited += amount;
        emit Credited(paymentId, recipient, amount);
    }

    /// @dev Resets this version/room/payer pass to 24 hours from now; never extends an existing expiry.
    function _grantPass(bytes32 versionId, bytes32 roomHash, address payer) private returns (uint64) {
        uint64 expiry = uint64(block.timestamp + PASS_DURATION);
        _passExpiries[versionId][roomHash][payer] = expiry;
        return expiry;
    }

    function _receivePayment(PayRequest calldata r, uint256 price, uint8 v, bytes32 rr, bytes32 s) private {
        uint256 balanceBefore = token.balanceOf(address(this));
        IEIP3009(address(token)).receiveWithAuthorization(
            r.payer, address(this), price, r.validAfter, r.validBefore, r.paymentId, v, rr, s
        );
        uint256 balanceAfter = token.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != price) {
            revert UnexpectedReceivedAmount();
        }
    }
}
