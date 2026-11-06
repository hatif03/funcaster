// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ConditionalPot} from "../ConditionalPot.sol";
import {IConditionalPot} from "../IConditionalPot.sol";
import {MockFiatToken, HostileToken, Wallet1271} from "./mocks/MockTokens.sol";

/// @dev Shared fixtures. Signatures are produced with vm.sign over digests this file computes on
///      its own (not via the contract's digest views), so signature tests validate the real EIP-712 layout.
abstract contract PotBase is Test {
    uint256 internal constant STAKE = 1_000_000; // 1.000000 of a six-decimal asset
    uint256 internal constant START_BALANCE = 10_000_000;
    uint32 internal constant WINDOW = 300;
    uint32 internal constant MIN_PLAY = 60;
    bytes32 internal constant TERMS = keccak256("chonks terms v1"); // metadata commitment
    bytes32 internal constant ID = keccak256("pot-1");
    bytes32 internal constant ID2 = keccak256("pot-2");

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant ACCEPT_TYPEHASH = keccak256("Accept(bytes32 potId,bytes32 termsHash)");
    bytes32 internal constant SETTLE_TYPEHASH = keccak256("Settle(bytes32 potId,bytes32 placesHash)");
    bytes32 internal constant CONTEST_TYPEHASH = keccak256("Contest(bytes32 potId)");
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    MockFiatToken internal usdc;
    MockFiatToken internal eurc;
    ConditionalPot internal pot;

    uint256[4] internal pks = [uint256(0xA11CE), uint256(0xB0B), uint256(0xCA401), uint256(0xD0D0)];
    address[4] internal players;
    address internal relayer = makeAddr("relayer");
    address internal oracle = makeAddr("oracle");
    address internal stranger = makeAddr("stranger");
    uint256 internal t0;

    struct Funding {
        bytes accept;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes auth;
    }

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        t0 = block.timestamp;
        usdc = new MockFiatToken("USD Coin", "USDC");
        eurc = new MockFiatToken("EURC", "EURC");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(eurc);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) {
            players[i] = vm.addr(pks[i]);
            usdc.mint(players[i], START_BALANCE);
            eurc.mint(players[i], START_BALANCE);
        }
    }

    // ------------------------------------------------------------- places

    function _p(uint8 a, uint8 b) internal pure returns (uint8[] memory r) {
        r = new uint8[](2);
        r[0] = a;
        r[1] = b;
    }

    function _p(uint8 a, uint8 b, uint8 c) internal pure returns (uint8[] memory r) {
        r = new uint8[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    function _p(uint8 a, uint8 b, uint8 c, uint8 d) internal pure returns (uint8[] memory r) {
        r = new uint8[](4);
        r[0] = a;
        r[1] = b;
        r[2] = c;
        r[3] = d;
    }

    // ------------------------------------------------------------ creation

    function _params(uint256 seatCount, IConditionalPot.Rule rule, address asset)
        internal
        view
        returns (IConditionalPot.CreateParams memory p)
    {
        p.asset = asset;
        p.stake = STAKE;
        p.seats = new address[](seatCount);
        for (uint256 i; i < seatCount; ++i) p.seats[i] = players[i];
        p.rule = rule;
        p.oracle = oracle;
        p.fundDeadline = uint64(t0 + 1 hours);
        p.settleDeadline = uint64(t0 + 1 days);
        p.challengeWindow = WINDOW;
        p.minPlaySeconds = MIN_PLAY;
        p.metadataHash = TERMS;
    }

    function _params(uint256 seatCount, IConditionalPot.Rule rule)
        internal
        view
        returns (IConditionalPot.CreateParams memory)
    {
        return _params(seatCount, rule, address(usdc));
    }

    function _create(bytes32 id, uint256 seatCount, IConditionalPot.Rule rule) internal {
        vm.prank(relayer);
        pot.create(id, _params(seatCount, rule));
    }

    // --------------------------------------------------------------- hashes

    bytes32 internal constant TERMS_HEAD_TYPEHASH =
        keccak256("TermsHead(bytes32 potId,address asset,uint256 stake,bytes32 seatsHash,uint8 rule)");
    bytes32 internal constant TERMS_TAIL_TYPEHASH = keccak256(
        "TermsTail(address oracle,uint64 fundDeadline,uint64 settleDeadline,uint32 challengeWindow,uint32 minPlaySeconds,bytes32 metadataHash)"
    );
    bytes32 internal constant TERMS_TYPEHASH = keccak256("Terms(bytes32 head,bytes32 tail)");

    /// @dev Independent re-statement of the documented canonical terms hash.
    function _termsHash(bytes32 id, IConditionalPot.CreateParams memory p) internal pure returns (bytes32) {
        bytes32 seatsHash = keccak256(abi.encodePacked(p.seats));
        bytes32 head = keccak256(abi.encode(TERMS_HEAD_TYPEHASH, id, p.asset, uint256(p.stake), seatsHash, uint8(p.rule)));
        bytes32 tail = keccak256(
            abi.encode(
                TERMS_TAIL_TYPEHASH, p.oracle, p.fundDeadline, p.settleDeadline, p.challengeWindow, p.minPlaySeconds, p.metadataHash
            )
        );
        return keccak256(abi.encode(TERMS_TYPEHASH, head, tail));
    }

    function _domainSeparator(address verifying, string memory name, string memory version, uint256 chainId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), chainId, verifying));
    }

    function _potDomain() internal view returns (bytes32) {
        return _domainSeparator(address(pot), "ChonksPot", "1", block.chainid);
    }

    function _typed(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _acceptSig(uint256 pk, bytes32 potId, bytes32 terms) internal view returns (bytes memory) {
        return _sig(pk, _typed(_potDomain(), keccak256(abi.encode(ACCEPT_TYPEHASH, potId, terms))));
    }

    function _settleSig(uint256 pk, bytes32 potId, uint8[] memory places) internal view returns (bytes memory) {
        bytes32 placesHash = keccak256(abi.encode(places));
        return _sig(pk, _typed(_potDomain(), keccak256(abi.encode(SETTLE_TYPEHASH, potId, placesHash))));
    }

    function _contestSig(uint256 pk, bytes32 potId) internal view returns (bytes memory) {
        return _sig(pk, _typed(_potDomain(), keccak256(abi.encode(CONTEST_TYPEHASH, potId))));
    }

    function _authSig(
        MockFiatToken token,
        uint256 pk,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (bytes memory) {
        bytes32 domain = _domainSeparator(address(token), token.name(), "2", block.chainid);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        return _sig(pk, _typed(domain, structHash));
    }

    // ------------------------------------------------------------- funding

    /// @dev Builds a fully valid funding bundle for `seat`, signed with `pk`.
    function _funding(bytes32 id, address seat, uint256 pk) internal view returns (Funding memory f) {
        IConditionalPot.PotView memory v = pot.getPot(id);
        f.validAfter = 0;
        f.validBefore = v.fundDeadline;
        f.nonce = keccak256(abi.encode("chonks-fund", id, seat));
        f.accept = _acceptSig(pk, id, v.termsHash);
        f.auth = _authSig(MockFiatToken(v.asset), pk, seat, address(pot), v.stake, f.validAfter, f.validBefore, f.nonce);
    }

    function _submit(bytes32 id, address seat, Funding memory f) internal {
        vm.prank(relayer);
        pot.fundWithAuthorization(id, seat, f.accept, f.validAfter, f.validBefore, f.nonce, f.auth);
    }

    function _fundSeat(bytes32 id, uint256 i) internal {
        _submit(id, players[i], _funding(id, players[i], pks[i]));
    }

    function _fundAll(bytes32 id, uint256 seatCount) internal {
        for (uint256 i; i < seatCount; ++i) _fundSeat(id, i);
    }

    function _createLocked(bytes32 id, uint256 seatCount, IConditionalPot.Rule rule) internal {
        _create(id, seatCount, rule);
        _fundAll(id, seatCount);
    }

    // ---------------------------------------------------------- settlement

    function _coopSigs(bytes32 id, uint8[] memory places) internal view returns (bytes[] memory sigs) {
        sigs = new bytes[](places.length);
        for (uint256 i; i < places.length; ++i) sigs[i] = _settleSig(pks[i], id, places);
    }

    function _settleCoop(bytes32 id, uint8[] memory places) internal {
        vm.prank(relayer);
        pot.settleCooperative(id, places, _coopSigs(id, places));
    }

    /// @dev Locks, warps past the minimum play time, proposes as the oracle.
    function _propose(bytes32 id, uint8[] memory places) internal {
        vm.warp(block.timestamp + MIN_PLAY);
        vm.prank(oracle);
        pot.propose(id, places, keccak256("result"));
    }

    function _claimAll(bytes32 id, uint256 seatCount) internal {
        for (uint256 i; i < seatCount; ++i) {
            if (pot.claimableOf(id, players[i]) != 0) pot.claim(id, players[i]);
        }
    }

    function _sumClaimable(bytes32 id, uint256 seatCount) internal view returns (uint256 sum) {
        for (uint256 i; i < seatCount; ++i) sum += pot.claimableOf(id, players[i]);
    }

    // ------------------------------------------------------------- asserts

    function _wrongState(IConditionalPot.State s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IConditionalPot.WrongState.selector, s);
    }

    function _state(bytes32 id) internal view returns (IConditionalPot.State) {
        return pot.getPot(id).state;
    }

    // ------------------------------------------------------------- hostile

    function _hostilePot(HostileToken.Mode mode) internal returns (HostileToken h, bytes32 id) {
        h = new HostileToken("Hostile", "HOS");
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(h);
        pot = new ConditionalPot(assets);
        for (uint256 i; i < 4; ++i) h.mint(players[i], START_BALANCE);
        h.configure(mode, address(0), address(0), "", false);
        id = ID;
        vm.prank(relayer);
        pot.create(id, _params(2, IConditionalPot.Rule.WINNER_TAKES_ALL, address(h)));
    }
}
