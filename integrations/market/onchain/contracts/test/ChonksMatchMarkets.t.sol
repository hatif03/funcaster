// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ChonksMatchMarkets} from "../ChonksMatchMarkets.sol";
import {ChonksTestBase} from "./ChonksMatchMarkets.Base.t.sol";

contract ChonksMatchMarketsTest is ChonksTestBase {
    uint256 internal mid;

    function setUp() public override {
        super.setUp();
        mid = _create();
    }

    // 1. normal winner, 60/30/10, fee 2%
    function test_NormalWinner_PayoutFeeAndZeroDust() public {
        _place(mid, 1, 0, 60e6);
        _place(mid, 2, 1, 30e6);
        address winner = _place(mid, 3, 2, 10e6);

        // quote 10 more on outcome 2 with pools 60/30/10
        assertEq(mkt.projectedPayout(mid, 2, 10e6), 54_100_000);
        assertEq(usdc.balanceOf(address(mkt)), 100e6);

        _resolve(mid, 4);
        assertEq(mkt.previewClaim(mid, winner), 98_200_000);

        mkt.claim(mid, winner);
        assertEq(usdc.balanceOf(winner), 98_200_000);

        uint256 opBefore = usdc.balanceOf(operator);
        vm.prank(relayer);
        mkt.claimFee(mid);
        assertEq(usdc.balanceOf(operator) - opBefore, 1_800_000);
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(usdc.balanceOf(address(mkt)), 0, "dust left");
    }

    function test_ProjectedPayout_BeforeWinnerBetOnEmptyOutcome() public {
        _place(mid, 1, 0, 60e6);
        _place(mid, 2, 1, 30e6);
        // 10 on empty outcome 2: other=90, profit=88.2 => 10 + 88.2
        assertEq(mkt.projectedPayout(mid, 2, 10e6), 98_200_000);
    }

    // 2. tied winners stake-protection
    function test_TiedWinners_StakeProtected() public {
        address a = _place(mid, 1, 0, 60e6);
        address b = _place(mid, 2, 1, 20e6);
        address c = _place(mid, 3, 2, 20e6);
        _resolve(mid, 3);

        mkt.claim(mid, a);
        mkt.claim(mid, b);
        assertEq(usdc.balanceOf(a), 69_800_000);
        assertEq(usdc.balanceOf(b), 29_800_000);

        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(mid, c);

        mkt.claimFee(mid);
        assertEq(usdc.balanceOf(operator), 400_000);
        assertEq(usdc.balanceOf(address(mkt)), 0);
    }

    // 3. rounding vector with bonus
    function test_RoundingVector_ExactPayoutsNoDust() public {
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.outcomeCount = 2;
        p.feeBps = 0;
        uint256 id = mkt.createMarket(p);

        address a1 = _place(id, 1, 0, 10_000_001);
        address a2 = _place(id, 2, 0, 10_000_001);
        address a3 = _place(id, 3, 0, 13_333_331);
        address loser = _place(id, 4, 1, 66_666_667);

        usdc.mint(sponsor, 10e6);
        vm.startPrank(sponsor);
        usdc.approve(address(mkt), 10e6);
        mkt.fundBonus(id, 10e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(mkt)), 110e6);

        _resolve(id, 1);

        mkt.claim(id, a1);
        mkt.claim(id, a2);
        mkt.claim(id, a3);
        assertEq(usdc.balanceOf(a1), 33_000_003);
        assertEq(usdc.balanceOf(a2), 33_000_004);
        assertEq(usdc.balanceOf(a3), 43_999_993);

        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(id, loser);
        assertEq(usdc.balanceOf(address(mkt)), 0, "dust left");
    }

    // 4. one-sided market
    function test_OneSided_VoidUnderfundedRefundsStake() public {
        address a = _place(mid, 1, 0, 7e6);
        address b = _place(mid, 2, 0, 3e6);

        vm.warp(CLOSE);
        vm.prank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.Underfunded.selector);
        mkt.reportResult(mid, HASH, 1);
        vm.prank(verifierB);
        vm.expectRevert(ChonksMatchMarkets.Underfunded.selector);
        mkt.reportResult(mid, HASH, 1);

        mkt.voidUnderfunded(mid);
        mkt.claim(mid, a);
        mkt.claim(mid, b);
        assertEq(usdc.balanceOf(a), 7e6);
        assertEq(usdc.balanceOf(b), 3e6);
        assertEq(usdc.balanceOf(address(mkt)), 0);
    }

    // 5. disagreement => expiry void with bonus refund
    function test_Disagreement_ExpiresAndRefundsEveryone() public {
        address a = _place(mid, 1, 0, 40e6);
        address b = _place(mid, 2, 1, 25e6);
        usdc.mint(sponsor, 5e6);
        vm.startPrank(sponsor);
        usdc.approve(address(mkt), 5e6);
        mkt.fundBonus(mid, 5e6);
        vm.stopPrank();

        vm.warp(CLOSE);
        vm.prank(reporterA);
        mkt.reportResult(mid, keccak256("A"), 1);
        vm.prank(verifierB);
        mkt.reportResult(mid, keccak256("B"), 1);

        vm.warp(CLOSE + LIVENESS + 1);
        vm.expectRevert(ChonksMatchMarkets.FinalizationUnavailable.selector);
        mkt.finalize(mid);

        vm.warp(DEADLINE - 1);
        vm.expectRevert(ChonksMatchMarkets.VoidUnavailable.selector);
        mkt.voidExpired(mid);

        vm.warp(DEADLINE);
        mkt.voidExpired(mid);

        mkt.claim(mid, a);
        mkt.claim(mid, b);
        assertEq(usdc.balanceOf(a), 40e6);
        assertEq(usdc.balanceOf(b), 25e6);

        // only the sponsor is refunded, even if relayed; non-sponsors get nothing
        vm.prank(relayer);
        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.refundBonus(mid, relayer);
        vm.prank(relayer);
        mkt.refundBonus(mid, sponsor);
        assertEq(usdc.balanceOf(sponsor), 5e6);
        assertEq(usdc.balanceOf(relayer), 0);
        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.refundBonus(mid, sponsor);
        assertEq(usdc.balanceOf(address(mkt)), 0);
    }

    // 6. excluded bettor
    function test_ExcludedBettorCannotBet() public {
        Bet memory b = _newBet(mid, 1, 0, 10e6);
        b.bettor = excl; // not signed by excl, but exclusion check runs first
        (uint8 v, bytes32 r, bytes32 s) = _signBet(b);
        vm.expectRevert(ChonksMatchMarkets.ExcludedBettor.selector);
        mkt.placeBet(mid, 0, 10e6, 0, excl, 0, b.validBefore, b.salt, v, r, s);
        assertTrue(mkt.isExcluded(mid, excl));
    }

    // 7. exact close boundaries
    function test_BetAtCloseTimeRejected() public {
        Bet memory b = _newBet(mid, 1, 0, 10e6);
        usdc.mint(b.bettor, 10e6);
        vm.warp(CLOSE);
        _submitExpectRevert(b, ChonksMatchMarkets.BettingClosed.selector);
    }

    function test_BetOneSecondBeforeCloseSucceeds() public {
        Bet memory b = _newBet(mid, 1, 0, 10e6);
        usdc.mint(b.bettor, 10e6);
        vm.warp(CLOSE - 1);
        _submit(b);
        assertEq(mkt.poolOf(mid, 0), 10e6);
        assertEq(mkt.stakeOf(mid, b.bettor, 0), 10e6);
    }

    function test_ValidBeforePastCloseRejected() public {
        Bet memory b = _newBet(mid, 1, 0, 10e6);
        b.validBefore = CLOSE + 1;
        usdc.mint(b.bettor, 10e6);
        _submitExpectRevert(b, ChonksMatchMarkets.InvalidAuthorizationWindow.selector);
    }

    // 8. nonce binds every field
    function _expectTampered(Bet memory orig, Bet memory alt) internal {
        (uint8 v, bytes32 r, bytes32 s) = _signBet(orig);
        vm.expectRevert(bytes("EIP712: invalid signature"));
        mkt.placeBet(alt.mid, alt.outcome, alt.amount, alt.minPayout, alt.bettor, 0, alt.validBefore, alt.salt, v, r, s);
    }

    function test_AlteredAmountFailsAtToken() public {
        Bet memory orig = _newBet(mid, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        alt.amount = 5e6;
        _expectTampered(orig, alt);
    }

    function test_AlteredOutcomeFailsAtToken() public {
        Bet memory orig = _newBet(mid, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        alt.outcome = 1;
        _expectTampered(orig, alt);
    }

    function test_AlteredMinPayoutFailsAtToken() public {
        Bet memory orig = _newBet(mid, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        alt.minPayout = 1;
        _expectTampered(orig, alt);
    }

    function test_AlteredSaltFailsAtToken() public {
        Bet memory orig = _newBet(mid, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        alt.salt = keccak256("other");
        _expectTampered(orig, alt);
    }

    function test_AlteredBettorFailsAtToken() public {
        Bet memory orig = _newBet(mid, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        (alt.bettor,) = _actor(2);
        usdc.mint(alt.bettor, 10e6);
        _expectTampered(orig, alt);
    }

    function test_SignatureForOtherMarketFails() public {
        uint256 mid2 = _create();
        Bet memory orig = _newBet(mid2, 1, 0, 10e6);
        usdc.mint(orig.bettor, 10e6);
        Bet memory alt = _newBet(mid, 1, 0, 10e6);
        _expectTampered(orig, alt);
        // and the signature works for the market it was made for
        _submit(orig);
        assertEq(mkt.poolOf(mid2, 0), 10e6);
    }

    // 9. minimum payout
    function test_MinPayout_AboveProjectedReverts_EqualSucceeds() public {
        _place(mid, 1, 0, 10e6);
        _place(mid, 2, 1, 10e6);

        uint256 proj = mkt.projectedPayout(mid, 0, 10e6);
        assertEq(proj, 14_900_000);

        Bet memory b = _newBet(mid, 3, 0, 10e6);
        usdc.mint(b.bettor, 10e6);
        b.minPayout = uint128(proj + 1);
        _submitExpectRevert(b, ChonksMatchMarkets.PayoutBelowMin.selector);

        b.minPayout = uint128(proj);
        _submit(b);
        assertEq(mkt.stakeOf(mid, b.bettor, 0), 10e6);
    }

    // 10. repeated / relayed claims
    function test_ClaimTwiceReverts_RelayerCannotRedirect() public {
        address a = _place(mid, 1, 0, 60e6);
        _place(mid, 2, 1, 20e6);
        _resolve(mid, 1);

        vm.prank(relayer);
        mkt.claim(mid, a);
        assertEq(usdc.balanceOf(a), 60e6 + 19_600_000);
        assertEq(usdc.balanceOf(relayer), 0);
        assertTrue(mkt.claimed(mid, a));

        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(mid, a);
        vm.prank(relayer);
        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(mid, a);
        assertEq(mkt.previewClaim(mid, a), 0);
    }
}
