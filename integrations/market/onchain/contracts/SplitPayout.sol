// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev The selected token validates EIP-3009 signatures and authorization windows.
interface IReceiveWithAuthorization {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title SplitPayout
/// @notice Fixed-size spectator cheers, paid equally after matching completion reports.
/// @dev Assets must be exact-transfer, non-rebasing EIP-3009 tokens (intended USDC/EURC).
/// No game logic, balance-based accounting, administrator, fees or asset setters.
contract SplitPayout is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CHEER_SMALL = 50_000;
    uint256 public constant CHEER_MEDIUM = 100_000;
    uint256 public constant CHEER_LARGE = 250_000;
    uint256 public constant MAX_CHEERS_PER_ADDRESS = 1;
    uint256 public constant MAX_CHEERS_PER_TABLE = 25;

    enum Status { None, Open, Resolved, Void }

    struct TableParams {
        address asset;
        address operator;
        address[] recipients;
        uint64 closeTime;
        uint64 resolveDeadline;
        address reporterA;
        address reporterB;
    }

    struct Table {
        TableParams params;
        Status status;
        uint256 total;
        uint256 cheerCount;
        bytes32 reportA;
        bytes32 reportB;
        bool submittedA;
        bool submittedB;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    mapping(address => bool) public allowedAsset;
    mapping(bytes32 => Table) private _tables;
    mapping(bytes32 => mapping(address => bool)) public isRecipient;
    mapping(bytes32 => mapping(address => uint256)) public cheerOf;
    mapping(bytes32 => mapping(address => bool)) public payoutClaimed;
    mapping(bytes32 => mapping(address => bool)) public refunded;

    error InvalidAssetList();
    error InvalidAsset();
    error InvalidTable();
    error TableExists();
    error InvalidParameters();
    error NotOpen();
    error CheersClosed();
    error InvalidAuthorizationWindow();
    error InvalidAmount();
    error InvalidSpectator();
    error RecipientCannotCheer();
    error AlreadyCheered();
    error TableFull();
    error Unauthorized();
    error AlreadyReported();
    error InvalidReportWindow();
    error VoidUnavailable();
    error NotResolved();
    error NotVoid();
    error InvalidRecipient();
    error AlreadyClaimed();
    error NothingToClaim();

    event TableCreated(bytes32 indexed tableId, address indexed asset, address indexed operator, TableParams params);
    event Cheered(bytes32 indexed tableId, address indexed spectator, uint256 amount);
    event ResultReported(
        bytes32 indexed tableId,
        address indexed reporter,
        bytes32 resultHash,
        bool completedVerified,
        bytes32 commitment
    );
    event TableResolved(bytes32 indexed tableId, uint256 total);
    event TableVoided(bytes32 indexed tableId);
    event PayoutClaimed(bytes32 indexed tableId, address indexed recipient, uint256 amount);
    event RefundClaimed(bytes32 indexed tableId, address indexed spectator, uint256 amount);

    constructor(address[] memory assets) {
        if (assets.length == 0 || assets.length > 4) revert InvalidAssetList();
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            if (asset == address(0) || allowedAsset[asset]) revert InvalidAssetList();
            allowedAsset[asset] = true;
        }
    }

    function createTable(bytes32 tableId, TableParams calldata p) external {
        if (tableId == bytes32(0)) revert InvalidTable();
        if (_tables[tableId].status != Status.None) revert TableExists();
        if (!allowedAsset[p.asset]) revert InvalidAsset();
        if (
            p.operator == address(0) || p.recipients.length < 2 || p.recipients.length > 4
                || p.closeTime <= block.timestamp || p.resolveDeadline <= p.closeTime
                || p.reporterA == address(0) || p.reporterB == address(0)
                || p.reporterA == p.reporterB
        ) revert InvalidParameters();

        for (uint256 i; i < p.recipients.length; ++i) {
            address recipient = p.recipients[i];
            if (recipient == address(0) || isRecipient[tableId][recipient]) revert InvalidParameters();
            isRecipient[tableId][recipient] = true;
        }
        Table storage t = _tables[tableId];
        t.params = p;
        t.status = Status.Open;
        emit TableCreated(tableId, p.asset, p.operator, p);
    }

    /// @notice Anyone may relay; authorization binds the spectator, amount and table.
    function cheer(
        bytes32 tableId,
        address spectator,
        uint256 amount,
        bytes32 salt,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Authorization memory auth;
        auth.validAfter = validAfter;
        auth.validBefore = validBefore;
        auth.salt = salt;
        auth.v = v;
        auth.r = r;
        auth.s = s;
        _cheer(tableId, spectator, amount, auth);
    }

    function _cheer(bytes32 tableId, address spectator, uint256 amount, Authorization memory auth) private {
        Table storage t = _table(tableId);
        _requireOpen(t);
        if (block.timestamp >= t.params.closeTime) revert CheersClosed();
        if (auth.validBefore > t.params.closeTime) revert InvalidAuthorizationWindow();
        if (amount != CHEER_SMALL && amount != CHEER_MEDIUM && amount != CHEER_LARGE) revert InvalidAmount();
        if (spectator == address(0)) revert InvalidSpectator();
        if (isRecipient[tableId][spectator]) revert RecipientCannotCheer();
        if (cheerOf[tableId][spectator] != 0) revert AlreadyCheered();
        if (t.cheerCount >= MAX_CHEERS_PER_TABLE) revert TableFull();

        cheerOf[tableId][spectator] = amount;
        t.total += amount;
        ++t.cheerCount;
        _receiveCheer(t.params.asset, tableId, spectator, amount, auth);
        emit Cheered(tableId, spectator, amount);
    }

    function _receiveCheer(
        address asset,
        bytes32 tableId,
        address spectator,
        uint256 amount,
        Authorization memory auth
    ) private {
        bytes32 nonce = nonceFor(tableId, spectator, amount, auth.salt);
        IReceiveWithAuthorization(asset).receiveWithAuthorization(
            spectator, address(this), amount, auth.validAfter, auth.validBefore,
            nonce, auth.v, auth.r, auth.s
        );
    }

    /// @notice Each reporter submits once. Disagreement can only expire into a void.
    function report(bytes32 tableId, bytes32 resultHash, bool completedVerified) external {
        Table storage t = _table(tableId);
        _requireOpen(t);
        bool isA = msg.sender == t.params.reporterA;
        if (!isA && msg.sender != t.params.reporterB) revert Unauthorized();
        if (block.timestamp < t.params.closeTime || block.timestamp >= t.params.resolveDeadline) {
            revert InvalidReportWindow();
        }
        bytes32 commitment = keccak256(
            abi.encode(block.chainid, address(this), tableId, resultHash, completedVerified)
        );
        if (isA) {
            if (t.submittedA) revert AlreadyReported();
            t.submittedA = true;
            t.reportA = commitment;
        } else {
            if (t.submittedB) revert AlreadyReported();
            t.submittedB = true;
            t.reportB = commitment;
        }
        emit ResultReported(tableId, msg.sender, resultHash, completedVerified, commitment);
        if (t.submittedA && t.submittedB && t.reportA == t.reportB) {
            if (completedVerified) {
                t.status = Status.Resolved;
                emit TableResolved(tableId, t.total);
            } else {
                _void(tableId, t);
            }
        }
    }

    function voidExpired(bytes32 tableId) external {
        Table storage t = _table(tableId);
        _requireOpen(t);
        if (block.timestamp < t.params.resolveDeadline) revert VoidUnavailable();
        _void(tableId, t);
    }

    function cancel(bytes32 tableId) external {
        Table storage t = _table(tableId);
        _requireOpen(t);
        if (msg.sender != t.params.operator) revert Unauthorized();
        if (block.timestamp >= t.params.closeTime) revert VoidUnavailable();
        _void(tableId, t);
    }

    /// @notice Relayers cannot redirect funds; each recipient claims independently.
    function claimPayout(bytes32 tableId, address recipient) external nonReentrant {
        Table storage t = _table(tableId);
        if (t.status != Status.Resolved) revert NotResolved();
        if (!isRecipient[tableId][recipient]) revert InvalidRecipient();
        if (payoutClaimed[tableId][recipient]) revert AlreadyClaimed();
        uint256 amount = _payout(t, recipient);
        if (amount == 0) revert NothingToClaim();
        payoutClaimed[tableId][recipient] = true;
        IERC20(t.params.asset).safeTransfer(recipient, amount);
        emit PayoutClaimed(tableId, recipient, amount);
    }

    function claimRefund(bytes32 tableId, address spectator) external nonReentrant {
        Table storage t = _table(tableId);
        if (t.status != Status.Void) revert NotVoid();
        uint256 amount = cheerOf[tableId][spectator];
        if (amount == 0 || refunded[tableId][spectator]) revert NothingToClaim();
        refunded[tableId][spectator] = true;
        IERC20(t.params.asset).safeTransfer(spectator, amount);
        emit RefundClaimed(tableId, spectator, amount);
    }

    function getTable(bytes32 tableId) external view returns (Table memory) {
        return _table(tableId);
    }

    /// @notice Returns zero unless resolved, eligible and unclaimed; unknown tables revert.
    function previewPayout(bytes32 tableId, address recipient) external view returns (uint256) {
        Table storage t = _table(tableId);
        if (
            t.status != Status.Resolved || !isRecipient[tableId][recipient]
                || payoutClaimed[tableId][recipient]
        ) return 0;
        return _payout(t, recipient);
    }

    /// @notice Purely domain-derived; does not require an existing table.
    function nonceFor(bytes32 tableId, address spectator, uint256 amount, bytes32 salt)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), tableId, spectator, amount, salt));
    }

    /// @dev Total is historical, never decremented; terminal status freezes the payout basis.
    function _payout(Table storage t, address recipient) private view returns (uint256 amount) {
        uint256 n = t.params.recipients.length;
        amount = t.total / n;
        if (recipient == t.params.recipients[0]) amount += t.total % n;
    }

    function _table(bytes32 tableId) private view returns (Table storage t) {
        t = _tables[tableId];
        if (t.status == Status.None) revert InvalidTable();
    }

    function _requireOpen(Table storage t) private view {
        if (t.status != Status.Open) revert NotOpen();
    }

    function _void(bytes32 tableId, Table storage t) private {
        t.status = Status.Void;
        emit TableVoided(tableId);
    }
}
