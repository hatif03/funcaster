// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {Wallet1271} from "./mocks/MockTokens.sol";

contract SettleTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;
    IConditionalPot.Rule internal constant T2 = IConditionalPot.Rule.TOP2_70_30;

    // ============================================================ cooperative

    function test_coop_settlesTwoThreeAndFourSeats() public {
        for (uint256 n = 2; n <= 4; ++n) {
            bytes32 id = keccak256(abi.encode("coop", n));
            _createLocked(id, n, WTA);
            uint8[] memory places = new uint8[](n);
            for (uint256 i; i < n; ++i) places[i] = uint8(i + 1);
            bytes32 placesHash = pot.hashPlaces(places);
            vm.expectEmit(true, false, false, true, address(pot));
            emit IConditionalPot.Settled(id, placesHash, "cooperative");
            _settleCoop(id, places);
            assertEq(uint8(_state(id)), uint8(IConditionalPot.State.Settled));
            assertEq(_sumClaimable(id, n), n * STAKE);
            assertEq(pot.claimableOf(id, players[0]), n * STAKE);
        }
    }

    function test_coop_revertsWithMissingSignature() public {
        _createLocked(ID, 3, WTA);
        uint8[] memory places = _p(1, 2, 3);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _settleSig(pks[0], ID, places);
        sigs[1] = _settleSig(pks[1], ID, places);
        vm.expectRevert(IConditionalPot.WrongSignatureCount.selector);
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_revertsWithEmptySignature() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        sigs[1] = "";
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_revertsWithWrongSigner() public {
        _createLocked(ID, 3, WTA);
        uint8[] memory places = _p(1, 2, 3);
        bytes[] memory sigs = _coopSigs(ID, places);
        sigs[2] = _settleSig(pks[0], ID, places); // seat 0 signs seat 2's slot
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_revertsWhenSignaturesAreInWrongOrder() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        (sigs[0], sigs[1]) = (sigs[1], sigs[0]);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_revertsWhenSignedForAnotherPot() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID2, places); // valid for pot 2 only
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);
        pot.settleCooperative(ID2, places, sigs); // proves the signatures were otherwise valid
        assertEq(uint8(_state(ID2)), uint8(IConditionalPot.State.Settled));
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Locked));
    }

    function test_coop_revertsWhenSignedForDifferentPlaces() public {
        _createLocked(ID, 2, WTA);
        bytes[] memory sigs = _coopSigs(ID, _p(1, 2));
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, _p(2, 1), sigs);
    }

    function test_coop_signatureReplayAcrossChainsFails() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        vm.chainId(block.chainid + 1);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_erc1271SeatCanSign() public {
        Wallet1271 wallet = new Wallet1271(players[1]);
        usdc.mint(address(wallet), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[1] = address(wallet);
        vm.prank(relayer);
        pot.create(ID, p);
        _fundSeat(ID, 0);
        _submit(ID, address(wallet), _funding(ID, address(wallet), pks[1]));

        uint8[] memory places = _p(2, 1);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _settleSig(pks[0], ID, places);
        sigs[1] = _settleSig(pks[1], ID, places); // wallet owner signs for the wallet
        pot.settleCooperative(ID, places, sigs);
        assertEq(pot.claimableOf(ID, address(wallet)), 2 * STAKE);
    }

    function test_coop_revertsOnInvalidPlaces() public {
        _createLocked(ID, 3, WTA);
        bytes[] memory dummy = new bytes[](3);
        uint8[3][5] memory bad = [[0, 1, 2], [1, 1, 3], [2, 2, 2], [1, 2, 4], [3, 2, 1]];
        // (3,2,1) is valid (a permutation); only the first four are invalid
        for (uint256 i; i < 4; ++i) {
            vm.expectRevert(IConditionalPot.BadPlaces.selector);
            pot.settleCooperative(ID, _p(bad[i][0], bad[i][1], bad[i][2]), dummy);
        }
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.settleCooperative(ID, _p(1, 2), dummy); // wrong length
        bytes32 id4 = keccak256("four");
        _createLocked(id4, 4, WTA);
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.settleCooperative(id4, _p(1, 2, 3), new bytes[](4)); // length 3 for 4 seats
        // the permutation is accepted
        uint8[] memory ok = _p(3, 2, 1);
        pot.settleCooperative(ID, ok, _coopSigs(ID, ok));
    }

    function test_coop_competitionRanksWithGapAreRejected() public {
        // (1,1,3) is a competition rank; the contract only accepts dense ranks (1,1,2).
        _createLocked(ID, 3, T2);
        uint8[] memory gap = _p(1, 1, 3);
        bytes[] memory sigs = _coopSigs(ID, gap);
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.settleCooperative(ID, gap, sigs);
        uint8[] memory dense = _p(1, 1, 2);
        pot.settleCooperative(ID, dense, _coopSigs(ID, dense));
        // 70% of 3.000000 split by two winners, 30% to third
        assertEq(pot.claimableOf(ID, players[0]), 1_050_000);
        assertEq(pot.claimableOf(ID, players[1]), 1_050_000);
        assertEq(pot.claimableOf(ID, players[2]), 900_000);
    }

    function test_coop_cannotSettleTwice() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        pot.settleCooperative(ID, places, sigs);
        vm.expectRevert(_wrongState(IConditionalPot.State.Settled));
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_revertsBeforeLocked() public {
        _create(ID, 2, WTA);
        _fundSeat(ID, 0);
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = _coopSigs(ID, places);
        vm.expectRevert(_wrongState(IConditionalPot.State.Funding));
        pot.settleCooperative(ID, places, sigs);
    }

    function test_coop_unknownPot() public {
        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        pot.settleCooperative(ID, _p(1, 2), new bytes[](2));
    }

    function test_coop_refusedAtSettleDeadline_allowedOneSecondBefore() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        uint256 deadline = pot.getPot(ID).settleDeadline;
        uint8[] memory places = _p(1, 2);
        bytes[] memory s1 = _coopSigs(ID, places);
        bytes[] memory s2 = _coopSigs(ID2, places);
        vm.warp(deadline - 1);
        pot.settleCooperative(ID, places, s1);
        vm.warp(deadline);
        vm.expectRevert(IConditionalPot.SettlementClosed.selector);
        pot.settleCooperative(ID2, places, s2);
    }

    function test_coop_refusedAfterProposal() public {
        _createLocked(ID, 2, WTA);
        _propose(ID, _p(1, 2));
        uint8[] memory places = _p(2, 1);
        bytes[] memory sigs = _coopSigs(ID, places);
        vm.expectRevert(_wrongState(IConditionalPot.State.Proposed));
        pot.settleCooperative(ID, places, sigs);
    }

    // ================================================================= oracle

    function test_propose_onlyOracle() public {
        _createLocked(ID, 2, WTA);
        vm.warp(block.timestamp + MIN_PLAY);
        vm.prank(stranger);
        vm.expectRevert(IConditionalPot.NotOracle.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.prank(players[0]);
        vm.expectRevert(IConditionalPot.NotOracle.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.prank(relayer);
        vm.expectRevert(IConditionalPot.NotOracle.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
    }

    function test_propose_potWithoutOracleCannotBeProposed() public {
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.oracle = address(0);
        vm.prank(relayer);
        pot.create(ID, p);
        _fundAll(ID, 2);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(address(0));
        vm.expectRevert(IConditionalPot.NotOracle.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.prank(stranger);
        vm.expectRevert(IConditionalPot.NotOracle.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
    }

    function test_propose_requiresLockedState() public {
        _create(ID, 2, WTA);
        _fundSeat(ID, 0);
        vm.prank(oracle);
        vm.expectRevert(_wrongState(IConditionalPot.State.Funding));
        pot.propose(ID, _p(1, 2), keccak256("r"));
    }

    function test_propose_enforcesMinimumPlayTime_includingEqualTimestamps() public {
        _createLocked(ID, 2, WTA);
        uint256 lockedAt = pot.getPot(ID).lockedAt;
        // same block as the lock (equal timestamps) is too early
        vm.prank(oracle);
        vm.expectRevert(IConditionalPot.TooEarly.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.warp(lockedAt + MIN_PLAY - 1);
        vm.prank(oracle);
        vm.expectRevert(IConditionalPot.TooEarly.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.warp(lockedAt + MIN_PLAY);
        vm.prank(oracle);
        pot.propose(ID, _p(1, 2), keccak256("r"));
    }

    function test_propose_lateFundingStillLeavesRoomForMinPlay() public {
        _create(ID, 2, WTA);
        IConditionalPot.PotView memory v = pot.getPot(ID);
        Funding memory f0 = _funding(ID, players[0], pks[0]);
        Funding memory f1 = _funding(ID, players[1], pks[1]);
        _submit(ID, players[0], f0);
        vm.warp(v.fundDeadline - 1); // lock as late as the contract allows
        _submit(ID, players[1], f1);
        vm.warp(v.fundDeadline - 1 + MIN_PLAY);
        assertLt(block.timestamp, v.settleDeadline);
        vm.prank(oracle);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Proposed));
    }

    function test_propose_refusedAtSettleDeadline_allowedOneSecondBefore() public {
        _createLocked(ID, 2, WTA);
        uint256 deadline = pot.getPot(ID).settleDeadline;
        vm.warp(deadline);
        vm.prank(oracle);
        vm.expectRevert(IConditionalPot.SettlementClosed.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.warp(deadline - 1);
        vm.prank(oracle);
        pot.propose(ID, _p(1, 2), keccak256("r"));
    }

    function test_propose_storesProposalAndEmits() public {
        _createLocked(ID, 3, T2);
        vm.warp(block.timestamp + MIN_PLAY);
        uint8[] memory places = _p(2, 1, 2);
        bytes32 placesHash = keccak256(abi.encode(places));
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Proposed(ID, placesHash, keccak256("r"), places, uint64(block.timestamp + WINDOW));
        vm.prank(oracle);
        pot.propose(ID, places, keccak256("r"));
        IConditionalPot.Proposal memory pr = pot.getPot(ID).proposal;
        assertEq(pr.placesHash, placesHash);
        assertEq(pr.resultHash, keccak256("r"));
        assertEq(pr.at, block.timestamp);
        assertEq(_sumClaimable(ID, 3), 0); // nothing is claimable until finalized
    }

    function test_propose_cannotProposeTwice() public {
        _createLocked(ID, 2, WTA);
        _propose(ID, _p(1, 2));
        vm.prank(oracle);
        vm.expectRevert(_wrongState(IConditionalPot.State.Proposed));
        pot.propose(ID, _p(2, 1), keccak256("r2"));
    }

    function test_propose_revertsOnInvalidPlaces() public {
        _createLocked(ID, 3, WTA);
        vm.warp(block.timestamp + MIN_PLAY);
        vm.startPrank(oracle);
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.propose(ID, _p(1, 1, 3), keccak256("r"));
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.propose(ID, _p(0, 1, 2), keccak256("r"));
        vm.expectRevert(IConditionalPot.BadPlaces.selector);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        vm.stopPrank();
    }

    // -------------------------------------------------------- contest / finalize

    function test_contest_insideWindowFreezesProposal() public {
        _createLocked(ID, 3, WTA);
        _propose(ID, _p(1, 2, 3));
        vm.expectEmit(true, true, false, true, address(pot));
        emit IConditionalPot.Contested(ID, players[1]);
        vm.prank(relayer);
        pot.contestWithSig(ID, players[1], _contestSig(pks[1], ID));
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Contested));
    }

    function test_contest_windowBoundaryIsExclusive_noGapNoOverlap() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        vm.warp(block.timestamp + MIN_PLAY);
        vm.startPrank(oracle);
        pot.propose(ID, _p(1, 2), keccak256("r"));
        pot.propose(ID2, _p(1, 2), keccak256("r")); // same block, equal timestamps
        vm.stopPrank();
        uint256 at = pot.getPot(ID).proposal.at;
        assertEq(at, pot.getPot(ID2).proposal.at);
        bytes memory sig = _contestSig(pks[0], ID);
        bytes memory sig2 = _contestSig(pks[0], ID2);

        // equal timestamp as the proposal: still inside the window
        pot.contestWithSig(ID, players[0], sig);

        // last second of the window is contestable, first second after is not
        vm.warp(at + WINDOW - 1);
        pot.contestWithSig(ID2, players[0], sig2);
        assertEq(uint8(_state(ID2)), uint8(IConditionalPot.State.Contested));
    }

    function test_contest_refusedAtWindowEnd_whileFinalizeOpensAtSameTimestamp() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        _propose(ID, places);
        uint256 at = pot.getPot(ID).proposal.at;
        bytes memory sig = _contestSig(pks[0], ID);
        vm.warp(at + WINDOW);
        vm.expectRevert(IConditionalPot.ChallengeClosed.selector);
        pot.contestWithSig(ID, players[0], sig);
        pot.finalize(ID, places); // same timestamp, exactly one of the two works
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Settled));
    }

    function test_contest_revertsForNonSeat_wrongSigner_otherPot() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        _propose(ID, _p(1, 2));
        vm.expectRevert(IConditionalPot.NotASeat.selector);
        pot.contestWithSig(ID, stranger, _contestSig(pks[0], ID));
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.contestWithSig(ID, players[0], _contestSig(pks[1], ID)); // someone else's signature
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.contestWithSig(ID, players[0], _contestSig(pks[0], ID2)); // signature for another pot
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Proposed));
    }

    function test_contest_signatureReplayAcrossChainsFails() public {
        _createLocked(ID, 2, WTA);
        _propose(ID, _p(1, 2));
        bytes memory sig = _contestSig(pks[0], ID);
        vm.chainId(block.chainid + 7);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.contestWithSig(ID, players[0], sig);
    }

    function test_contest_erc1271Seat() public {
        Wallet1271 wallet = new Wallet1271(players[0]);
        usdc.mint(address(wallet), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[0] = address(wallet);
        vm.prank(relayer);
        pot.create(ID, p);
        _submit(ID, address(wallet), _funding(ID, address(wallet), pks[0]));
        _fundSeat(ID, 1);
        _propose(ID, _p(2, 1));
        pot.contestWithSig(ID, address(wallet), _contestSig(pks[0], ID));
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Contested));
    }

    function test_contest_requiresProposedState() public {
        _createLocked(ID, 2, WTA);
        bytes memory sig = _contestSig(pks[0], ID);
        vm.expectRevert(_wrongState(IConditionalPot.State.Locked));
        pot.contestWithSig(ID, players[0], sig);
    }

    function test_finalize_refusedWhileWindowOpen_allowedAtWindowEnd() public {
        _createLocked(ID, 2, WTA);
        uint8[] memory places = _p(1, 2);
        _propose(ID, places);
        uint256 at = pot.getPot(ID).proposal.at;
        vm.expectRevert(IConditionalPot.ChallengeOpen.selector); // equal timestamp as proposal
        pot.finalize(ID, places);
        vm.warp(at + WINDOW - 1);
        vm.expectRevert(IConditionalPot.ChallengeOpen.selector);
        pot.finalize(ID, places);
        vm.warp(at + WINDOW);
        vm.expectEmit(true, false, false, true, address(pot));
        emit IConditionalPot.Settled(ID, pot.hashPlaces(places), "oracle");
        vm.prank(stranger);
        pot.finalize(ID, places);
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Settled));
        assertEq(pot.claimableOf(ID, players[0]), 2 * STAKE);
    }

    function test_finalize_revertsWithDifferentPlaces() public {
        _createLocked(ID, 3, WTA);
        _propose(ID, _p(1, 2, 3));
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(IConditionalPot.PlacesMismatch.selector);
        pot.finalize(ID, _p(3, 2, 1));
        vm.expectRevert(IConditionalPot.PlacesMismatch.selector);
        pot.finalize(ID, _p(1, 2));
    }

    function test_finalize_revertsAfterContestWithoutProposalAndTwice() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 2, WTA);
        uint8[] memory places = _p(1, 2);
        vm.expectRevert(_wrongState(IConditionalPot.State.Locked));
        pot.finalize(ID, places);

        _propose(ID, places);
        pot.contestWithSig(ID, players[0], _contestSig(pks[0], ID));
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(_wrongState(IConditionalPot.State.Contested));
        pot.finalize(ID, places);

        _propose(ID2, places);
        vm.warp(block.timestamp + WINDOW);
        pot.finalize(ID2, places);
        vm.expectRevert(_wrongState(IConditionalPot.State.Settled));
        pot.finalize(ID2, places);
    }

    function test_finalize_unknownPot() public {
        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        pot.finalize(ID, _p(1, 2));
    }
}
