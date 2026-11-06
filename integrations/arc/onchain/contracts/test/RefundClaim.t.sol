// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {ConditionalPot} from "../ConditionalPot.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {HostileToken} from "./mocks/MockTokens.sol";

contract RefundClaimTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;

    // ================================================================ refund

    function test_refund_unfilledFunding_refundsOnlyFundedSeats() public {
        _create(ID, 3, WTA);
        _fundSeat(ID, 0);
        _fundSeat(ID, 2);
        uint256 deadline = pot.getPot(ID).fundDeadline;
        vm.warp(deadline);
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Refunded(ID, IConditionalPot.RefundReason.FundingExpired);
        vm.prank(stranger);
        pot.refund(ID);
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Refunded));
        assertEq(pot.claimableOf(ID, players[0]), STAKE);
        assertEq(pot.claimableOf(ID, players[1]), 0);
        assertEq(pot.claimableOf(ID, players[2]), STAKE);
        assertEq(_sumClaimable(ID, 3), usdc.balanceOf(address(pot)));
    }

    function test_refund_allowedWhenNobodyFunded() public {
        _create(ID, 2, WTA);
        vm.warp(pot.getPot(ID).fundDeadline);
        pot.refund(ID);
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Refunded));
        assertEq(_sumClaimable(ID, 2), 0);
    }

    function test_refund_lockedPastSettleDeadline() public {
        _createLocked(ID, 4, WTA);
        vm.warp(pot.getPot(ID).settleDeadline);
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Refunded(ID, IConditionalPot.RefundReason.SettleExpired);
        pot.refund(ID);
        assertEq(_sumClaimable(ID, 4), 4 * STAKE);
        for (uint256 i; i < 4; ++i) assertEq(pot.claimableOf(ID, players[i]), STAKE);
    }

    function test_refund_contested() public {
        _createLocked(ID, 2, WTA);
        _propose(ID, _p(1, 2));
        pot.contestWithSig(ID, players[1], _contestSig(pks[1], ID));
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Refunded(ID, IConditionalPot.RefundReason.Contested);
        pot.refund(ID); // immediately, no deadline needed
        assertEq(pot.claimableOf(ID, players[0]), STAKE);
        assertEq(pot.claimableOf(ID, players[1]), STAKE);
    }

    function test_refund_earlyRefusedInFundingAndLocked() public {
        _create(ID, 2, WTA);
        _fundSeat(ID, 0);
        vm.warp(pot.getPot(ID).fundDeadline - 1);
        vm.expectRevert(IConditionalPot.NotRefundable.selector);
        pot.refund(ID);

        _createLocked(ID2, 2, WTA);
        vm.warp(pot.getPot(ID2).settleDeadline - 1);
        vm.expectRevert(IConditionalPot.NotRefundable.selector);
        pot.refund(ID2);
    }

    function test_refund_refusedForProposedSettledRefundedAndUnknown() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        _propose(ID, _p(1, 2));
        vm.expectRevert(_wrongState(IConditionalPot.State.Proposed));
        pot.refund(ID);

        _settleCoop(ID2, _p(1, 2));
        vm.expectRevert(_wrongState(IConditionalPot.State.Settled));
        pot.refund(ID2);

        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        pot.refund(keccak256("ghost"));
    }

    function test_refund_cannotBeDoubled() public {
        _createLocked(ID, 2, WTA);
        vm.warp(pot.getPot(ID).settleDeadline);
        pot.refund(ID);
        vm.expectRevert(_wrongState(IConditionalPot.State.Refunded));
        pot.refund(ID);
        assertEq(_sumClaimable(ID, 2), 2 * STAKE);
    }

    function test_race_fundingClosedAtSameTimestampRefundOpens() public {
        _create(ID, 2, WTA);
        _fundSeat(ID, 0);
        Funding memory late = _funding(ID, players[1], pks[1]);
        vm.warp(pot.getPot(ID).fundDeadline);
        vm.expectRevert(IConditionalPot.FundingClosed.selector);
        _submit(ID, players[1], late);
        pot.refund(ID); // same timestamp: the refund wins, exactly one path is open
        vm.expectRevert(_wrongState(IConditionalPot.State.Refunded));
        _submit(ID, players[1], late);
    }

    function test_race_settleClosedAtSameTimestampRefundOpens() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        vm.warp(pot.getPot(ID).settleDeadline);
        vm.expectRevert(IConditionalPot.SettlementClosed.selector);
        pot.settleCooperative(ID, places, sigs);
        vm.prank(oracle);
        vm.expectRevert(IConditionalPot.SettlementClosed.selector);
        pot.propose(ID, places, keccak256("r"));
        pot.refund(ID);
    }

    function test_race_proposalJustBeforeDeadlineBlocksRefundAndFinalizes() public {
        _createLocked(ID, 2, WTA);
        uint256 deadline = pot.getPot(ID).settleDeadline;
        uint8[] memory places = _p(2, 1);
        vm.warp(deadline - 1);
        vm.prank(oracle);
        pot.propose(ID, places, keccak256("r"));
        vm.warp(deadline); // refund timestamp reached, but the pot is Proposed
        vm.expectRevert(_wrongState(IConditionalPot.State.Proposed));
        pot.refund(ID);
        vm.warp(deadline - 1 + WINDOW);
        pot.finalize(ID, places);
        assertEq(pot.claimableOf(ID, players[1]), 2 * STAKE);
    }

    function test_race_refundPaysEveryFundedStakeBackExactly() public {
        _createLocked(ID, 4, WTA);
        vm.warp(pot.getPot(ID).settleDeadline);
        pot.refund(ID);
        _claimAll(ID, 4);
        for (uint256 i; i < 4; ++i) assertEq(usdc.balanceOf(players[i]), START_BALANCE);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    // ================================================================= claim

    function test_claim_afterSettlement_paysSeatAndEmits() public {
        _createLocked(ID, 2, WTA);
        _settleCoop(ID, _p(2, 1));
        vm.expectEmit(true, true, false, true, address(pot));
        emit IConditionalPot.Claimed(ID, players[1], 2 * STAKE);
        pot.claim(ID, players[1]);
        assertEq(usdc.balanceOf(players[1]), START_BALANCE + STAKE);
        assertEq(pot.claimableOf(ID, players[1]), 0);
        assertEq(pot.claimableOf(ID, players[0]), 0); // loser had nothing
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, players[0]);
    }

    function test_claim_afterRefund() public {
        _create(ID, 3, WTA);
        _fundSeat(ID, 1);
        vm.warp(pot.getPot(ID).fundDeadline);
        pot.refund(ID);
        pot.claim(ID, players[1]);
        assertEq(usdc.balanceOf(players[1]), START_BALANCE);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    function test_claim_cannotBeClaimedTwice() public {
        _createLocked(ID, 2, WTA);
        _settleCoop(ID, _p(1, 2));
        pot.claim(ID, players[0]);
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, players[0]);
        assertEq(usdc.balanceOf(players[0]), START_BALANCE + STAKE);
    }

    function test_claim_nonSeatAndZeroAddressHaveNothing() public {
        _createLocked(ID, 2, WTA);
        _settleCoop(ID, _p(1, 2));
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, stranger);
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, address(0));
        assertEq(pot.claimableOf(ID, address(0)), 0);
    }

    function test_claim_wrongStateAndUnknownPot() public {
        _create(ID, 2, WTA);
        vm.expectRevert(_wrongState(IConditionalPot.State.Funding));
        pot.claim(ID, players[0]);
        _fundAll(ID, 2);
        vm.expectRevert(_wrongState(IConditionalPot.State.Locked));
        pot.claim(ID, players[0]);
        _propose(ID, _p(1, 2));
        vm.expectRevert(_wrongState(IConditionalPot.State.Proposed));
        pot.claim(ID, players[0]);
        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        pot.claim(keccak256("ghost"), players[0]);
    }

    function test_claim_anyoneCanTrigger_fundsAlwaysGoToTheSeat() public {
        _createLocked(ID, 2, WTA);
        _settleCoop(ID, _p(1, 2));
        vm.prank(stranger);
        pot.claim(ID, players[0]);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(players[0]), START_BALANCE + STAKE);
    }

    function test_claim_blocklistedRecipientDoesNotAffectOthers() public {
        _createLocked(ID, 4, IConditionalPot.Rule.TOP2_70_30);
        _settleCoop(ID, _p(1, 2, 3, 4));
        usdc.setBlocklisted(players[0], true); // the 70% winner gets blocklisted after settlement
        vm.expectRevert(bytes("Blocklistable: account is blocklisted"));
        pot.claim(ID, players[0]);
        assertEq(pot.claimableOf(ID, players[0]), 2_800_000); // untouched by the failed claim

        pot.claim(ID, players[1]);
        assertEq(usdc.balanceOf(players[1]), START_BALANCE - STAKE + 1_200_000);
        // seats with nothing still revert cleanly, and remain independent
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, players[2]);

        // only the blocked seat's share remains in the pot
        assertEq(usdc.balanceOf(address(pot)), 2_800_000);
        usdc.setBlocklisted(players[0], false);
        pot.claim(ID, players[0]);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    function test_claim_blocklistedRecipientInRefundDoesNotAffectOthers() public {
        _createLocked(ID, 3, WTA);
        vm.warp(pot.getPot(ID).settleDeadline);
        pot.refund(ID);
        usdc.setBlocklisted(players[1], true);
        pot.claim(ID, players[0]);
        vm.expectRevert(bytes("Blocklistable: account is blocklisted"));
        pot.claim(ID, players[1]);
        pot.claim(ID, players[2]);
        assertEq(usdc.balanceOf(address(pot)), STAKE);
        assertEq(pot.claimableOf(ID, players[1]), STAKE);
    }

    function test_claim_blocklistedSeatInOnePotDoesNotAffectAnotherPot() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        _settleCoop(ID, _p(1, 2));
        _settleCoop(ID2, _p(2, 1));
        usdc.setBlocklisted(players[0], true);
        vm.expectRevert(bytes("Blocklistable: account is blocklisted"));
        pot.claim(ID, players[0]);
        pot.claim(ID2, players[1]); // other pot, other seat: unaffected
        assertEq(usdc.balanceOf(address(pot)), 2 * STAKE); // pot 1's funds are intact and accounted for
        assertEq(pot.claimableOf(ID, players[0]), 2 * STAKE);
    }

    // ------------------------------------------------------------ hostile tokens

    function _deployHostile(HostileToken.Mode mode, address target, address trigger, bytes memory payload, bool bubble)
        internal
        returns (HostileToken h)
    {
        h = new HostileToken("Hostile", "HOS");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(h);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) h.mint(players[i], START_BALANCE);
        h.configure(mode, target, trigger, payload, bubble);
    }

    function test_claim_reentrantTokenCannotDoubleClaim_swallowed() public {
        HostileToken h = _deployHostile(
            HostileToken.Mode.ReenterOnTransfer,
            address(0),
            players[0],
            "",
            false
        );
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        _fundAll(ID, 2);
        _settleCoop(ID, _p(1, 2));
        h.configure(
            HostileToken.Mode.ReenterOnTransfer, address(pot), players[0], abi.encodeCall(pot.claim, (ID, players[0])), false
        );
        pot.claim(ID, players[0]);
        assertTrue(h.reentryAttempted());
        assertFalse(h.reentrySucceeded()); // the guard rejected the nested claim
        assertEq(h.balanceOf(players[0]), START_BALANCE + STAKE);
        assertEq(h.balanceOf(address(pot)), 0);
        assertEq(pot.claimableOf(ID, players[0]), 0);
    }

    function test_claim_reentrantTokenBubbling_revertsOnlyThatClaim() public {
        HostileToken h = _deployHostile(HostileToken.Mode.Honest, address(0), address(0), "", false);
        vm.prank(relayer);
        pot.create(ID, _params(3, IConditionalPot.Rule.TOP2_70_30, address(h)));
        _fundAll(ID, 3);
        _settleCoop(ID, _p(1, 2, 3));
        h.configure(
            HostileToken.Mode.ReenterOnTransfer, address(pot), players[0], abi.encodeCall(pot.claim, (ID, players[1])), true
        );
        vm.expectRevert(); // ReentrancyGuardReentrantCall bubbled out of the token
        pot.claim(ID, players[0]);
        assertEq(pot.claimableOf(ID, players[0]), 2_100_000);
        // reentry trigger is only the first seat; the others are untouched and independent
        pot.claim(ID, players[1]);
        vm.expectRevert(IConditionalPot.NothingToClaim.selector);
        pot.claim(ID, players[1]);
    }

    function test_claim_balanceIsZeroedBeforeTheTransfer() public {
        HostileToken h = _deployHostile(HostileToken.Mode.Honest, address(0), address(0), "", false);
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        _fundAll(ID, 2);
        _settleCoop(ID, _p(1, 2));
        // while the token transfers to seat 0 it reads the pot's view of that seat's claimable
        h.configure(
            HostileToken.Mode.ReenterOnTransfer,
            address(pot),
            players[0],
            abi.encodeCall(pot.claimableOf, (ID, players[0])),
            false
        );
        pot.claim(ID, players[0]);
        assertTrue(h.reentrySucceeded());
        assertEq(abi.decode(h.lastReturn(), (uint256)), 0); // checks-effects-interactions
    }

    function test_claim_falseReturningTokenRevertsWithoutLosingTheEntitlement() public {
        HostileToken h = _deployHostile(HostileToken.Mode.FalseTransfer, address(0), address(0), "", false);
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        _fundAll(ID, 2);
        _settleCoop(ID, _p(1, 2));
        vm.expectRevert(); // SafeERC20FailedOperation
        pot.claim(ID, players[0]);
        assertEq(pot.claimableOf(ID, players[0]), 2 * STAKE);
        assertEq(h.balanceOf(address(pot)), 2 * STAKE);
    }

    function test_isolation_hostileAssetPotDoesNotAffectHonestAssetPot() public {
        HostileToken h = _deployHostile(HostileToken.Mode.FalseTransfer, address(0), address(0), "", false);
        // honest pot (usdc) and hostile pot (h) live in the same contract instance
        vm.startPrank(relayer);
        pot.create(ID, _params(2, WTA, address(usdc)));
        pot.create(ID2, _params(2, WTA, address(h)));
        vm.stopPrank();
        _fundAll(ID, 2);
        _fundAll(ID2, 2);
        _settleCoop(ID, _p(1, 2));
        _settleCoop(ID2, _p(1, 2));

        vm.expectRevert();
        pot.claim(ID2, players[0]); // hostile pot is stuck...
        pot.claim(ID, players[0]); // ...the honest pot pays normally
        assertEq(usdc.balanceOf(players[0]), START_BALANCE + STAKE);
        assertEq(usdc.balanceOf(address(pot)), 0);
        assertEq(h.balanceOf(address(pot)), 2 * STAKE);
    }

    function test_isolation_reentrantPullCannotFundOtherSeatsOrTouchOtherPots() public {
        HostileToken h = _deployHostile(HostileToken.Mode.Honest, address(0), address(0), "", false);
        vm.startPrank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        pot.create(ID2, _params(2, WTA, address(usdc)));
        vm.stopPrank();
        // while seat 0's pull is in flight the token tries to refund pot 1 and fund seat 1 through the pot
        Funding memory other = _funding(ID, players[1], pks[1]);
        bytes memory attack = abi.encodeCall(
            pot.fundWithAuthorization, (ID, players[1], other.accept, other.validAfter, other.validBefore, other.nonce, other.auth)
        );
        h.configure(HostileToken.Mode.ReenterOnPull, address(pot), address(0), attack, false);
        _fundSeat(ID, 0);
        assertTrue(h.reentryAttempted());
        assertFalse(h.reentrySucceeded());
        assertEq(pot.getPot(ID).fundedBitmap, 1); // only seat 0
        assertEq(h.balanceOf(address(pot)), STAKE);
        assertEq(uint8(_state(ID2)), uint8(IConditionalPot.State.Funding));
    }
}
