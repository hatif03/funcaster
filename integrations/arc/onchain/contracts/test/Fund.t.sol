// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {ConditionalPot} from "../ConditionalPot.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {MockFiatToken, HostileToken, Wallet1271} from "./mocks/MockTokens.sol";

contract FundTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;

    function test_fund_succeedsForEachSeat() public {
        _create(ID, 4, WTA);
        for (uint256 i; i < 4; ++i) {
            vm.expectEmit(true, true, false, true, address(pot));
            emit IConditionalPot.Funded(ID, players[i], uint8(i), STAKE);
            _fundSeat(ID, i);
            IConditionalPot.PotView memory v = pot.getPot(ID);
            assertEq(v.fundedBitmap, uint8((1 << (i + 1)) - 1));
            assertEq(v.acceptedBitmap, v.fundedBitmap);
            assertEq(usdc.balanceOf(players[i]), START_BALANCE - STAKE);
            assertEq(usdc.balanceOf(address(pot)), (i + 1) * STAKE);
        }
    }

    function test_fund_anyOrder_lastSeatLocksAndEmitsLocked() public {
        _create(ID, 3, WTA);
        _fundSeat(ID, 2);
        _fundSeat(ID, 0);
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Funding));
        IConditionalPot.PotView memory mid = pot.getPot(ID);
        assertEq(mid.fundedBitmap, 5);
        assertEq(mid.lockedAt, 0);

        vm.warp(block.timestamp + 17);
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Locked(ID, uint64(block.timestamp));
        _fundSeat(ID, 1);
        IConditionalPot.PotView memory v = pot.getPot(ID);
        assertEq(uint8(v.state), uint8(IConditionalPot.State.Locked));
        assertEq(v.lockedAt, block.timestamp);
        assertEq(v.fundedBitmap, 7);
    }

    function test_fund_relayerNeverNeedsToBeTheSeat_andPaysNothing() public {
        _create(ID, 2, WTA);
        uint256 relayerBefore = usdc.balanceOf(relayer);
        _fundSeat(ID, 0);
        assertEq(usdc.balanceOf(relayer), relayerBefore);
    }

    function test_fund_revertsOnWrongAcceptSigner() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.accept = _acceptSig(pks[1], ID, pot.getPot(ID).termsHash); // seat 1 signs for seat 0
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_revertsOnAcceptOverDifferentTerms() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.accept = _acceptSig(pks[0], ID, keccak256("other terms"));
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_frontRunCreationWithSubstitutedTermsCannotUseTheSeatsSignatures() public {
        // The honest terms: seats 0 and 1, honest oracle. The seat signs Accept over THOSE terms.
        IConditionalPot.CreateParams memory honest = _params(2, WTA);
        bytes32 honestTerms = pot.hashTerms(ID, honest);
        bytes memory accept0 = _acceptSig(pks[0], ID, honestTerms);

        // An attacker front-runs create(ID) keeping asset, stake and metadata but swapping seat 1 and the oracle.
        IConditionalPot.CreateParams memory evil = _params(2, WTA);
        evil.seats[1] = stranger;
        evil.oracle = stranger;
        vm.prank(stranger);
        pot.create(ID, evil);
        assertTrue(pot.getPot(ID).termsHash != honestTerms);

        Funding memory f = _funding(ID, players[0], pks[0]);
        f.accept = accept0; // the honest, validly signed Accept
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, players[0], f);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    function test_fund_revertsWhenTokenRejectsAuthorizationSigner() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.auth = _authSig(usdc, pks[1], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _submit(ID, players[0], f);
        assertEq(pot.getPot(ID).fundedBitmap, 0);
    }

    function test_fund_revertsWhenAuthorizationValueDiffersFromStake() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE - 1, 0, f.validBefore, f.nonce);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _submit(ID, players[0], f);
    }

    function test_fund_revertsOnWrongNonce() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.nonce = keccak256("some other nonce");
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.expectPartialRevert(IConditionalPot.BadNonce.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_nonceForAnotherPotOrSeatIsRejected() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.nonce = pot.fundingNonce(ID2, players[0]);
        vm.expectPartialRevert(IConditionalPot.BadNonce.selector);
        _submit(ID, players[0], f);
        f.nonce = pot.fundingNonce(ID, players[1]);
        vm.expectPartialRevert(IConditionalPot.BadNonce.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_revertsWhenAuthorizationExpired() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.validBefore = block.timestamp + 10;
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.warp(block.timestamp + 10); // now == validBefore: expired (strict)
        vm.expectRevert(bytes("FiatTokenV2: authorization is expired"));
        _submit(ID, players[0], f);
    }

    function test_fund_revertsWhenValidAfterNotReached() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.validAfter = block.timestamp; // token needs now > validAfter
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE, f.validAfter, f.validBefore, f.nonce);
        vm.expectRevert(bytes("FiatTokenV2: authorization is not yet valid"));
        _submit(ID, players[0], f);
        vm.warp(block.timestamp + 1);
        _submit(ID, players[0], f);
    }

    function test_fund_revertsWhenValidBeforeExceedsFundDeadline() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.validBefore = pot.getPot(ID).fundDeadline + 1;
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.expectRevert(IConditionalPot.AuthorizationTooLong.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_revertsAtFundDeadline_succeedsOneSecondBefore() public {
        _create(ID, 2, WTA);
        uint256 deadline = pot.getPot(ID).fundDeadline;
        Funding memory f0 = _funding(ID, players[0], pks[0]);
        Funding memory f1 = _funding(ID, players[1], pks[1]);
        vm.warp(deadline - 1);
        _submit(ID, players[0], f0);
        vm.warp(deadline);
        vm.expectRevert(IConditionalPot.FundingClosed.selector);
        _submit(ID, players[1], f1);
    }

    function test_fund_revertsForNonSeat() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert(IConditionalPot.NotASeat.selector);
        _submit(ID, players[3], f);
    }

    function test_fund_revertsWhenSeatAlreadyFunded() public {
        _create(ID, 3, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        _submit(ID, players[0], f);
        vm.expectRevert(IConditionalPot.AlreadyFunded.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_revertsAfterLocked() public {
        _createLocked(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert(_wrongState(IConditionalPot.State.Locked));
        _submit(ID, players[0], f);
    }

    function test_fund_revertsForUnknownPot() public {
        Funding memory f;
        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        _submit(keccak256("ghost"), players[0], f);
    }

    function test_fund_acceptSigReplayedOnAnotherPotFails() public {
        _create(ID, 2, WTA);
        _create(ID2, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        // Same terms hash, same seat: only the potId differs, so the signed Accept must not verify.
        Funding memory g = _funding(ID2, players[0], pks[0]);
        g.accept = f.accept;
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID2, players[0], g);
        // Even re-signing pot 2's id over pot 1's terms hash does not verify: the hash binds the pot id.
        g.accept = _acceptSig(pks[0], ID2, pot.getPot(ID).termsHash);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID2, players[0], g);
    }

    function test_fund_acceptSigReplayedOnAnotherChainFails() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.chainId(block.chainid + 1);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_acceptSigFromAnotherContractDeploymentFails() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        // Same signature digest but built for a different verifying contract.
        bytes32 otherDomain = _domainSeparator(address(0xBEEF), "ChonksPot", "1", block.chainid);
        f.accept = _sig(pks[0], _typed(otherDomain, keccak256(abi.encode(ACCEPT_TYPEHASH, ID, pot.getPot(ID).termsHash))));
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, players[0], f);
    }

    function test_fund_authorizationIsPayeeOnly_cannotBeFrontRunByAnyoneElse() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        // A mempool observer copies the authorization and tries to pull it to themselves.
        vm.prank(stranger);
        vm.expectRevert(bytes("FiatTokenV2: caller must be the payee"));
        usdc.receiveWithAuthorization(players[0], address(pot), STAKE, 0, f.validBefore, f.nonce, f.auth);
        vm.prank(stranger);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.receiveWithAuthorization(players[0], stranger, STAKE, 0, f.validBefore, f.nonce, f.auth);
        // ...or to submit it with a different payee (signature is bound to the pot as payee).
        vm.prank(address(pot));
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.receiveWithAuthorization(players[0], address(pot), STAKE + 1, 0, f.validBefore, f.nonce, f.auth);
        // The legitimate submission still works afterwards.
        _submit(ID, players[0], f);
        assertEq(usdc.balanceOf(address(pot)), STAKE);
    }

    function test_fund_usedAuthorizationCannotBeReusedByTheTokenOrOnAnotherPot() public {
        _create(ID, 2, WTA);
        _create(ID2, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        _submit(ID, players[0], f);
        assertTrue(usdc.authorizationState(players[0], f.nonce));
        // Reusing the consumed nonce directly at the token fails.
        vm.prank(address(pot));
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        usdc.receiveWithAuthorization(players[0], address(pot), STAKE, 0, f.validBefore, f.nonce, f.auth);
        // The same bundle cannot fund pot 2: the nonce is bound to the pot id.
        vm.expectPartialRevert(IConditionalPot.BadNonce.selector);
        _submit(ID2, players[0], f);
    }

    function test_fund_revertsWhenBalanceDeltaIsNotStake_feeOnTransfer() public {
        (HostileToken h, bytes32 id) = _hostilePot(HostileToken.Mode.FeeOnPull);
        Funding memory f = _funding(id, players[0], pks[0]);
        vm.expectRevert(
            abi.encodeWithSelector(IConditionalPot.BalanceDeltaMismatch.selector, STAKE, STAKE - STAKE / 100)
        );
        _submit(id, players[0], f);
        assertEq(h.balanceOf(address(pot)), 0);
    }

    function test_fund_revertsWhenTokenMovesNothing() public {
        (, bytes32 id) = _hostilePot(HostileToken.Mode.NoPull);
        Funding memory f = _funding(id, players[0], pks[0]);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BalanceDeltaMismatch.selector, STAKE, 0));
        _submit(id, players[0], f);
    }

    function test_fund_revertsWhenTokenMovesMoreThanStake() public {
        (, bytes32 id) = _hostilePot(HostileToken.Mode.OverPull);
        Funding memory f = _funding(id, players[0], pks[0]);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BalanceDeltaMismatch.selector, STAKE, STAKE + 1));
        _submit(id, players[0], f);
    }

    // ---------------------------------------------------- six-decimal retained floor

    function _drainTo(address who, uint256 keep) internal {
        uint256 bal = usdc.balanceOf(who);
        vm.prank(who);
        usdc.transfer(stranger, bal - keep);
    }

    function test_fund_floor_failsWhenSeatWouldKeepUnder50000() public {
        _create(ID, 2, WTA);
        _drainTo(players[0], STAKE + 49_999);
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.RetainedBalanceTooLow.selector, 49_999, 50_000));
        _submit(ID, players[0], f);
        assertEq(pot.getPot(ID).fundedBitmap, 0);
        assertEq(usdc.balanceOf(players[0]), STAKE + 49_999);
    }

    function test_fund_floor_succeedsWhenSeatKeepsExactly50000() public {
        _create(ID, 2, WTA);
        _drainTo(players[0], STAKE + 50_000);
        _fundSeat(ID, 0);
        assertEq(usdc.balanceOf(players[0]), 50_000);
        assertEq(pot.MIN_RETAINED_BALANCE(), 50_000);
    }

    function test_fund_floor_failsWhenSeatWouldBeLeftAtZero() public {
        _create(ID, 2, WTA);
        _drainTo(players[0], STAKE);
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.RetainedBalanceTooLow.selector, 0, 50_000));
        _submit(ID, players[0], f);
    }

    function testFuzz_fund_floorBoundary(uint256 extra) public {
        extra = bound(extra, 0, 200_000);
        _create(ID, 2, WTA);
        _drainTo(players[0], STAKE + extra);
        Funding memory f = _funding(ID, players[0], pks[0]);
        if (extra < 50_000) {
            vm.expectRevert(abi.encodeWithSelector(IConditionalPot.RetainedBalanceTooLow.selector, extra, 50_000));
            _submit(ID, players[0], f);
        } else {
            _submit(ID, players[0], f);
            assertEq(usdc.balanceOf(players[0]), extra);
        }
    }

    // ------------------------------------------------------------- ERC-1271 seats

    function test_fund_smartWalletSeat_erc1271AcceptAndAuthorization() public {
        Wallet1271 wallet = new Wallet1271(players[0]);
        usdc.mint(address(wallet), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[0] = address(wallet);
        vm.prank(relayer);
        pot.create(ID, p);

        Funding memory f = _funding(ID, address(wallet), pks[0]); // wallet owner key signs
        _submit(ID, address(wallet), f);
        assertEq(pot.getPot(ID).fundedBitmap, 1);
        assertEq(usdc.balanceOf(address(wallet)), START_BALANCE - STAKE);
    }

    function test_fund_smartWalletSeat_wrongOwnerRejected() public {
        Wallet1271 wallet = new Wallet1271(players[0]);
        usdc.mint(address(wallet), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[0] = address(wallet);
        vm.prank(relayer);
        pot.create(ID, p);
        Funding memory f = _funding(ID, address(wallet), pks[1]); // not the owner
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        _submit(ID, address(wallet), f);
    }
}
