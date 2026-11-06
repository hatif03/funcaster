// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ChonksMatchMarkets} from "../ChonksMatchMarkets.sol";
import {ChonksTestBase} from "./ChonksMatchMarkets.Base.t.sol";

contract ChonksMatchMarketsExtrasTest is ChonksTestBase {
    uint256 internal mid;
    address internal a;
    address internal b;

    function setUp() public override {
        super.setUp();
        mid = _create();
        a = _place(mid, 1, 0, 30e6);
        b = _place(mid, 2, 1, 20e6);
    }

    function _status(uint256 id) internal view returns (uint256) {
        return uint256(mkt.getMarket(id).status);
    }

    // ---------- veto ----------

    function test_VerifierVetoDuringLivenessVoidsMarket() public {
        vm.warp(CLOSE);
        _report(mid, 1);
        vm.prank(verifierB);
        mkt.vetoByVerifier(mid);
        assertEq(_status(mid), 2);
        mkt.claim(mid, a);
        mkt.claim(mid, b);
        assertEq(usdc.balanceOf(a), 30e6);
        assertEq(usdc.balanceOf(b), 20e6);
    }

    function test_ReporterACannotVeto() public {
        vm.warp(CLOSE);
        _report(mid, 1);
        vm.prank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.Unauthorized.selector);
        mkt.vetoByVerifier(mid);
    }

    function test_VetoUnavailableWithoutMatchOrAfterLiveness() public {
        vm.warp(CLOSE);
        vm.prank(verifierB);
        vm.expectRevert(ChonksMatchMarkets.VetoUnavailable.selector);
        mkt.vetoByVerifier(mid);

        _report(mid, 1);
        vm.warp(CLOSE + LIVENESS);
        vm.prank(verifierB);
        vm.expectRevert(ChonksMatchMarkets.VetoUnavailable.selector);
        mkt.vetoByVerifier(mid);
    }

    // ---------- finalize / expiry ----------

    function test_FinalizeBeforeLivenessReverts() public {
        vm.warp(CLOSE);
        _report(mid, 1);
        vm.warp(CLOSE + LIVENESS - 1);
        vm.expectRevert(ChonksMatchMarkets.FinalizationUnavailable.selector);
        mkt.finalize(mid);
    }

    function test_FinalizeAtDeadlineRevertsAndVoidExpiredWorks() public {
        vm.warp(CLOSE);
        _report(mid, 1);
        vm.warp(DEADLINE);
        vm.expectRevert(ChonksMatchMarkets.FinalizationUnavailable.selector);
        mkt.finalize(mid);
        mkt.voidExpired(mid);
        assertEq(_status(mid), 2);
        mkt.claim(mid, a);
        assertEq(usdc.balanceOf(a), 30e6);
    }

    function test_FinalizeOneSecondBeforeDeadlineWorks() public {
        vm.warp(DEADLINE - LIVENESS - 1);
        _report(mid, 1);
        vm.warp(DEADLINE - 1);
        mkt.finalize(mid);
        assertEq(_status(mid), 1);
    }

    function test_UnbackedWinnerMaskVoidsAtFinalize() public {
        _resolve(mid, 4); // outcome 2 has no stake
        assertEq(_status(mid), 2);
        mkt.claim(mid, a);
        mkt.claim(mid, b);
        assertEq(usdc.balanceOf(a), 30e6);
        assertEq(usdc.balanceOf(b), 20e6);
        assertEq(usdc.balanceOf(address(mkt)), 0);
    }

    // ---------- cancel ----------

    function test_OperatorCancelBeforeCloseWorks() public {
        vm.prank(operator);
        mkt.cancel(mid);
        assertEq(_status(mid), 2);
        mkt.claim(mid, a);
        assertEq(usdc.balanceOf(a), 30e6);
    }

    function test_NonOperatorCannotCancel() public {
        vm.prank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.Unauthorized.selector);
        mkt.cancel(mid);
    }

    function test_CancelAfterCloseReverts() public {
        vm.warp(CLOSE);
        vm.prank(operator);
        vm.expectRevert(ChonksMatchMarkets.BettingClosed.selector);
        mkt.cancel(mid);
    }

    function test_VoidUnderfundedBeforeCloseOrWhenFundedReverts() public {
        vm.expectRevert(ChonksMatchMarkets.VoidUnavailable.selector);
        mkt.voidUnderfunded(mid);
        vm.warp(CLOSE);
        vm.expectRevert(ChonksMatchMarkets.VoidUnavailable.selector);
        mkt.voidUnderfunded(mid); // two funded outcomes
    }

    // ---------- reporting ----------

    function test_DuplicateReportReverts() public {
        vm.warp(CLOSE);
        vm.startPrank(reporterA);
        mkt.reportResult(mid, HASH, 1);
        vm.expectRevert(ChonksMatchMarkets.AlreadyReported.selector);
        mkt.reportResult(mid, HASH, 1);
        vm.stopPrank();
    }

    function test_InvalidWinMaskReverts() public {
        vm.warp(CLOSE);
        vm.startPrank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.InvalidWinMask.selector);
        mkt.reportResult(mid, HASH, 0);
        vm.expectRevert(ChonksMatchMarkets.InvalidWinMask.selector);
        mkt.reportResult(mid, HASH, 8); // 1 << outcomeCount(3)
        vm.expectRevert(ChonksMatchMarkets.InvalidWinMask.selector);
        mkt.reportResult(mid, HASH, 255);
        mkt.reportResult(mid, HASH, 7); // max valid mask
        vm.stopPrank();
    }

    function test_ReportWindowAndAuthorization() public {
        vm.prank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.InvalidReportWindow.selector);
        mkt.reportResult(mid, HASH, 1); // before close

        vm.warp(CLOSE);
        vm.prank(relayer);
        vm.expectRevert(ChonksMatchMarkets.Unauthorized.selector);
        mkt.reportResult(mid, HASH, 1);

        vm.warp(DEADLINE);
        vm.prank(reporterA);
        vm.expectRevert(ChonksMatchMarkets.InvalidReportWindow.selector);
        mkt.reportResult(mid, HASH, 1);
    }

    // ---------- createMarket validation ----------

    function test_CreateMarketRejectsBadParams() public {
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.verifierB = p.reporterA;
        vm.expectRevert(ChonksMatchMarkets.InvalidParameters.selector);
        mkt.createMarket(p);

        p = _params();
        p.liveness = 59;
        vm.expectRevert(ChonksMatchMarkets.InvalidParameters.selector);
        mkt.createMarket(p);

        p.liveness = 121;
        vm.expectRevert(ChonksMatchMarkets.InvalidParameters.selector);
        mkt.createMarket(p);

        p = _params();
        p.feeBps = 1001;
        vm.expectRevert(ChonksMatchMarkets.InvalidParameters.selector);
        mkt.createMarket(p);

        p = _params();
        p.resolveDeadline = uint64(CLOSE + LIVENESS);
        vm.expectRevert(ChonksMatchMarkets.InvalidParameters.selector);
        mkt.createMarket(p);
    }

    function test_CreateMarketAcceptsBoundariesAndSecondToken() public {
        ChonksMatchMarkets.MarketParams memory p = _params();
        p.liveness = 60;
        p.feeBps = 1000;
        uint256 id1 = mkt.createMarket(p);
        p.liveness = 120;
        p.token = address(eurc);
        p.resolveDeadline = uint64(CLOSE + 121);
        uint256 id2 = mkt.createMarket(p);
        assertEq(id2, id1 + 1);

        p.token = makeAddr("notAllowed");
        vm.expectRevert(ChonksMatchMarkets.InvalidToken.selector);
        mkt.createMarket(p);
    }
}
