// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SplitPayout} from "../SplitPayout.sol";
import {MockEIP3009Token} from "./mocks/MockEIP3009Token.sol";

/// @dev Mock token that rejects transfers to blocked addresses (USDC-blacklist style).
contract BlacklistEIP3009Token is MockEIP3009Token {
    mapping(address => bool) public blocked;

    constructor() MockEIP3009Token("Mock USDC", "USDC") {}

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }
}

contract SplitPayoutTest is Test {
    SplitPayout internal sp;
    MockEIP3009Token internal usdc;
    MockEIP3009Token internal eurc;

    address internal operator = makeAddr("operator");
    address internal repA = makeAddr("repA");
    address internal repB = makeAddr("repB");
    address internal relayer = makeAddr("relayer");
    address[4] internal recs;

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant CLOSE = T0 + 1000;
    uint256 internal constant DEADLINE = T0 + 2000;
    bytes32 internal constant TID = keccak256("table-A");
    bytes32 internal constant TID_B = keccak256("table-B");
    bytes32 internal constant HASH = keccak256("result");

    struct Cheer {
        bytes32 tid;
        uint256 amount;
        bytes32 salt;
        uint256 validBefore;
        address who;
        uint256 pk;
    }

    function setUp() public virtual {
        vm.warp(T0);
        recs[0] = makeAddr("rec0");
        recs[1] = makeAddr("rec1");
        recs[2] = makeAddr("rec2");
        recs[3] = makeAddr("rec3");
        usdc = new MockEIP3009Token("Mock USDC", "USDC");
        eurc = new MockEIP3009Token("Mock EURC", "EURC");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(eurc);
        sp = new SplitPayout(assets);
    }

    // ---------- helpers ----------

    function _params(uint256 n) internal view returns (SplitPayout.TableParams memory p) {
        p.asset = address(usdc);
        p.operator = operator;
        p.recipients = new address[](n);
        for (uint256 i; i < n; ++i) p.recipients[i] = recs[i];
        p.closeTime = uint64(CLOSE);
        p.resolveDeadline = uint64(DEADLINE);
        p.reporterA = repA;
        p.reporterB = repB;
    }

    function _create(uint256 n) internal {
        sp.createTable(TID, _params(n));
    }

    function _actor(uint256 i) internal pure returns (address a, uint256 pk) {
        pk = 0xC0DE0 + i;
        a = vm.addr(pk);
    }

    function _sign(uint256 pk, address from, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, address(sp), value, uint256(0), validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function _newCheer(bytes32 tid, uint256 idx, uint256 amount) internal pure returns (Cheer memory c) {
        c.tid = tid;
        c.amount = amount;
        c.salt = keccak256(abi.encode(idx));
        c.validBefore = CLOSE;
        (c.who, c.pk) = _actor(idx);
    }

    function _sig(Cheer memory c) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 nonce = sp.nonceFor(c.tid, c.who, c.amount, c.salt);
        (v, r, s) = _sign(c.pk, c.who, c.amount, c.validBefore, nonce);
    }

    function _send(Cheer memory c, uint8 v, bytes32 r, bytes32 s) internal {
        sp.cheer(c.tid, c.who, c.amount, c.salt, 0, c.validBefore, v, r, s);
    }

    function _cheer(bytes32 tid, uint256 idx, uint256 amount) internal returns (address who) {
        Cheer memory c = _newCheer(tid, idx, amount);
        usdc.mint(c.who, amount);
        (uint8 v, bytes32 r, bytes32 s) = _sig(c);
        _send(c, v, r, s);
        who = c.who;
    }

    function _cheerExpectRevert(Cheer memory c, bytes4 sel) internal {
        usdc.mint(c.who, c.amount);
        (uint8 v, bytes32 r, bytes32 s) = _sig(c);
        vm.expectRevert(sel);
        _send(c, v, r, s);
    }

    function _report(bool verified) internal {
        vm.prank(repA);
        sp.report(TID, HASH, verified);
        vm.prank(repB);
        sp.report(TID, HASH, verified);
    }

    function _resolve(bool verified) internal {
        vm.warp(CLOSE);
        _report(verified);
    }

    function _status() internal view returns (uint256) {
        return uint256(sp.getTable(TID).status);
    }

    // ---------- constructor ----------

    function test_ConstructorRejectsBadAssetLists() public {
        address[] memory a = new address[](0);
        vm.expectRevert(SplitPayout.InvalidAssetList.selector);
        new SplitPayout(a);

        a = new address[](1);
        vm.expectRevert(SplitPayout.InvalidAssetList.selector);
        new SplitPayout(a); // zero address

        a = new address[](2);
        a[0] = address(usdc);
        a[1] = address(usdc);
        vm.expectRevert(SplitPayout.InvalidAssetList.selector);
        new SplitPayout(a); // duplicate

        a = new address[](5);
        for (uint256 i; i < 5; ++i) a[i] = address(uint160(0x1000 + i));
        vm.expectRevert(SplitPayout.InvalidAssetList.selector);
        new SplitPayout(a);
    }

    // ---------- (1) equal split ----------

    function _splitCase(uint256 n, uint256[] memory amts) internal {
        _create(n);
        uint256 total;
        for (uint256 i; i < amts.length; ++i) {
            _cheer(TID, i + 1, amts[i]);
            total += amts[i];
        }
        assertEq(usdc.balanceOf(address(sp)), total);
        _resolve(true);
        assertEq(_status(), 2);

        uint256 share = total / n;
        uint256 rem = total % n;
        assertEq(sp.previewPayout(TID, recs[0]), share + rem);
        for (uint256 i; i < n; ++i) {
            vm.prank(relayer);
            sp.claimPayout(TID, recs[i]);
            assertEq(usdc.balanceOf(recs[i]), i == 0 ? share + rem : share);
            assertEq(sp.previewPayout(TID, recs[i]), 0);
        }
        assertEq(usdc.balanceOf(relayer), 0, "relayer paid");
        assertEq(usdc.balanceOf(address(sp)), 0, "dust");
    }

    function test_EqualSplit_ThreeRecipients_RemainderToFirst() public {
        uint256[] memory amts = new uint256[](3);
        amts[0] = 50_000;
        amts[1] = 100_000;
        amts[2] = 250_000;
        _splitCase(3, amts);
        assertEq(usdc.balanceOf(recs[0]), 133_334);
        assertEq(usdc.balanceOf(recs[1]), 133_333);
        assertEq(usdc.balanceOf(recs[2]), 133_333);
    }

    function test_EqualSplit_TwoRecipients() public {
        uint256[] memory amts = new uint256[](3);
        amts[0] = 50_000;
        amts[1] = 100_000;
        amts[2] = 250_000;
        _splitCase(2, amts);
        assertEq(usdc.balanceOf(recs[0]), 200_000);
        assertEq(usdc.balanceOf(recs[1]), 200_000);
    }

    function test_EqualSplit_FourRecipients() public {
        uint256[] memory amts = new uint256[](3);
        amts[0] = 50_000;
        amts[1] = 100_000;
        amts[2] = 250_000;
        _splitCase(4, amts);
        assertEq(usdc.balanceOf(recs[3]), 100_000);
    }

    function test_EqualSplit_ThreeRecipients_RemainderTwo() public {
        // 5 cheers: 50k*2 + 100k + 250k*2 = 700_000 => 233_333 r1; 233_334 first
        uint256[] memory amts = new uint256[](5);
        amts[0] = 50_000;
        amts[1] = 50_000;
        amts[2] = 100_000;
        amts[3] = 250_000;
        amts[4] = 250_000;
        _splitCase(3, amts);
        assertEq(usdc.balanceOf(recs[0]), 233_334);
    }

    function test_Events_CheerResolveClaim() public {
        _create(3);
        Cheer memory c = _newCheer(TID, 1, 100_000);
        usdc.mint(c.who, c.amount);
        (uint8 v, bytes32 r, bytes32 s) = _sig(c);
        vm.expectEmit(true, true, false, true, address(sp));
        emit SplitPayout.Cheered(TID, c.who, 100_000);
        _send(c, v, r, s);

        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, HASH, true);
        vm.expectEmit(true, false, false, true, address(sp));
        emit SplitPayout.TableResolved(TID, 100_000);
        vm.prank(repB);
        sp.report(TID, HASH, true);

        vm.expectEmit(true, true, false, true, address(sp));
        emit SplitPayout.PayoutClaimed(TID, recs[0], 33_334);
        sp.claimPayout(TID, recs[0]);
    }

    // ---------- (2) refund timeout ----------

    function _cheerThree() internal returns (address a1, address a2, address a3) {
        a1 = _cheer(TID, 1, 50_000);
        a2 = _cheer(TID, 2, 100_000);
        a3 = _cheer(TID, 3, 250_000);
    }

    function _assertRefundsAndNoPayout(address a1, address a2, address a3) internal {
        vm.expectRevert(SplitPayout.NotResolved.selector);
        sp.claimPayout(TID, recs[0]);

        vm.prank(relayer);
        sp.claimRefund(TID, a1);
        sp.claimRefund(TID, a2);
        sp.claimRefund(TID, a3);
        assertEq(usdc.balanceOf(a1), 50_000);
        assertEq(usdc.balanceOf(a2), 100_000);
        assertEq(usdc.balanceOf(a3), 250_000);
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(usdc.balanceOf(address(sp)), 0);

        vm.expectRevert(SplitPayout.NothingToClaim.selector);
        sp.claimRefund(TID, a1);
        vm.expectRevert(SplitPayout.NothingToClaim.selector);
        sp.claimRefund(TID, relayer); // never cheered
        vm.expectRevert(SplitPayout.NotResolved.selector);
        sp.claimPayout(TID, recs[0]);
    }

    function test_RefundTimeout_SingleReporter() public {
        _create(3);
        (address a1, address a2, address a3) = _cheerThree();
        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, HASH, true);

        vm.warp(DEADLINE - 1);
        vm.expectRevert(SplitPayout.VoidUnavailable.selector);
        sp.voidExpired(TID);
        vm.expectRevert(SplitPayout.NotVoid.selector);
        sp.claimRefund(TID, a1);

        vm.warp(DEADLINE);
        vm.expectEmit(true, false, false, false, address(sp));
        emit SplitPayout.TableVoided(TID);
        sp.voidExpired(TID);
        assertEq(_status(), 3);
        _assertRefundsAndNoPayout(a1, a2, a3);
    }

    function test_RefundTimeout_DisagreeingReports() public {
        _create(3);
        (address a1, address a2, address a3) = _cheerThree();
        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, keccak256("A"), true);
        vm.prank(repB);
        sp.report(TID, keccak256("B"), true);
        assertEq(_status(), 1, "still open");

        vm.warp(DEADLINE - 1);
        vm.expectRevert(SplitPayout.VoidUnavailable.selector);
        sp.voidExpired(TID);
        vm.warp(DEADLINE);
        sp.voidExpired(TID);
        _assertRefundsAndNoPayout(a1, a2, a3);
    }

    function test_RefundTimeout_NoReports() public {
        _create(2);
        (address a1, address a2, address a3) = _cheerThree();
        vm.warp(DEADLINE);
        sp.voidExpired(TID);
        _assertRefundsAndNoPayout(a1, a2, a3);
    }

    // ---------- (3) signed intent tamper ----------

    function _tamper(Cheer memory orig, Cheer memory alt) internal {
        usdc.mint(orig.who, 1e6);
        usdc.mint(alt.who, 1e6);
        (uint8 v, bytes32 r, bytes32 s) = _sig(orig);
        vm.expectRevert(bytes("EIP712: invalid signature"));
        _send(alt, v, r, s);
        assertEq(sp.getTable(alt.tid).total, 0);
    }

    function test_Tamper_Amount() public {
        _create(3);
        Cheer memory orig = _newCheer(TID, 1, 50_000);
        Cheer memory alt = _newCheer(TID, 1, 250_000);
        _tamper(orig, alt);
        alt.amount = 100_000;
        _tamper(orig, alt);
    }

    function test_Tamper_Spectator() public {
        _create(3);
        Cheer memory orig = _newCheer(TID, 1, 50_000);
        Cheer memory alt = _newCheer(TID, 2, 50_000);
        alt.salt = orig.salt; // only the spectator differs
        _tamper(orig, alt);
    }

    function test_Tamper_Salt() public {
        _create(3);
        Cheer memory orig = _newCheer(TID, 1, 50_000);
        Cheer memory alt = _newCheer(TID, 1, 50_000);
        alt.salt = keccak256("other-salt");
        _tamper(orig, alt);
    }

    function test_Tamper_TableId() public {
        _create(3);
        sp.createTable(TID_B, _params(3));
        Cheer memory orig = _newCheer(TID, 1, 50_000);
        Cheer memory alt = _newCheer(TID_B, 1, 50_000);
        _tamper(orig, alt);
        // signature is valid only for table A
        (uint8 v, bytes32 r, bytes32 s) = _sig(orig);
        _send(orig, v, r, s);
        assertEq(sp.getTable(TID).total, 50_000);
        assertEq(sp.getTable(TID_B).total, 0);
    }

    function test_Tamper_NonceFromOtherDomainFails() public {
        _create(3);
        Cheer memory c = _newCheer(TID, 1, 50_000);
        usdc.mint(c.who, 1e6);
        bytes32[3] memory bad = [
            keccak256(abi.encode(block.chainid + 1, address(sp), c.tid, c.who, c.amount, c.salt)), // other chain
            keccak256(abi.encode(block.chainid, address(0xBEEF), c.tid, c.who, c.amount, c.salt)), // other contract
            keccak256(abi.encode(c.tid, c.who, c.amount, c.salt)) // no domain
        ];
        for (uint256 i; i < 3; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = _sign(c.pk, c.who, c.amount, c.validBefore, bad[i]);
            vm.expectRevert(bytes("EIP712: invalid signature"));
            _send(c, v, r, s);
        }
    }

    // ---------- (4) single report cannot pay ----------

    function test_SingleReportCannotPay() public {
        _create(3);
        _cheerThree();
        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, HASH, true);
        vm.expectRevert(SplitPayout.NotResolved.selector);
        sp.claimPayout(TID, recs[0]);
        assertEq(sp.previewPayout(TID, recs[0]), 0);

        vm.prank(repA);
        vm.expectRevert(SplitPayout.AlreadyReported.selector);
        sp.report(TID, HASH, true);
    }

    function test_MismatchedPairCannotPay() public {
        _create(3);
        _cheerThree();
        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, HASH, true);
        vm.prank(repB);
        sp.report(TID, HASH, false); // same hash, different verified flag
        vm.expectRevert(SplitPayout.NotResolved.selector);
        sp.claimPayout(TID, recs[0]);
        assertEq(_status(), 1);

        (address a,) = _actor(1);
        vm.expectRevert(SplitPayout.NotVoid.selector);
        sp.claimRefund(TID, a);
    }

    function test_MatchedUnverifiedVoidsAndRefunds() public {
        _create(3);
        (address a1, address a2, address a3) = _cheerThree();
        vm.warp(CLOSE);
        vm.prank(repA);
        sp.report(TID, HASH, false);
        vm.prank(repB);
        sp.report(TID, HASH, false);
        assertEq(_status(), 3);
        _assertRefundsAndNoPayout(a1, a2, a3);
    }

    // ---------- (5) exclusion and createTable validation ----------

    function test_RecipientCannotCheer() public {
        _create(3);
        Cheer memory c = _newCheer(TID, 1, 50_000);
        c.who = recs[1];
        vm.expectRevert(SplitPayout.RecipientCannotCheer.selector);
        sp.cheer(c.tid, c.who, c.amount, c.salt, 0, c.validBefore, 27, bytes32(0), bytes32(0));
    }

    function test_CreateTableRejectsBadParams() public {
        SplitPayout.TableParams memory p = _params(3);
        p.recipients[1] = p.recipients[0];
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p); // duplicate recipients

        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, _params(1));
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, _params(0));

        p = _params(4);
        address[] memory five = new address[](5);
        for (uint256 i; i < 4; ++i) five[i] = p.recipients[i];
        five[4] = makeAddr("rec4");
        p.recipients = five;
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);

        p = _params(3);
        p.reporterB = p.reporterA;
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);

        p = _params(3);
        p.reporterA = address(0);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);
        p = _params(3);
        p.reporterB = address(0);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);
        p = _params(3);
        p.operator = address(0);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);
        p = _params(3);
        p.recipients[2] = address(0);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);

        p = _params(3);
        p.closeTime = uint64(T0);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p); // close == now
        p.closeTime = uint64(T0 - 1);
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p); // in the past

        p = _params(3);
        p.resolveDeadline = p.closeTime;
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);
        p.resolveDeadline = p.closeTime - 1;
        vm.expectRevert(SplitPayout.InvalidParameters.selector);
        sp.createTable(TID, p);

        p = _params(3);
        p.asset = makeAddr("notAllowed");
        vm.expectRevert(SplitPayout.InvalidAsset.selector);
        sp.createTable(TID, p);

        vm.expectRevert(SplitPayout.InvalidTable.selector);
        sp.createTable(bytes32(0), _params(3));

        // boundaries accepted: 2 and 4 recipients, second asset, resolveDeadline = close + 1
        p = _params(2);
        sp.createTable(keccak256("t2"), p);
        p = _params(4);
        p.asset = address(eurc);
        p.resolveDeadline = p.closeTime + 1;
        sp.createTable(keccak256("t4"), p);
    }

    function test_CreateTableRejectsDuplicateId() public {
        _create(3);
        vm.expectRevert(SplitPayout.TableExists.selector);
        sp.createTable(TID, _params(3));
    }

    // ---------- (6) repeat claim ----------

    function test_RepeatClaimPayoutReverts() public {
        _create(3);
        _cheerThree();
        _resolve(true);
        sp.claimPayout(TID, recs[1]);
        vm.expectRevert(SplitPayout.AlreadyClaimed.selector);
        sp.claimPayout(TID, recs[1]);
        vm.prank(relayer);
        vm.expectRevert(SplitPayout.AlreadyClaimed.selector);
        sp.claimPayout(TID, recs[1]);
        // non-recipient cannot be claimed for
        vm.expectRevert(SplitPayout.InvalidRecipient.selector);
        sp.claimPayout(TID, relayer);
        // refunds are unavailable on a resolved table
        (address a,) = _actor(1);
        vm.expectRevert(SplitPayout.NotVoid.selector);
        sp.claimRefund(TID, a);
    }

    // ---------- extras ----------

    function test_InvalidAmountReverts() public {
        _create(3);
        Cheer memory c = _newCheer(TID, 1, 70_000);
        _cheerExpectRevert(c, SplitPayout.InvalidAmount.selector);
        c.amount = 0;
        _cheerExpectRevert(c, SplitPayout.InvalidAmount.selector);
        c.amount = 50_001;
        _cheerExpectRevert(c, SplitPayout.InvalidAmount.selector);
    }

    function test_SecondCheerSameAddressReverts() public {
        _create(3);
        _cheer(TID, 1, 50_000);
        Cheer memory c = _newCheer(TID, 1, 100_000);
        c.salt = keccak256("another");
        _cheerExpectRevert(c, SplitPayout.AlreadyCheered.selector);
        assertEq(sp.getTable(TID).total, 50_000);
    }

    function test_TwentySixthCheerRevertsTableFull() public {
        _create(3);
        for (uint256 i = 1; i <= 25; ++i) _cheer(TID, i, 50_000);
        assertEq(sp.getTable(TID).cheerCount, 25);
        Cheer memory c = _newCheer(TID, 26, 50_000);
        _cheerExpectRevert(c, SplitPayout.TableFull.selector);

        _resolve(true);
        uint256 total = 25 * 50_000; // 1_250_000 / 3 = 416_666 r2
        for (uint256 i; i < 3; ++i) sp.claimPayout(TID, recs[i]);
        assertEq(usdc.balanceOf(recs[0]), total / 3 + 2);
        assertEq(usdc.balanceOf(recs[1]), total / 3);
        assertEq(usdc.balanceOf(address(sp)), 0);
    }

    function test_CheerAtCloseTimeReverts_OneBeforeWorks() public {
        _create(3);
        vm.warp(CLOSE - 1);
        _cheer(TID, 1, 50_000);
        vm.warp(CLOSE);
        Cheer memory c = _newCheer(TID, 2, 50_000);
        _cheerExpectRevert(c, SplitPayout.CheersClosed.selector);
    }

    function test_ValidBeforePastCloseReverts() public {
        _create(3);
        Cheer memory c = _newCheer(TID, 1, 50_000);
        c.validBefore = CLOSE + 1;
        _cheerExpectRevert(c, SplitPayout.InvalidAuthorizationWindow.selector);
    }

    function test_CheerUnknownTableAndZeroSpectatorRevert() public {
        Cheer memory c = _newCheer(TID, 1, 50_000);
        vm.expectRevert(SplitPayout.InvalidTable.selector);
        sp.cheer(c.tid, c.who, c.amount, c.salt, 0, c.validBefore, 27, bytes32(0), bytes32(0));

        _create(3);
        vm.expectRevert(SplitPayout.InvalidSpectator.selector);
        sp.cheer(TID, address(0), 50_000, c.salt, 0, c.validBefore, 27, bytes32(0), bytes32(0));
    }

    function test_OperatorCancelBeforeCloseVoidsAndRefunds() public {
        _create(3);
        (address a1, address a2, address a3) = _cheerThree();
        vm.prank(operator);
        sp.cancel(TID);
        assertEq(_status(), 3);
        _assertRefundsAndNoPayout(a1, a2, a3);

        // table no longer accepts cheers or reports
        vm.warp(CLOSE);
        vm.prank(repA);
        vm.expectRevert(SplitPayout.NotOpen.selector);
        sp.report(TID, HASH, true);
    }

    function test_CancelAtOrAfterCloseReverts() public {
        _create(3);
        vm.warp(CLOSE);
        vm.prank(operator);
        vm.expectRevert(SplitPayout.VoidUnavailable.selector);
        sp.cancel(TID);
        vm.warp(CLOSE + 100);
        vm.prank(operator);
        vm.expectRevert(SplitPayout.VoidUnavailable.selector);
        sp.cancel(TID);
    }

    function test_NonOperatorCancelReverts() public {
        _create(3);
        vm.prank(repA);
        vm.expectRevert(SplitPayout.Unauthorized.selector);
        sp.cancel(TID);
        vm.expectRevert(SplitPayout.Unauthorized.selector);
        sp.cancel(TID);
    }

    function test_ReportWindowAndAuthorization() public {
        _create(3);
        vm.prank(repA);
        vm.expectRevert(SplitPayout.InvalidReportWindow.selector);
        sp.report(TID, HASH, true); // before close

        vm.warp(CLOSE);
        vm.prank(relayer);
        vm.expectRevert(SplitPayout.Unauthorized.selector);
        sp.report(TID, HASH, true);
        vm.prank(operator);
        vm.expectRevert(SplitPayout.Unauthorized.selector);
        sp.report(TID, HASH, true);

        vm.warp(DEADLINE - 1);
        vm.prank(repA);
        sp.report(TID, HASH, true); // last valid second

        vm.warp(DEADLINE);
        vm.prank(repB);
        vm.expectRevert(SplitPayout.InvalidReportWindow.selector);
        sp.report(TID, HASH, true);
    }

    function test_UnknownTableViewsRevert() public {
        vm.expectRevert(SplitPayout.InvalidTable.selector);
        sp.getTable(TID);
        vm.expectRevert(SplitPayout.InvalidTable.selector);
        sp.claimPayout(TID, recs[0]);
        vm.expectRevert(SplitPayout.InvalidTable.selector);
        sp.voidExpired(TID);
    }

    function test_BlacklistedRecipientCannotBlockOthers() public {
        BlacklistEIP3009Token bl = new BlacklistEIP3009Token();
        usdc = bl;
        address[] memory assets = new address[](1);
        assets[0] = address(bl);
        sp = new SplitPayout(assets);

        _create(3);
        _cheerThree(); // 400_000
        bl.setBlocked(recs[1], true);
        _resolve(true);

        sp.claimPayout(TID, recs[0]);
        vm.expectRevert(bytes("blocked"));
        sp.claimPayout(TID, recs[1]);
        sp.claimPayout(TID, recs[2]);
        assertEq(bl.balanceOf(recs[0]), 133_334);
        assertEq(bl.balanceOf(recs[2]), 133_333);
        assertEq(bl.balanceOf(address(sp)), 133_333, "blocked share stays reserved");
        assertFalse(sp.payoutClaimed(TID, recs[1]));

        // once unblocked, the failed claim succeeds with the exact share
        bl.setBlocked(recs[1], false);
        sp.claimPayout(TID, recs[1]);
        assertEq(bl.balanceOf(recs[1]), 133_333);
        assertEq(bl.balanceOf(address(sp)), 0);
    }
}
