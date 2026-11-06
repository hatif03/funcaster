// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ChonksMatchMarkets} from "../ChonksMatchMarkets.sol";
import {ChonksTestBase} from "./ChonksMatchMarkets.Base.t.sol";

contract ChonksMatchMarketsReportersTest is ChonksTestBase {
    function _expectExcludedBet(uint256 mid, address who) internal {
        Bet memory b = _newBet(mid, 1, 0, 10e6);
        b.bettor = who; // exclusion is checked before the token signature
        (uint8 v, bytes32 r, bytes32 s) = _signBet(b);
        vm.expectRevert(ChonksMatchMarkets.ExcludedBettor.selector);
        mkt.placeBet(mid, 0, 10e6, 0, who, 0, b.validBefore, b.salt, v, r, s);
    }

    function test_ReportersAutomaticallyExcluded_EvenWhenNotListed() public {
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.excluded = new address[](0);
        uint256 mid = mkt.createMarket(p);

        assertTrue(mkt.isExcluded(mid, reporterA));
        assertTrue(mkt.isExcluded(mid, verifierB));
        (address ok,) = _actor(1);
        assertFalse(mkt.isExcluded(mid, ok));

        _expectExcludedBet(mid, reporterA);
        _expectExcludedBet(mid, verifierB);

        // an ordinary bettor is unaffected
        _place(mid, 1, 0, 10e6);
        assertEq(mkt.poolOf(mid, 0), 10e6);
    }

    function test_ReportersExcluded_AlongsideExplicitList() public {
        uint256 mid = _create(); // p.excluded = [excl]
        assertTrue(mkt.isExcluded(mid, excl));
        assertTrue(mkt.isExcluded(mid, reporterA));
        assertTrue(mkt.isExcluded(mid, verifierB));
        _expectExcludedBet(mid, reporterA);
        _expectExcludedBet(mid, verifierB);
        _expectExcludedBet(mid, excl);
    }

    function test_ReporterExclusionIsPerMarket() public {
        uint256 mid1 = _create();
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.reporterA = makeAddr("otherA");
        p.verifierB = makeAddr("otherB");
        uint256 mid2 = mkt.createMarket(p);
        assertTrue(mkt.isExcluded(mid1, reporterA));
        assertFalse(mkt.isExcluded(mid2, reporterA));
        assertTrue(mkt.isExcluded(mid2, p.reporterA));
        assertTrue(mkt.isExcluded(mid2, p.verifierB));
    }

    // Two tied winning outcomes, non-zero fee, odd amounts and a bonus: nothing may be left over.
    function test_ClaimSolvency_TiedWinnersBonusAndFee() public {
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.feeBps = 250;
        uint256 mid = mkt.createMarket(p);

        address[5] memory winners;
        winners[0] = _place(mid, 1, 0, 30_000_001);
        winners[1] = _place(mid, 2, 0, 17_333_333);
        winners[2] = _place(mid, 3, 0, 1_234_567);
        winners[3] = _place(mid, 4, 1, 20_000_003);
        winners[4] = _place(mid, 5, 1, 7_777_777);
        address loser1 = _place(mid, 6, 2, 40_000_009);
        address loser2 = _place(mid, 7, 2, 6_543_211);

        usdc.mint(sponsor, 3_333_337);
        vm.startPrank(sponsor);
        usdc.approve(address(mkt), 3_333_337);
        mkt.fundBonus(mid, 3_333_337);
        vm.stopPrank();

        ChonksMatchMarkets.Market memory m0 = mkt.getMarket(mid);
        uint256 totalIn = uint256(m0.totalPool) + m0.bonus;
        assertEq(usdc.balanceOf(address(mkt)), totalIn);

        _resolve(mid, 3); // outcomes 0 and 1 tied winners
        assertGt(mkt.getMarket(mid).fee, 0, "fee non-zero");

        uint256 sum;
        // claim in an irregular order, some via relayer
        uint8[5] memory order = [3, 0, 4, 2, 1];
        for (uint256 i; i < 5; ++i) {
            address w = winners[order[i]];
            vm.prank(relayer);
            mkt.claim(mid, w);
            sum += usdc.balanceOf(w);
        }
        assertEq(usdc.balanceOf(relayer), 0);

        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(mid, loser1);
        vm.expectRevert(ChonksMatchMarkets.NothingToClaim.selector);
        mkt.claim(mid, loser2);

        vm.prank(relayer);
        mkt.claimFee(mid);
        uint256 fee = usdc.balanceOf(operator);
        assertEq(fee, mkt.getMarket(mid).fee);
        sum += fee;

        assertEq(sum, totalIn, "claims + fee != pool + bonus");
        assertEq(usdc.balanceOf(address(mkt)), 0, "dust left");
    }
}
