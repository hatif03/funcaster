// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Minimal EIP-3009 receive authorization interface; the token verifies the signature.
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

/// @title ChonksMatchMarkets
/// @notice Permissionless winner-only pari-mutuel markets with two-party reporting.
/// @dev Intended for exact-transfer, non-rebasing EIP-3009 USDC/EURC tokens selected
/// at construction. No balance-based accounting, administrator, or asset setters.
/// Fees are payable only to the immutable market operator after resolution.
/// Claim-order cumulative rounding exhausts every winning slice without dust;
/// previews can change by rounding units when other winners claim first.
contract ChonksMatchMarkets is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Resolved, Void }
    enum VoidReason { VerifierVeto, Expired, Underfunded, Cancelled, UnbackedWinners }

    struct MarketParams {
        address token;
        address operator;
        uint8 outcomeCount;
        uint64 closeTime;
        uint64 resolveDeadline;
        uint32 liveness;
        uint16 feeBps;
        uint128 minBet;
        uint128 perUserCap;
        uint128 poolCap;
        address reporterA;
        address verifierB;
        address[] excluded;
    }

    /// @dev Slices and fees use uint256 because totalPool + bonus can exceed uint128.
    /// Params (including the excluded list) are written only at market creation.
    struct Market {
        MarketParams params;
        Status status;
        uint128[4] pools;
        uint128 totalPool;
        uint128 bonus;
        uint8 fundedOutcomes;
        bytes32 reportA;
        bytes32 reportB;
        bool submittedA;
        bool submittedB;
        bool matched;
        uint64 livenessEnd;
        uint8 winMask;
        uint128[4] claimedStake;
        uint256[4] slices;
        bool[4] winning;
        uint256 fee;
        bool feeClaimed;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    mapping(address => bool) public allowedToken;
    uint256 public nextMarketId = 1;
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => mapping(address => bool)) private _excluded;
    mapping(uint256 => mapping(address => mapping(uint8 => uint128))) private _stakes;
    mapping(uint256 => mapping(address => uint128)) public totalStake;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => mapping(address => uint128)) public sponsorBonus;

    error InvalidTokenList();
    error InvalidToken();
    error InvalidMarket();
    error InvalidParameters();
    error InvalidOutcome();
    error InvalidAmount();
    error AmountTooLarge();
    error NotOpen();
    error BettingClosed();
    error InvalidAuthorizationWindow();
    error ExcludedBettor();
    error CapExceeded();
    error PayoutBelowMin();
    error Unauthorized();
    error InvalidReportWindow();
    error Underfunded();
    error InvalidWinMask();
    error AlreadyReported();
    error VetoUnavailable();
    error FinalizationUnavailable();
    error VoidUnavailable();
    error NotTerminal();
    error NothingToClaim();
    error NoFee();

    event MarketCreated(uint256 indexed marketId, address indexed token, address indexed operator, MarketParams params);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, uint8 indexed outcome, uint128 amount, uint128 minPayout);
    event BonusFunded(uint256 indexed marketId, address indexed sponsor, uint128 amount);
    event BonusRefunded(uint256 indexed marketId, address indexed sponsor, uint128 amount);
    event ResultReported(uint256 indexed marketId, address indexed reporter, bytes32 resultHash, uint8 winMask, bytes32 commitment);
    event ReportsMatched(uint256 indexed marketId, uint8 winMask, uint64 livenessEnd);
    event MarketResolved(uint256 indexed marketId, uint8 winMask, uint256 fee, uint256 profitPool);
    event MarketVoided(uint256 indexed marketId, VoidReason reason);
    event Claimed(uint256 indexed marketId, address indexed bettor, uint256 payout);
    event FeeClaimed(uint256 indexed marketId, address indexed operator, uint256 amount);

    /// @notice Fixes the token allowlist permanently, with one to eight distinct tokens.
    constructor(address[] memory tokens) {
        if (tokens.length == 0 || tokens.length > 8) revert InvalidTokenList();
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            if (token == address(0) || allowedToken[token]) revert InvalidTokenList();
            allowedToken[token] = true;
        }
    }

    /// @notice Creates a market; reporterA and verifierB are automatically excluded from betting.
    function createMarket(MarketParams calldata p) external returns (uint256 marketId) {
        if (!allowedToken[p.token]) revert InvalidToken();
        if (
            p.operator == address(0) || p.outcomeCount < 2 || p.outcomeCount > 4
                || p.closeTime <= block.timestamp || p.liveness < 60 || p.liveness > 120
                || uint256(p.resolveDeadline) <= uint256(p.closeTime) + p.liveness
                || p.feeBps > 1000 || p.minBet == 0 || p.perUserCap < p.minBet
                || p.poolCap < p.perUserCap || p.reporterA == address(0)
                || p.verifierB == address(0) || p.reporterA == p.verifierB
                || p.excluded.length > 32
        ) revert InvalidParameters();

        marketId = nextMarketId++;
        _markets[marketId].params = p;
        for (uint256 i; i < p.excluded.length; ++i) {
            if (p.excluded[i] == address(0)) revert InvalidParameters();
            _excluded[marketId][p.excluded[i]] = true;
        }
        // Reporters must never profit from the result they attest to.
        _excluded[marketId][p.reporterA] = true;
        _excluded[marketId][p.verifierB] = true;
        emit MarketCreated(marketId, p.token, p.operator, p);
    }

    /// @notice Relays a bet authorized by the bettor at the token itself.
    /// @dev Every economic field and the chain/contract/market domain bind the nonce.
    function placeBet(
        uint256 marketId,
        uint8 outcome,
        uint128 amount,
        uint128 minPayout,
        address bettor,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 salt,
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
        _placeBet(marketId, outcome, amount, minPayout, bettor, auth);
    }

    function _placeBet(
        uint256 marketId,
        uint8 outcome,
        uint128 amount,
        uint128 minPayout,
        address bettor,
        Authorization memory auth
    ) private {
        Market storage m = _market(marketId);
        _requireBetting(m);
        if (outcome >= m.params.outcomeCount) revert InvalidOutcome();
        if (bettor == address(0) || amount < m.params.minBet) revert InvalidAmount();
        if (auth.validBefore > m.params.closeTime) revert InvalidAuthorizationWindow();
        if (_excluded[marketId][bettor]) revert ExcludedBettor();
        uint128 newUserTotal = _add128(totalStake[marketId][bettor], amount);
        uint128 newTotal = _add128(m.totalPool, amount);
        if (newUserTotal > m.params.perUserCap || newTotal > m.params.poolCap) revert CapExceeded();
        if (_projectedPayout(m, outcome, amount) < minPayout) revert PayoutBelowMin();

        if (m.pools[outcome] == 0) ++m.fundedOutcomes;
        m.pools[outcome] = _add128(m.pools[outcome], amount);
        m.totalPool = newTotal;
        totalStake[marketId][bettor] = newUserTotal;
        _stakes[marketId][bettor][outcome] = _add128(_stakes[marketId][bettor][outcome], amount);

        _receiveBet(m.params.token, marketId, outcome, amount, minPayout, bettor, auth);
        emit BetPlaced(marketId, bettor, outcome, amount, minPayout);
    }

    function _receiveBet(
        address token,
        uint256 marketId,
        uint8 outcome,
        uint128 amount,
        uint128 minPayout,
        address bettor,
        Authorization memory auth
    ) private {
        bytes32 nonce = nonceFor(marketId, outcome, amount, minPayout, bettor, auth.salt);
        IReceiveWithAuthorization(token).receiveWithAuthorization(
            bettor, address(this), amount, auth.validAfter, auth.validBefore,
            nonce, auth.v, auth.r, auth.s
        );
    }

    /// @notice Adds approved sponsor funds to the profit pool, not to betting caps.
    function fundBonus(uint256 marketId, uint128 amount) external nonReentrant {
        Market storage m = _market(marketId);
        _requireBetting(m);
        if (amount == 0) revert InvalidAmount();
        m.bonus = _add128(m.bonus, amount);
        sponsorBonus[marketId][msg.sender] = _add128(sponsorBonus[marketId][msg.sender], amount);
        IERC20(m.params.token).safeTransferFrom(msg.sender, address(this), amount);
        emit BonusFunded(marketId, msg.sender, amount);
    }

    /// @notice Anyone may relay a void bonus refund; only the sponsor receives it.
    function refundBonus(uint256 marketId, address sponsor) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != Status.Void) revert VoidUnavailable();
        uint128 amount = sponsorBonus[marketId][sponsor];
        if (amount == 0) revert NothingToClaim();
        sponsorBonus[marketId][sponsor] = 0;
        IERC20(m.params.token).safeTransfer(sponsor, amount);
        emit BonusRefunded(marketId, sponsor, amount);
    }

    /// @notice Submits a single domain-separated commitment per designated reporter.
    /// @dev Disagreements cannot be overwritten and can only expire into a void.
    function reportResult(uint256 marketId, bytes32 resultHash, uint8 winMask) external {
        Market storage m = _market(marketId);
        _requireOpen(m);
        bool isA = msg.sender == m.params.reporterA;
        if (!isA && msg.sender != m.params.verifierB) revert Unauthorized();
        if (block.timestamp < m.params.closeTime || block.timestamp >= m.params.resolveDeadline) {
            revert InvalidReportWindow();
        }
        if (m.fundedOutcomes < 2) revert Underfunded();
        if (winMask == 0 || uint256(winMask) >= (uint256(1) << m.params.outcomeCount)) revert InvalidWinMask();
        bytes32 commitment = keccak256(abi.encode(block.chainid, address(this), marketId, resultHash, winMask));
        if (isA) {
            if (m.submittedA) revert AlreadyReported();
            m.submittedA = true;
            m.reportA = commitment;
        } else {
            if (m.submittedB) revert AlreadyReported();
            m.submittedB = true;
            m.reportB = commitment;
        }
        emit ResultReported(marketId, msg.sender, resultHash, winMask, commitment);
        if (m.submittedA && m.submittedB && m.reportA == m.reportB) {
            uint256 end = block.timestamp + m.params.liveness;
            if (end > type(uint64).max) revert AmountTooLarge();
            m.matched = true;
            m.livenessEnd = uint64(end);
            m.winMask = winMask;
            emit ReportsMatched(marketId, winMask, m.livenessEnd);
        }
    }

    /// @notice The verifier may only void a matched market during its liveness window.
    function vetoByVerifier(uint256 marketId) external {
        Market storage m = _market(marketId);
        _requireOpen(m);
        if (msg.sender != m.params.verifierB) revert Unauthorized();
        if (!m.matched || block.timestamp >= m.livenessEnd) revert VetoUnavailable();
        _void(marketId, m, VoidReason.VerifierVeto);
    }

    /// @notice Finalizes matching reports after liveness, strictly before the deadline.
    function finalize(uint256 marketId) external {
        Market storage m = _market(marketId);
        _requireOpen(m);
        if (!m.matched || block.timestamp < m.livenessEnd || block.timestamp >= m.params.resolveDeadline) {
            revert FinalizationUnavailable();
        }
        uint256 winningPool;
        uint8 backedWinners;
        uint8 firstWinner;
        for (uint8 i; i < m.params.outcomeCount; ++i) {
            if ((m.winMask & (uint8(1) << i)) != 0 && m.pools[i] != 0) {
                if (backedWinners == 0) firstWinner = i;
                ++backedWinners;
                winningPool += m.pools[i];
                m.winning[i] = true;
            }
        }
        if (backedWinners == 0) {
            _void(marketId, m, VoidReason.UnbackedWinners);
            return;
        }
        uint256 losing = uint256(m.totalPool) - winningPool;
        uint256 fee = Math.mulDiv(losing, m.params.feeBps, 10_000);
        uint256 profitPool = losing - fee + m.bonus;
        uint256 slice = profitPool / backedWinners;
        for (uint8 i; i < m.params.outcomeCount; ++i) {
            if (m.winning[i]) m.slices[i] = slice;
        }
        m.slices[firstWinner] += profitPool % backedWinners;
        m.fee = fee;
        m.status = Status.Resolved;
        emit MarketResolved(marketId, m.winMask, fee, profitPool);
    }

    /// @notice Voids any still-open market at or after its resolution deadline.
    function voidExpired(uint256 marketId) external {
        Market storage m = _market(marketId);
        _requireOpen(m);
        if (block.timestamp < m.params.resolveDeadline) revert VoidUnavailable();
        _void(marketId, m, VoidReason.Expired);
    }

    /// @notice Voids a closed market with fewer than two funded outcomes.
    function voidUnderfunded(uint256 marketId) external {
        Market storage m = _market(marketId);
        _requireOpen(m);
        if (block.timestamp < m.params.closeTime || m.fundedOutcomes >= 2) revert VoidUnavailable();
        _void(marketId, m, VoidReason.Underfunded);
    }

    /// @notice The immutable market operator can cancel only before betting closes.
    function cancel(uint256 marketId) external {
        Market storage m = _market(marketId);
        _requireBetting(m);
        if (msg.sender != m.params.operator) revert Unauthorized();
        _void(marketId, m, VoidReason.Cancelled);
    }

    /// @notice Claims once for a bettor, always paying that bettor, never the relayer.
    function claim(uint256 marketId, address bettor) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status == Status.Open) revert NotTerminal();
        uint256 payout = _previewClaim(marketId, m, bettor);
        if (payout == 0) revert NothingToClaim();
        claimed[marketId][bettor] = true;
        if (m.status == Status.Resolved) {
            for (uint8 i; i < m.params.outcomeCount; ++i) {
                if (m.winning[i]) {
                    m.claimedStake[i] = _add128(m.claimedStake[i], _stakes[marketId][bettor][i]);
                }
            }
        }
        IERC20(m.params.token).safeTransfer(bettor, payout);
        emit Claimed(marketId, bettor, payout);
    }

    /// @notice Anyone can relay the fee claim; only the immutable operator receives it.
    function claimFee(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        if (m.status != Status.Resolved || m.feeClaimed || m.fee == 0) revert NoFee();
        m.feeClaimed = true;
        IERC20(m.params.token).safeTransfer(m.params.operator, m.fee);
        emit FeeClaimed(marketId, m.params.operator, m.fee);
    }

    /// @notice Returns all immutable parameters and market accounting/report state.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function poolOf(uint256 marketId, uint8 outcome) external view returns (uint128) {
        Market storage m = _market(marketId);
        if (outcome >= m.params.outcomeCount) revert InvalidOutcome();
        return m.pools[outcome];
    }

    function stakeOf(uint256 marketId, address bettor, uint8 outcome) external view returns (uint128) {
        Market storage m = _market(marketId);
        if (outcome >= m.params.outcomeCount) revert InvalidOutcome();
        return _stakes[marketId][bettor][outcome];
    }

    function isExcluded(uint256 marketId, address account) external view returns (bool) {
        _market(marketId);
        return _excluded[marketId][account];
    }

    /// @notice Hypothetical sole-winning-outcome payout, not a guaranteed final payout.
    /// @dev A quote does not check timing, eligibility or caps; zero amounts are rejected.
    function projectedPayout(uint256 marketId, uint8 outcome, uint128 amount) external view returns (uint256) {
        Market storage m = _market(marketId);
        if (outcome >= m.params.outcomeCount) revert InvalidOutcome();
        if (amount == 0) revert InvalidAmount();
        return _projectedPayout(m, outcome, amount);
    }

    /// @notice Returns zero while open, after claiming, or for a bettor with no payout.
    /// @dev Cumulative rounding uses current claimedStake; this is not a locked quote.
    function previewClaim(uint256 marketId, address bettor) external view returns (uint256) {
        Market storage m = _market(marketId);
        return _previewClaim(marketId, m, bettor);
    }

    /// @notice Exact EIP-3009 nonce to sign at the selected token; no market lookup needed.
    function nonceFor(
        uint256 marketId,
        uint8 outcome,
        uint128 amount,
        uint128 minPayout,
        address bettor,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), marketId, outcome, amount, minPayout, bettor, salt));
    }

    function _projectedPayout(Market storage m, uint8 outcome, uint128 amount) private view returns (uint256) {
        uint256 otherPools = uint256(m.totalPool) - m.pools[outcome];
        uint256 profit = otherPools - Math.mulDiv(otherPools, m.params.feeBps, 10_000) + m.bonus;
        return uint256(amount) + Math.mulDiv(profit, amount, uint256(m.pools[outcome]) + amount);
    }

    function _previewClaim(uint256 marketId, Market storage m, address bettor) private view returns (uint256 payout) {
        if (claimed[marketId][bettor] || m.status == Status.Open) return 0;
        if (m.status == Status.Void) return totalStake[marketId][bettor];
        for (uint8 i; i < m.params.outcomeCount; ++i) {
            uint128 stake = _stakes[marketId][bettor][i];
            if (!m.winning[i] || stake == 0) continue;
            uint256 already = m.claimedStake[i];
            payout += uint256(stake)
                + Math.mulDiv(m.slices[i], already + stake, m.pools[i])
                - Math.mulDiv(m.slices[i], already, m.pools[i]);
        }
    }

    function _market(uint256 marketId) private view returns (Market storage m) {
        if (marketId == 0 || marketId >= nextMarketId) revert InvalidMarket();
        return _markets[marketId];
    }

    function _requireOpen(Market storage m) private view {
        if (m.status != Status.Open) revert NotOpen();
    }

    function _requireBetting(Market storage m) private view {
        _requireOpen(m);
        if (block.timestamp >= m.params.closeTime) revert BettingClosed();
    }

    function _void(uint256 marketId, Market storage m, VoidReason reason) private {
        m.status = Status.Void;
        emit MarketVoided(marketId, reason);
    }

    function _add128(uint128 a, uint128 b) private pure returns (uint128) {
        uint256 sum = uint256(a) + b;
        if (sum > type(uint128).max) revert AmountTooLarge();
        return uint128(sum);
    }
}
