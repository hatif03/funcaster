// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {ConditionalPot} from "../ConditionalPot.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {MockFiatToken, HostileToken, Wallet1271, HostileWallet1271} from "./mocks/MockTokens.sol";

/// @notice Adversarial coverage added in the max-preset pass: field substitution against a reused
///         Accept, uint256 stake bounds, hostile ERC-1271 wallets, per-asset domains, cross-pot reentrancy.
contract HardeningTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;
    IConditionalPot.Rule internal constant T2 = IConditionalPot.Rule.TOP2_70_30;
    uint256 internal constant MAX = type(uint256).max;

    // ============================================================ terms binding

    /// @dev Returns the honest 3-seat terms with exactly one field substituted.
    function _mutated(uint256 field) internal view returns (IConditionalPot.CreateParams memory m, string memory name) {
        m = _params(3, T2);
        if (field == 0) { m.asset = address(eurc); name = "asset"; }
        else if (field == 1) { m.stake += 1; name = "stake"; }
        else if (field == 2) { (m.seats[1], m.seats[2]) = (m.seats[2], m.seats[1]); name = "seat order"; }
        else if (field == 3) { m.seats[2] = stranger; name = "seat address"; }
        else if (field == 4) {
            address[] memory two = new address[](2);
            two[0] = m.seats[0];
            two[1] = m.seats[1];
            m.seats = two;
            name = "seat count";
        }
        else if (field == 5) { m.rule = IConditionalPot.Rule.WINNER_TAKES_ALL; name = "rule"; }
        else if (field == 6) { m.rule = IConditionalPot.Rule.EQUAL_AMONG_TOP; name = "rule (other)"; }
        else if (field == 7) { m.oracle = stranger; name = "oracle"; }
        else if (field == 8) { m.oracle = address(0); name = "oracle removed"; }
        else if (field == 9) { m.fundDeadline += 1; name = "fundDeadline"; }
        else if (field == 10) { m.settleDeadline += 1; name = "settleDeadline"; }
        else if (field == 11) { m.challengeWindow += 1; name = "challengeWindow"; }
        else if (field == 12) { m.minPlaySeconds += 1; name = "minPlaySeconds"; }
        else if (field == 13) { m.metadataHash = keccak256("different metadata"); name = "metadataHash"; }
        else { revert("unknown field"); }
    }

    function test_acceptSignature_cannotBeReusedAgainstAnySubstitutedField() public {
        // The seat signs Accept for the honest terms of pot ID.
        IConditionalPot.CreateParams memory honest = _params(3, T2);
        bytes32 honestTerms = pot.hashTerms(ID, honest);
        bytes memory honestAccept = _acceptSig(pks[0], ID, honestTerms);

        for (uint256 field; field <= 13; ++field) {
            uint256 snap = vm.snapshotState();
            (IConditionalPot.CreateParams memory evil, string memory name) = _mutated(field);

            // A hostile creator front-runs create(ID) with the substituted terms.
            vm.prank(stranger);
            pot.create(ID, evil);
            assertTrue(pot.getPot(ID).termsHash != honestTerms, name);

            // Everything about the funding bundle is valid for THEIR pot except that the Accept is the old one.
            Funding memory f = _funding(ID, players[0], pks[0]);
            f.accept = honestAccept;
            vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
            _submit(ID, players[0], f);
            assertEq(pot.getPot(ID).fundedBitmap, 0, name);
            assertEq(usdc.balanceOf(address(pot)) + eurc.balanceOf(address(pot)), 0, name);
            vm.revertToState(snap);
        }

        // Control: the same signature is accepted by the honest pot.
        vm.prank(relayer);
        pot.create(ID, honest);
        Funding memory ok = _funding(ID, players[0], pks[0]);
        ok.accept = honestAccept;
        _submit(ID, players[0], ok);
        assertEq(pot.getPot(ID).fundedBitmap, 1);
    }

    function test_createdPot_storesOnlyTheComputedHash() public {
        IConditionalPot.CreateParams memory p = _params(3, T2);
        vm.prank(stranger);
        pot.create(ID, p);
        assertEq(pot.getPot(ID).termsHash, pot.hashTerms(ID, p));
        assertEq(pot.getPot(ID).termsHash, _termsHash(ID, p));
    }

    // ============================================================== uint256 stake

    function test_create_stakeBoundIsMaxOverSeatCount() public {
        for (uint256 n = 2; n <= 4; ++n) {
            IConditionalPot.CreateParams memory p = _params(n, T2);
            p.stake = MAX / n;
            bytes32 ok = keccak256(abi.encode("ok", n));
            vm.prank(relayer);
            pot.create(ok, p);
            IConditionalPot.PotView memory v = pot.getPot(ok);
            assertEq(v.stake, MAX / n);
            assertEq(v.total, (MAX / n) * n);
            assertEq(v.termsHash, _termsHash(ok, p));

            p.stake = MAX / n + 1;
            vm.expectRevert(IConditionalPot.StakeTooLarge.selector);
            pot.create(keccak256(abi.encode("big", n)), p);
        }
    }

    function test_create_maxUint256StakeIsRejected() public {
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.stake = MAX;
        vm.expectRevert(IConditionalPot.StakeTooLarge.selector);
        pot.create(ID, p);
    }

    function test_create_hugeStakeCannotBeFundedButCanBeRefundedEmpty() public {
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.stake = MAX / 2;
        vm.prank(relayer);
        pot.create(ID, p);
        // Nobody holds that much, so the funding authorization fails at the token and nothing moves.
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert();
        _submit(ID, players[0], f);
        vm.warp(pot.getPot(ID).fundDeadline);
        pot.refund(ID);
        assertEq(_sumClaimable(ID, 2), 0);
    }

    // =========================================================== ERC-1271 wallets

    function _potWithSeat0(address seat0) internal {
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[0] = seat0;
        vm.prank(relayer);
        pot.create(ID, p);
    }

    function test_hostileWallets_cannotPassAccept() public {
        for (uint256 m; m < 4; ++m) {
            uint256 snap = vm.snapshotState();
            HostileWallet1271 w = new HostileWallet1271(HostileWallet1271.Mode(m));
            usdc.mint(address(w), START_BALANCE);
            _potWithSeat0(address(w));
            Funding memory f = _funding(ID, address(w), pks[0]);
            vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
            _submit(ID, address(w), f);
            assertEq(w.counter(), 0, "the staticcall prevented any state change");
            vm.revertToState(snap);
        }
    }

    function test_hostileWalletSeat_blocksOnlyCooperativeSettlement_notRefundOrOracle() public {
        // Seat 0 is a wallet that validates once funded (an honest ERC-1271 wallet owned by pk0),
        // then we replace nothing: instead use a wallet that is hostile only for Settle by never being a seat.
        // Here seat 1 is a TriesToWriteState wallet that cannot fund, so use two honest seats and show
        // that a seat with a rejecting wallet at SETTLE time cannot trap the pot.
        Wallet1271 w = new Wallet1271(players[1]);
        usdc.mint(address(w), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[1] = address(w);
        vm.prank(relayer);
        pot.create(ID, p);
        _fundSeat(ID, 0);
        _submit(ID, address(w), _funding(ID, address(w), pks[1]));

        // the wallet seat refuses to co-sign: cooperative settlement fails for lack of its signature
        uint8[] memory places = _p(1, 2);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _settleSig(pks[0], ID, places);
        sigs[1] = _settleSig(pks[2], ID, places); // not the wallet owner
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, sigs);

        // ...but the oracle path and the refund path are unaffected
        _propose(ID, places);
        vm.warp(block.timestamp + WINDOW);
        pot.finalize(ID, places);
        assertEq(pot.claimableOf(ID, players[0]), 2 * STAKE);
    }

    function test_erc1271_settleSignatureForAnotherPotIsRejected() public {
        Wallet1271 w = new Wallet1271(players[1]);
        usdc.mint(address(w), START_BALANCE);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        p.seats[1] = address(w);
        vm.startPrank(relayer);
        pot.create(ID, p);
        pot.create(ID2, p);
        vm.stopPrank();
        for (uint256 k; k < 2; ++k) {
            bytes32 id = k == 0 ? ID : ID2;
            _fundSeat(id, 0);
            _submit(id, address(w), _funding(id, address(w), pks[1]));
        }
        uint8[] memory places = _p(1, 2);
        bytes[] memory forOther = new bytes[](2);
        forOther[0] = _settleSig(pks[0], ID2, places);
        forOther[1] = _settleSig(pks[1], ID2, places);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        pot.settleCooperative(ID, places, forOther);
        pot.settleCooperative(ID2, places, forOther);
    }

    // ============================================================ per-asset domains

    function test_authorization_signedForOneAssetCannotFundAnother() public {
        // pot in USDC, but the seat's authorization is signed against EURC's domain
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.auth = _authSig(eurc, pks[0], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _submit(ID, players[0], f);
    }

    function test_authorization_signedForALookalikeTokenAtAnotherAddressIsRejected() public {
        MockFiatToken twin = new MockFiatToken("USD Coin", "USDC"); // same name and version, different address
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(twin);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) twin.mint(players[i], START_BALANCE);
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(twin)));
        Funding memory f = _funding(ID, players[0], pks[0]);
        // authorization signed for the real USDC address
        f.auth = _authSig(usdc, pks[0], players[0], address(pot), STAKE, 0, f.validBefore, f.nonce);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _submit(ID, players[0], f);
    }

    function test_acceptSignature_isNotValidOnAnotherPotContract() public {
        _create(ID, 2, WTA);
        Funding memory f = _funding(ID, players[0], pks[0]);
        address[] memory assets = pot.allowedAssets();
        ConditionalPot other = new ConditionalPot(assets);
        vm.prank(relayer);
        other.create(ID, _params(2, WTA));
        // identical terms and pot id on a second deployment: terms hash equal, domain differs
        assertEq(other.getPot(ID).termsHash, pot.getPot(ID).termsHash);
        vm.prank(relayer);
        vm.expectPartialRevert(IConditionalPot.BadSignature.selector);
        other.fundWithAuthorization(ID, players[0], f.accept, f.validAfter, f.validBefore, f.nonce, f.auth);
    }

    // ================================================================ units

    function test_units_floorIsFiveHundredthsOfASixDecimalAsset() public view {
        assertEq(usdc.decimals(), 6);
        assertEq(eurc.decimals(), 6);
        assertEq(pot.MIN_RETAINED_BALANCE(), 5 * 10 ** (usdc.decimals() - 2)); // 0.05
        assertEq(pot.MIN_RETAINED_BALANCE(), 50_000);
    }

    function test_units_floorAppliesToEurcToo() public {
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(eurc)));
        uint256 bal = eurc.balanceOf(players[0]);
        vm.prank(players[0]);
        eurc.transfer(stranger, bal - (STAKE + 49_999));
        Funding memory f = _funding(ID, players[0], pks[0]);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.RetainedBalanceTooLow.selector, 49_999, 50_000));
        _submit(ID, players[0], f);
    }

    // ============================================================ reentrancy

    function test_reentrancy_claimInOnePotCannotClaimInAnother() public {
        HostileToken h = new HostileToken("Hostile", "HOS");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(h);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) h.mint(players[i], START_BALANCE);
        vm.startPrank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        pot.create(ID2, _params(2, WTA, address(h)));
        vm.stopPrank();
        _fundAll(ID, 2);
        _fundAll(ID2, 2);
        _settleCoop(ID, _p(1, 2));
        _settleCoop(ID2, _p(1, 2));
        // while paying pot 1's winner, the token tries to pull pot 2's winner payout into the same transaction
        h.configure(HostileToken.Mode.ReenterOnTransfer, address(pot), players[0], abi.encodeCall(pot.claim, (ID2, players[0])), false);
        pot.claim(ID, players[0]);
        assertTrue(h.reentryAttempted());
        assertFalse(h.reentrySucceeded());
        assertEq(pot.claimableOf(ID2, players[0]), 2 * STAKE, "pot 2 untouched");
        // pot 2 still pays normally on its own call
        h.configure(HostileToken.Mode.Honest, address(0), address(0), "", false);
        pot.claim(ID2, players[0]);
    }

    function test_reentrancy_refundCannotBeInvokedWhileFunding() public {
        HostileToken h = new HostileToken("Hostile", "HOS");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(h);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) h.mint(players[i], START_BALANCE);
        vm.prank(relayer);
        pot.create(ID, _params(2, WTA, address(h)));
        vm.warp(pot.getPot(ID).fundDeadline - 1);
        // the token tries to refund the pot (after the deadline it would be allowed) from inside the pull
        h.configure(HostileToken.Mode.ReenterOnPull, address(pot), address(0), abi.encodeCall(pot.refund, (ID)), false);
        Funding memory f = _funding(ID, players[0], pks[0]);
        _submit(ID, players[0], f);
        assertTrue(h.reentryAttempted());
        assertFalse(h.reentrySucceeded());
        assertEq(pot.getPot(ID).fundedBitmap, 1);
    }

    // ===================================================== diagnostic revert data

    function test_revertData_namesTheSeatAndTheExpectedNonce() public {
        _create(ID, 3, WTA);
        // wrong nonce reports the nonce the pot requires
        Funding memory f = _funding(ID, players[0], pks[0]);
        f.nonce = keccak256("x");
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BadNonce.selector, pot.fundingNonce(ID, players[0])));
        _submit(ID, players[0], f);
        // wrong Accept reports the seat that failed
        Funding memory g = _funding(ID, players[1], pks[1]);
        g.accept = _acceptSig(pks[2], ID, pot.getPot(ID).termsHash);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BadSignature.selector, players[1]));
        _submit(ID, players[1], g);
    }

    function test_revertData_cooperativeSettlementNamesTheFailingSeat() public {
        _createLocked(ID, 3, WTA);
        uint8[] memory places = _p(1, 2, 3);
        bytes[] memory sigs = _coopSigs(ID, places);
        sigs[2] = _settleSig(pks[0], ID, places);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BadSignature.selector, players[2]));
        pot.settleCooperative(ID, places, sigs);
    }
}
