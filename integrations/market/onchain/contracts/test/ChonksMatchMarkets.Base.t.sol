// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChonksMatchMarkets} from "../ChonksMatchMarkets.sol";
import {MockEIP3009Token} from "./mocks/MockEIP3009Token.sol";

abstract contract ChonksTestBase is Test {
    ChonksMatchMarkets internal mkt;
    MockEIP3009Token internal usdc;
    MockEIP3009Token internal eurc;

    address internal operator = makeAddr("operator");
    address internal reporterA = makeAddr("reporterA");
    address internal verifierB = makeAddr("verifierB");
    address internal excl = makeAddr("excluded");
    address internal relayer = makeAddr("relayer");
    address internal sponsor = makeAddr("sponsor");

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant CLOSE = T0 + 1000;
    uint256 internal constant DEADLINE = T0 + 2000;
    uint256 internal constant LIVENESS = 60;
    bytes32 internal constant HASH = keccak256("result");

    struct Bet {
        uint256 mid;
        uint8 outcome;
        uint128 amount;
        uint128 minPayout;
        address bettor;
        uint256 pk;
        bytes32 salt;
        uint256 validBefore;
    }

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockEIP3009Token("Mock USDC", "USDC");
        eurc = new MockEIP3009Token("Mock EURC", "EURC");
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(eurc);
        mkt = new ChonksMatchMarkets(tokens);
    }

    // ---------- market helpers ----------

    function _params() internal view returns (ChonksMatchMarkets.MarketParams memory p) {
        p.token = address(usdc);
        p.operator = operator;
        p.outcomeCount = 3;
        p.closeTime = uint64(CLOSE);
        p.resolveDeadline = uint64(DEADLINE);
        p.liveness = uint32(LIVENESS);
        p.feeBps = 200;
        p.minBet = 1;
        p.perUserCap = 1_000e6;
        p.poolCap = 10_000e6;
        p.reporterA = reporterA;
        p.verifierB = verifierB;
        p.excluded = new address[](1);
        p.excluded[0] = excl;
    }

    function _create() internal returns (uint256) {
        return mkt.createMarket(_params());
    }

    function _report(uint256 mid, uint8 mask) internal {
        vm.prank(reporterA);
        mkt.reportResult(mid, HASH, mask);
        vm.prank(verifierB);
        mkt.reportResult(mid, HASH, mask);
    }

    /// @dev warp to close, matching reports, wait out liveness, finalize.
    function _resolve(uint256 mid, uint8 mask) internal {
        vm.warp(CLOSE);
        _report(mid, mask);
        vm.warp(CLOSE + LIVENESS);
        mkt.finalize(mid);
    }

    // ---------- signing helpers ----------

    function _actor(uint256 i) internal pure returns (address a, uint256 pk) {
        pk = 0xB0B0 + i;
        a = vm.addr(pk);
    }

    function _sign(uint256 pk, address from, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, address(mkt), value, uint256(0), validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function _newBet(uint256 mid, uint256 actorIdx, uint8 outcome, uint128 amount) internal pure returns (Bet memory b) {
        b.mid = mid;
        b.outcome = outcome;
        b.amount = amount;
        (b.bettor, b.pk) = _actor(actorIdx);
        b.salt = keccak256(abi.encode(actorIdx, outcome, amount));
        b.validBefore = CLOSE;
    }

    function _signBet(Bet memory b) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 nonce = mkt.nonceFor(b.mid, b.outcome, b.amount, b.minPayout, b.bettor, b.salt);
        (v, r, s) = _sign(b.pk, b.bettor, b.amount, b.validBefore, nonce);
    }

    function _submit(Bet memory b) internal {
        (uint8 v, bytes32 r, bytes32 s) = _signBet(b);
        mkt.placeBet(b.mid, b.outcome, b.amount, b.minPayout, b.bettor, 0, b.validBefore, b.salt, v, r, s);
    }

    function _submitExpectRevert(Bet memory b, bytes4 sel) internal {
        (uint8 v, bytes32 r, bytes32 s) = _signBet(b); // external calls first, then arm expectRevert
        vm.expectRevert(sel);
        mkt.placeBet(b.mid, b.outcome, b.amount, b.minPayout, b.bettor, 0, b.validBefore, b.salt, v, r, s);
    }

    /// @dev mint + sign + relay a bet from actor `idx`.
    function _place(uint256 mid, uint256 idx, uint8 outcome, uint128 amount) internal returns (address who) {
        Bet memory b = _newBet(mid, idx, outcome, amount);
        usdc.mint(b.bettor, amount);
        _submit(b);
        who = b.bettor;
    }
}
