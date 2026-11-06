// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IConditionalPot
/// @notice Interface of a generic, reusable, no-admin "conditional multi-party pot":
///         2 to 4 parties each lock an equal stake of one ERC-20 asset; the pot pays out by a
///         fixed rule once the parties agree on a placing (or an oracle proposal survives a
///         challenge window), and otherwise refunds every funded stake.
/// @dev    One ABI for the relay, the console and the tests. Amounts are in base units of a
///         six-decimal asset. All timestamps are unix seconds.
interface IConditionalPot {
    // ---------------------------------------------------------------- types

    /// @notice How the total is split among tiers of the final placing.
    /// WINNER_TAKES_ALL and EQUAL_AMONG_TOP share the same arithmetic: everything is split
    /// equally among the seats that placed 1st. TOP2_70_30 pays 70% to place 1 and 30% to place 2,
    /// ties within a place share that place's amount, and if every seat ties the pot is split equally.
    enum Rule {
        WINNER_TAKES_ALL,
        TOP2_70_30,
        EQUAL_AMONG_TOP
    }

    /// @notice Pot lifecycle. None -> Funding -> Locked -> Proposed -> Settled;
    ///         Funding/Locked -> Refunded (after the relevant deadline); Proposed -> Contested -> Refunded.
    ///         An uncontested Proposed pot is never refunded by deadline: it stays finalizable after
    ///         `settleDeadline` once its challenge window ends.
    enum State {
        None,
        Funding,
        Locked,
        Proposed,
        Contested,
        Settled,
        Refunded
    }

    /// @notice Why a pot was refunded.
    enum RefundReason {
        FundingExpired,
        SettleExpired,
        Contested
    }

    /// @notice Terms fixed at creation.
    /// @param asset            One of the contract's immutable allowed assets.
    /// @param stake            Equal stake per seat, base units, 1..type(uint256).max / seats.length
    ///                         (so the full pot, stake * seats, never overflows).
    /// @param seats            2 to 4 distinct non-zero addresses. Index = seat number.
    /// @param rule             Payout rule.
    /// @param oracle           Address allowed to `propose` (address(0) = no oracle).
    /// @param fundDeadline     Funding is refused at/after this time; refund is allowed at/after it.
    /// @param settleDeadline   Cooperative settlement and oracle proposals are refused at/after this
    ///                         time; a refund of a locked, unproposed pot is allowed at/after it.
    /// @param challengeWindow  Seconds a proposal can be contested; at least 60.
    /// @param minPlaySeconds   Seconds after the pot locks before the oracle may propose; > 0.
    /// @param metadataHash     Opaque commitment to off-chain terms (game rules, rulebook version).
    ///                         It is folded into the canonical `termsHash` the seats sign.
    struct CreateParams {
        address asset;
        uint256 stake;
        address[] seats;
        Rule rule;
        address oracle;
        uint64 fundDeadline;
        uint64 settleDeadline;
        uint32 challengeWindow;
        uint32 minPlaySeconds;
        bytes32 metadataHash;
    }

    /// @notice An oracle proposal.
    struct Proposal {
        bytes32 placesHash;
        bytes32 resultHash;
        uint64 at;
    }

    /// @notice Full public state of a pot.
    /// @dev `total` is the full pot size, stake * seats.length. Bit i of the bitmaps is seat i.
    ///      `termsHash` is the canonical hash of every executable parameter (see `hashTerms`); it is
    ///      what each seat signs in Accept(potId, termsHash).
    struct PotView {
        address asset;
        uint256 stake;
        address[] seats;
        uint8 fundedBitmap;
        uint8 acceptedBitmap;
        Rule rule;
        address oracle;
        uint64 fundDeadline;
        uint64 settleDeadline;
        uint32 challengeWindow;
        uint32 minPlaySeconds;
        uint64 lockedAt;
        bytes32 metadataHash;
        bytes32 termsHash;
        State state;
        Proposal proposal;
        uint256 total;
    }

    // --------------------------------------------------------------- events

    event Created(
        bytes32 indexed potId,
        address indexed asset,
        uint256 stake,
        address[] seats,
        Rule rule,
        address oracle,
        uint64 fundDeadline,
        uint64 settleDeadline,
        uint32 challengeWindow,
        uint32 minPlaySeconds,
        bytes32 metadataHash,
        bytes32 termsHash
    );
    event Funded(bytes32 indexed potId, address indexed seat, uint8 seatIndex, uint256 amount);
    event Locked(bytes32 indexed potId, uint64 lockedAt);
    event Proposed(bytes32 indexed potId, bytes32 placesHash, bytes32 resultHash, uint8[] places, uint64 challengeEnds);
    event Contested(bytes32 indexed potId, address indexed seat);
    /// @param method "cooperative" or "oracle".
    event Settled(bytes32 indexed potId, bytes32 placesHash, string method);
    event Refunded(bytes32 indexed potId, RefundReason reason);
    event Claimed(bytes32 indexed potId, address indexed seat, uint256 amount);

    // --------------------------------------------------------------- errors

    // constructor
    error BadAssetList();
    error BadDecimals(address asset);
    // create
    error PotExists();
    error AssetNotAllowed(address asset);
    error BadSeatCount();
    error ZeroSeat();
    error DuplicateSeat();
    error ZeroStake();
    error StakeTooLarge();
    error BadDeadlines();
    error WindowTooShort();
    error BadMinPlay();
    // general
    error UnknownPot();
    error WrongState(State actual);
    error NotASeat();
    /// @param signer The seat whose signature failed verification.
    error BadSignature(address signer);
    // funding
    error AlreadyFunded();
    /// @param expected The nonce the pot requires: fundingNonce(potId, seat).
    error BadNonce(bytes32 expected);
    error AuthorizationTooLong();
    error FundingClosed();
    error BalanceDeltaMismatch(uint256 expected, uint256 received);
    error RetainedBalanceTooLow(uint256 balance, uint256 minimum);
    // settlement
    error BadPlaces();
    error WrongSignatureCount();
    error SettlementClosed();
    error NotOracle();
    error TooEarly();
    error ChallengeOpen();
    error ChallengeClosed();
    error PlacesMismatch();
    // refund / claim
    error NotRefundable();
    error NothingToClaim();

    // ---------------------------------------------------------- state changes

    /// @notice Create a pot with a relayer-supplied id. Reverts if the id exists.
    /// @dev The contract derives `termsHash` on-chain from the id and EVERY parameter, so a creator
    ///      who front-runs a creation with different seats, oracle, rule or deadlines produces a
    ///      different termsHash and the seats' Accept signatures do not verify against it.
    function create(bytes32 potId, CreateParams calldata params) external;

    /// @notice Fund one seat. Verifies the seat's Accept(potId, termsHash), pulls `stake` with the
    ///         asset's payee-only receiveWithAuthorization (bytes-signature overload), checks the
    ///         balance delta equals `stake` and that the seat keeps at least MIN_RETAINED_BALANCE.
    /// @dev `nonce` must equal fundingNonce(potId, seat). `validBefore` must be <= fundDeadline.
    function fundWithAuthorization(
        bytes32 potId,
        address seat,
        bytes calldata acceptSig,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata authSig
    ) external;

    /// @notice Settle with one valid Settle(potId, placesHash) signature from every seat, in seat order.
    function settleCooperative(bytes32 potId, uint8[] calldata places, bytes[] calldata sigs) external;

    /// @notice The pot's oracle proposes a placing; starts the challenge window.
    function propose(bytes32 potId, uint8[] calldata places, bytes32 resultHash) external;

    /// @notice Any seat can freeze a proposal with a signed Contest(potId) during the window.
    function contestWithSig(bytes32 potId, address seat, bytes calldata sig) external;

    /// @notice After the window, anyone finalizes the proposal by revealing the proposed places.
    function finalize(bytes32 potId, uint8[] calldata places) external;

    /// @notice Permissionless refund of every funded stake.
    function refund(bytes32 potId) external;

    /// @notice Pull payout. Zeroes the seat's claimable first, then transfers to `seat`.
    function claim(bytes32 potId, address seat) external;

    // ------------------------------------------------------------------ views

    function getPot(bytes32 potId) external view returns (PotView memory);
    function claimableOf(bytes32 potId, address seat) external view returns (uint256);
    function isAllowedAsset(address asset) external view returns (bool);
    function allowedAssets() external view returns (address[] memory);

    /// @notice Canonical terms hash the seats sign. With
    ///         seatsHash = keccak256(abi.encodePacked(seats)),
    ///         head = keccak256(abi.encode(TERMS_HEAD_TYPEHASH, potId, asset, stake, seatsHash, uint8(rule))),
    ///         tail = keccak256(abi.encode(TERMS_TAIL_TYPEHASH, oracle, fundDeadline, settleDeadline,
    ///                                     challengeWindow, minPlaySeconds, metadataHash)),
    ///         termsHash = keccak256(abi.encode(TERMS_TYPEHASH, head, tail)).
    function hashTerms(bytes32 potId, CreateParams calldata params) external pure returns (bytes32);
    /// @notice keccak256(abi.encode("chonks-fund", potId, seat)).
    function fundingNonce(bytes32 potId, address seat) external pure returns (bytes32);
    /// @notice keccak256(abi.encode(places)) where places is a uint8[].
    function hashPlaces(uint8[] calldata places) external pure returns (bytes32);
    /// @notice EIP-712 digests seats sign (domain: ChonksPot / 1 / chainId / this contract).
    function acceptDigest(bytes32 potId, bytes32 termsHash) external view returns (bytes32);
    function settleDigest(bytes32 potId, bytes32 placesHash) external view returns (bytes32);
    function contestDigest(bytes32 potId) external view returns (bytes32);

    /// @notice Minimum base units a seat must still hold after funding (0.05 of a six-decimal asset).
    function MIN_RETAINED_BALANCE() external view returns (uint256);
    /// @notice Minimum challenge window in seconds (60).
    function MIN_CHALLENGE_WINDOW() external view returns (uint256);
}
