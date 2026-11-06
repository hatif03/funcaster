// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {ConditionalPot} from "../ConditionalPot.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {HostileToken} from "./mocks/MockTokens.sol";

contract CreateTest is PotBase {
    function test_create_success_recordsTermsAndEmits() public {
        IConditionalPot.CreateParams memory p = _params(3, IConditionalPot.Rule.TOP2_70_30);
        vm.expectEmit(true, true, false, true, address(pot));
        emit IConditionalPot.Created(
            ID, address(usdc), STAKE, p.seats, p.rule, oracle, p.fundDeadline, p.settleDeadline, WINDOW, MIN_PLAY, TERMS,
            _termsHash(ID, p)
        );
        vm.prank(relayer);
        pot.create(ID, p);

        IConditionalPot.PotView memory v = pot.getPot(ID);
        assertEq(v.asset, address(usdc));
        assertEq(v.stake, STAKE);
        assertEq(v.seats.length, 3);
        assertEq(v.seats[2], players[2]);
        assertEq(v.fundedBitmap, 0);
        assertEq(v.acceptedBitmap, 0);
        assertEq(uint8(v.rule), uint8(IConditionalPot.Rule.TOP2_70_30));
        assertEq(v.oracle, oracle);
        assertEq(v.fundDeadline, p.fundDeadline);
        assertEq(v.settleDeadline, p.settleDeadline);
        assertEq(v.challengeWindow, WINDOW);
        assertEq(v.minPlaySeconds, MIN_PLAY);
        assertEq(v.lockedAt, 0);
        assertEq(v.metadataHash, TERMS);
        assertEq(v.termsHash, _termsHash(ID, p));
        assertEq(v.termsHash, pot.hashTerms(ID, p));
        assertEq(uint8(v.state), uint8(IConditionalPot.State.Funding));
        assertEq(v.proposal.at, 0);
        assertEq(v.total, 3 * STAKE);
    }

    function test_termsHash_commitsToEveryExecutableParameter() public view {
        IConditionalPot.CreateParams memory base = _params(3, IConditionalPot.Rule.TOP2_70_30);
        bytes32 h = pot.hashTerms(ID, base);
        assertEq(h, _termsHash(ID, base));
        assertTrue(h != pot.hashTerms(ID2, base), "pot id");

        IConditionalPot.CreateParams memory m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.asset = address(eurc);
        assertTrue(h != pot.hashTerms(ID, m), "asset");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.stake += 1;
        assertTrue(h != pot.hashTerms(ID, m), "stake");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        (m.seats[0], m.seats[1]) = (m.seats[1], m.seats[0]);
        assertTrue(h != pot.hashTerms(ID, m), "seat order");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.seats[2] = stranger;
        assertTrue(h != pot.hashTerms(ID, m), "seat set");
        m = _params(3, IConditionalPot.Rule.WINNER_TAKES_ALL);
        assertTrue(h != pot.hashTerms(ID, m), "rule");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.oracle = stranger;
        assertTrue(h != pot.hashTerms(ID, m), "oracle");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.fundDeadline += 1;
        assertTrue(h != pot.hashTerms(ID, m), "fund deadline");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.settleDeadline += 1;
        assertTrue(h != pot.hashTerms(ID, m), "settle deadline");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.challengeWindow += 1;
        assertTrue(h != pot.hashTerms(ID, m), "challenge window");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.minPlaySeconds += 1;
        assertTrue(h != pot.hashTerms(ID, m), "min play");
        m = _params(3, IConditionalPot.Rule.TOP2_70_30);
        m.metadataHash = keccak256("other metadata");
        assertTrue(h != pot.hashTerms(ID, m), "metadata");
        m = _params(2, IConditionalPot.Rule.TOP2_70_30);
        assertTrue(h != pot.hashTerms(ID, m), "seat count");
    }

    function test_create_acceptsTwoThreeAndFourSeats() public {
        for (uint256 n = 2; n <= 4; ++n) {
            bytes32 id = keccak256(abi.encode("n", n));
            _create(id, n, IConditionalPot.Rule.WINNER_TAKES_ALL);
            assertEq(pot.getPot(id).seats.length, n);
            assertEq(pot.getPot(id).total, n * STAKE);
        }
    }

    function test_create_acceptsSecondAllowedAsset() public {
        vm.prank(relayer);
        pot.create(ID, _params(2, IConditionalPot.Rule.EQUAL_AMONG_TOP, address(eurc)));
        assertEq(pot.getPot(ID).asset, address(eurc));
    }

    function test_create_anyoneCanCreate_andIdIsRelayerSupplied() public {
        vm.prank(stranger);
        pot.create(keccak256("whatever"), _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL));
        assertEq(uint8(_state(keccak256("whatever"))), uint8(IConditionalPot.State.Funding));
    }

    function test_create_revertsOnDuplicateId() public {
        _create(ID, 2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        IConditionalPot.CreateParams memory p = _params(3, IConditionalPot.Rule.TOP2_70_30);
        vm.expectRevert(IConditionalPot.PotExists.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnOneSeat() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.seats = new address[](1);
        p.seats[0] = players[0];
        vm.expectRevert(IConditionalPot.BadSeatCount.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnFiveSeats() public {
        IConditionalPot.CreateParams memory p = _params(4, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.seats = new address[](5);
        for (uint256 i; i < 4; ++i) p.seats[i] = players[i];
        p.seats[4] = stranger;
        vm.expectRevert(IConditionalPot.BadSeatCount.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnDuplicateSeat() public {
        IConditionalPot.CreateParams memory p = _params(3, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.seats[2] = players[0];
        vm.expectRevert(IConditionalPot.DuplicateSeat.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnZeroSeat() public {
        IConditionalPot.CreateParams memory p = _params(3, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.seats[1] = address(0);
        vm.expectRevert(IConditionalPot.ZeroSeat.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnZeroStake() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.stake = 0;
        vm.expectRevert(IConditionalPot.ZeroStake.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnAssetNotAllowed() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL, stranger);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.AssetNotAllowed.selector, stranger));
        pot.create(ID, p);
    }

    function test_create_revertsOnFundDeadlineNotInFuture() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.fundDeadline = uint64(block.timestamp); // equal timestamp is already expired
        vm.expectRevert(IConditionalPot.BadDeadlines.selector);
        pot.create(ID, p);
        p.fundDeadline = uint64(block.timestamp - 1);
        vm.expectRevert(IConditionalPot.BadDeadlines.selector);
        pot.create(ID, p);
    }

    function test_create_requiresRoomForMinPlayAfterFundDeadline() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        // fundDeadline + minPlay == settleDeadline is rejected (must be strictly less)
        p.settleDeadline = p.fundDeadline + MIN_PLAY;
        vm.expectRevert(IConditionalPot.BadDeadlines.selector);
        pot.create(ID, p);
        p.settleDeadline = p.fundDeadline; // settle not after fund
        vm.expectRevert(IConditionalPot.BadDeadlines.selector);
        pot.create(ID, p);
        p.settleDeadline = p.fundDeadline + MIN_PLAY + 1; // tightest valid
        pot.create(ID, p);
        assertEq(uint8(_state(ID)), uint8(IConditionalPot.State.Funding));
    }

    function test_create_windowMustBeAtLeast60Seconds() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.challengeWindow = 59;
        vm.expectRevert(IConditionalPot.WindowTooShort.selector);
        pot.create(ID, p);
        p.challengeWindow = 60;
        pot.create(ID, p);
        assertEq(pot.getPot(ID).challengeWindow, 60);
    }

    function test_create_requiresPositiveMinPlay() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        p.minPlaySeconds = 0;
        vm.expectRevert(IConditionalPot.BadMinPlay.selector);
        pot.create(ID, p);
    }

    function test_create_revertsOnRuleOutOfRange() public {
        IConditionalPot.CreateParams memory p = _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL);
        bytes memory data = abi.encodeCall(pot.create, (ID, p));
        // The Rule enum is the 4th word of the CreateParams tuple head; patch it to 3 (invalid).
        // selector(4) + potId(32) + tupleOffset(32) + asset(32) + stake(32) + seatsOffset(32) => rule word
        uint256 ruleWordOffset = 4 + 32 + 32 + 32 + 32 + 32;
        assembly {
            mstore(add(add(data, 32), ruleWordOffset), 3)
        }
        (bool ok,) = address(pot).call(data);
        assertFalse(ok);
        vm.expectRevert(IConditionalPot.UnknownPot.selector); // nothing was recorded
        pot.getPot(ID);
    }

    function test_getPot_revertsForUnknownPot() public {
        vm.expectRevert(IConditionalPot.UnknownPot.selector);
        pot.getPot(keccak256("nope"));
    }

    // ------------------------------------------------------------- constructor

    function _list(address a, address b, address c, address d, uint256 n) internal pure returns (address[] memory r) {
        r = new address[](n);
        if (n > 0) r[0] = a;
        if (n > 1) r[1] = b;
        if (n > 2) r[2] = c;
        if (n > 3) r[3] = d;
    }

    function test_constructor_rejectsBadAssetLists() public {
        HostileToken t3 = new HostileToken("T3", "T3");
        HostileToken t4 = new HostileToken("T4", "T4");
        vm.expectRevert(IConditionalPot.BadAssetList.selector);
        new ConditionalPot(new address[](0));
        vm.expectRevert(IConditionalPot.BadAssetList.selector);
        new ConditionalPot(_list(address(0), address(0), address(0), address(0), 1));
        vm.expectRevert(IConditionalPot.BadAssetList.selector);
        new ConditionalPot(_list(address(usdc), address(usdc), address(0), address(0), 2));
        address[] memory five = new address[](5);
        five[0] = address(usdc);
        five[1] = address(eurc);
        five[2] = address(t3);
        five[3] = address(t4);
        five[4] = address(new HostileToken("T5", "T5"));
        vm.expectRevert(IConditionalPot.BadAssetList.selector);
        new ConditionalPot(five);
        // four distinct assets are fine
        ConditionalPot four = new ConditionalPot(_list(address(usdc), address(eurc), address(t3), address(t4), 4));
        assertEq(four.allowedAssets().length, 4);
    }

    function test_constructor_rejectsNonSixDecimalAsset() public {
        HostileToken t18 = new HostileToken("T18", "T18");
        t18.setDecimals(18);
        vm.expectRevert(abi.encodeWithSelector(IConditionalPot.BadDecimals.selector, address(t18)));
        new ConditionalPot(_list(address(usdc), address(t18), address(0), address(0), 2));
    }

    function test_constructor_allowlistIsExactlyTheConstructorList() public view {
        address[] memory a = pot.allowedAssets();
        assertEq(a.length, 2);
        assertEq(a[0], address(usdc));
        assertEq(a[1], address(eurc));
        assertTrue(pot.isAllowedAsset(address(usdc)));
        assertTrue(pot.isAllowedAsset(address(eurc)));
        assertFalse(pot.isAllowedAsset(stranger));
        assertEq(usdc.decimals(), 6);
        assertEq(eurc.decimals(), 6);
    }
}
