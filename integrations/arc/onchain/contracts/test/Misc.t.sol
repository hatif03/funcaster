// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PotBase} from "./PotBase.sol";
import {IConditionalPot} from "../IConditionalPot.sol";

contract MiscTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;

    // ------------------------------------------------------------ no ETH, no admin

    function test_noEthAccepted_plainTransferAndUnknownSelector() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(pot).call{value: 1 wei}("");
        assertFalse(ok, "no receive");
        (ok,) = address(pot).call{value: 1 wei}(hex"deadbeef");
        assertFalse(ok, "no payable fallback");
        (ok,) = address(pot).call(hex"deadbeef");
        assertFalse(ok, "no fallback at all");
        assertEq(address(pot).balance, 0);
    }

    function test_noFunctionIsPayable() public {
        vm.deal(address(this), 10 ether);
        _createLocked(ID, 2, WTA);
        bytes[] memory calls = new bytes[](16);
        IConditionalPot.CreateParams memory p = _params(2, WTA);
        calls[0] = abi.encodeCall(pot.create, (ID2, p));
        calls[1] = abi.encodeCall(pot.fundWithAuthorization, (ID, players[0], "", 0, 0, bytes32(0), ""));
        calls[2] = abi.encodeCall(pot.settleCooperative, (ID, _p(1, 2), new bytes[](2)));
        calls[3] = abi.encodeCall(pot.propose, (ID, _p(1, 2), bytes32(0)));
        calls[4] = abi.encodeCall(pot.contestWithSig, (ID, players[0], ""));
        calls[5] = abi.encodeCall(pot.finalize, (ID, _p(1, 2)));
        calls[6] = abi.encodeCall(pot.refund, (ID));
        calls[7] = abi.encodeCall(pot.claim, (ID, players[0]));
        calls[8] = abi.encodeCall(pot.getPot, (ID));
        calls[9] = abi.encodeCall(pot.claimableOf, (ID, players[0]));
        calls[10] = abi.encodeCall(pot.isAllowedAsset, (address(usdc)));
        calls[11] = abi.encodeCall(pot.allowedAssets, ());
        calls[12] = abi.encodeCall(pot.fundingNonce, (ID, players[0]));
        calls[13] = abi.encodeCall(pot.acceptDigest, (ID, TERMS));
        calls[14] = abi.encodeCall(pot.MIN_RETAINED_BALANCE, ());
        calls[15] = abi.encodeCall(pot.eip712Domain, ());
        for (uint256 i; i < calls.length; ++i) {
            (bool ok,) = address(pot).call{value: 1 wei}(calls[i]);
            assertFalse(ok, "call with value must revert");
        }
        assertEq(address(pot).balance, 0);
    }

    function test_noAdminSurface() public {
        // None of the usual privileged selectors exist.
        bytes4[9] memory sels = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("transferOwnership(address)")),
            bytes4(keccak256("renounceOwnership()")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("unpause()")),
            bytes4(keccak256("upgradeTo(address)")),
            bytes4(keccak256("upgradeToAndCall(address,bytes)")),
            bytes4(keccak256("setFee(uint256)")),
            bytes4(keccak256("addAsset(address)"))
        ];
        for (uint256 i; i < sels.length; ++i) {
            (bool ok,) = address(pot).call(abi.encodePacked(sels[i], bytes32(uint256(uint160(stranger)))));
            assertFalse(ok);
        }
    }

    function test_noSelfdestructOrDelegatecallInRuntimeCode() public view {
        bytes memory code = address(pot).code;
        uint256 len = code.length;
        uint256 metaLen = (uint256(uint8(code[len - 2])) << 8) | uint256(uint8(code[len - 1]));
        uint256 end = len - 2 - metaLen;
        for (uint256 i; i < end; ++i) {
            uint8 op = uint8(code[i]);
            assertTrue(op != 0xff, "SELFDESTRUCT");
            assertTrue(op != 0xf4, "DELEGATECALL");
            assertTrue(op != 0xf2, "CALLCODE");
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; // skip PUSH data
        }
    }

    function test_contractNeverHoldsEther_evenViaForcedSend() public {
        // forced ether (e.g. coinbase / selfdestruct from elsewhere) cannot be used by any path
        vm.deal(address(pot), 1 ether);
        _createLocked(ID, 2, WTA);
        _settleCoop(ID, _p(1, 2));
        _claimAll(ID, 2);
        assertEq(usdc.balanceOf(address(pot)), 0);
        assertEq(players[0].balance, 0);
    }

    // ----------------------------------------------------------------- EIP-712

    function test_eip712Domain_matchesChonksPotDomain() public view {
        (bytes1 fields, string memory name, string memory version, uint256 chainId, address verifying, bytes32 salt,
            uint256[] memory ext) = pot.eip712Domain();
        assertEq(fields, hex"0f");
        assertEq(name, "ChonksPot");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifying, address(pot));
        assertEq(salt, bytes32(0));
        assertEq(ext.length, 0);
    }

    function test_digests_matchIndependentEip712Computation() public view {
        bytes32 domain = _domainSeparator(address(pot), "ChonksPot", "1", block.chainid);
        assertEq(pot.acceptDigest(ID, TERMS), _typed(domain, keccak256(abi.encode(ACCEPT_TYPEHASH, ID, TERMS))));
        bytes32 ph = pot.hashPlaces(_p(1, 1, 2));
        assertEq(pot.settleDigest(ID, ph), _typed(domain, keccak256(abi.encode(SETTLE_TYPEHASH, ID, ph))));
        assertEq(pot.contestDigest(ID), _typed(domain, keccak256(abi.encode(CONTEST_TYPEHASH, ID))));
    }

    function test_digests_changeWithChainIdAndWithPot() public {
        bytes32 a = pot.acceptDigest(ID, TERMS);
        assertTrue(a != pot.acceptDigest(ID2, TERMS), "pot id is in the digest");
        assertTrue(a != pot.acceptDigest(ID, keccak256("x")), "terms hash is in the digest");
        vm.chainId(block.chainid + 1);
        bytes32 other = pot.acceptDigest(ID, TERMS);
        assertTrue(a != other, "chain id is in the digest");
        assertEq(other, _typed(_domainSeparator(address(pot), "ChonksPot", "1", block.chainid), keccak256(abi.encode(ACCEPT_TYPEHASH, ID, TERMS))));
    }

    function test_digests_differPerMessageKind() public view {
        assertTrue(pot.acceptDigest(ID, TERMS) != pot.settleDigest(ID, TERMS));
        assertTrue(pot.contestDigest(ID) != pot.acceptDigest(ID, bytes32(0)));
    }

    function test_helpers_matchSpecFormulas() public view {
        assertEq(pot.fundingNonce(ID, players[1]), keccak256(abi.encode("chonks-fund", ID, players[1])));
        uint8[] memory places = _p(1, 2, 2);
        assertEq(pot.hashPlaces(places), keccak256(abi.encode(places)));
        assertEq(pot.MIN_CHALLENGE_WINDOW(), 60);
        assertEq(pot.MIN_RETAINED_BALANCE(), 50_000);
    }

    // ------------------------------------------- lifecycle conservation (fuzzed)

    function testFuzz_everyPathConservesFunds(uint8 pathSeed, uint8 nSeed, uint8 ruleSeed, uint256 placeSeed) public {
        uint256 n = bound(nSeed, 2, 4);
        uint256 path = bound(pathSeed, 0, 4);
        IConditionalPot.Rule rule = IConditionalPot.Rule(bound(ruleSeed, 0, 2));
        // dense places from the seed
        uint8[] memory places = new uint8[](n);
        for (uint256 i; i < n; ++i) places[i] = uint8(i + 1);
        for (uint256 i = n; i > 1; --i) {
            uint256 j = uint256(keccak256(abi.encode(placeSeed, i))) % i;
            (places[i - 1], places[j]) = (places[j], places[i - 1]);
        }
        if (placeSeed % 3 == 0) places[1] = places[0]; // introduce a tie, keep ranks dense
        if (!_dense(places)) {
            for (uint256 i; i < n; ++i) places[i] = 1;
        }

        bytes32 id = keccak256(abi.encode("cons", path));
        _create(id, n, rule);
        bool refunded;
        if (path == 3) {
            for (uint256 i; i + 1 < n; ++i) _fundSeat(id, i); // leave the last seat unfunded
            vm.warp(pot.getPot(id).fundDeadline);
            pot.refund(id);
            refunded = true;
        } else {
            _fundAll(id, n);
            if (path == 0) {
                _settleCoop(id, places);
            } else if (path == 1) {
                _propose(id, places);
                vm.warp(block.timestamp + WINDOW);
                pot.finalize(id, places);
            } else if (path == 2) {
                _propose(id, places);
                pot.contestWithSig(id, players[n - 1], _contestSig(pks[n - 1], id));
                pot.refund(id);
                refunded = true;
            } else {
                vm.warp(pot.getPot(id).settleDeadline);
                pot.refund(id);
                refunded = true;
            }
        }

        uint256 funded = path == 3 ? n - 1 : n;
        assertEq(_sumClaimable(id, n), refunded ? funded * STAKE : n * STAKE, "claimable equals what was put in");
        assertEq(usdc.balanceOf(address(pot)), funded * STAKE);
        _claimAll(id, n);
        assertEq(usdc.balanceOf(address(pot)), 0, "pot is empty after all claims");
        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += usdc.balanceOf(players[i]);
            if (refunded) assertEq(usdc.balanceOf(players[i]), START_BALANCE, "refund returns the exact stake");
        }
        assertEq(total, n * START_BALANCE, "no value created or destroyed");
    }

    function _dense(uint8[] memory p) internal pure returns (bool) {
        bool[6] memory seen;
        uint8 k;
        for (uint256 i; i < p.length; ++i) {
            if (p[i] == 0 || p[i] > p.length) return false;
            seen[p[i]] = true;
            if (p[i] > k) k = p[i];
        }
        for (uint8 j = 1; j <= k; ++j) {
            if (!seen[j]) return false;
        }
        return true;
    }

    function test_twoPotsShareTheContractWithoutCrossTalk() public {
        _createLocked(ID, 2, WTA);
        _createLocked(ID2, 3, IConditionalPot.Rule.TOP2_70_30);
        _settleCoop(ID, _p(1, 2));
        assertEq(uint8(_state(ID2)), uint8(IConditionalPot.State.Locked));
        assertEq(_sumClaimable(ID2, 3), 0);
        assertEq(usdc.balanceOf(address(pot)), 5 * STAKE);
        pot.claim(ID, players[0]);
        assertEq(usdc.balanceOf(address(pot)), 3 * STAKE);
    }

    function test_potsInDifferentAssetsNeverMix() public {
        vm.startPrank(relayer);
        pot.create(ID, _params(2, WTA, address(usdc)));
        pot.create(ID2, _params(2, WTA, address(eurc)));
        vm.stopPrank();
        _fundAll(ID, 2);
        _fundAll(ID2, 2);
        assertEq(usdc.balanceOf(address(pot)), 2 * STAKE);
        assertEq(eurc.balanceOf(address(pot)), 2 * STAKE);
        _settleCoop(ID2, _p(2, 1));
        pot.claim(ID2, players[1]);
        assertEq(eurc.balanceOf(players[1]), START_BALANCE + STAKE);
        assertEq(usdc.balanceOf(players[1]), START_BALANCE - STAKE); // untouched by the EURC pot
        assertEq(usdc.balanceOf(address(pot)), 2 * STAKE);
    }

    /// @dev Frozen known answers shared with src/lib/signing.test.ts. If one changes, the relay and
    ///      phone signing code must change with it.
    function test_knownAnswers_sharedWithTypeScript() public view {
        assertEq(address(pot), 0xF62849F9A0B5Bf2913b396098F7c7019b51A820a);
        assertEq(block.chainid, 31337);
        IConditionalPot.CreateParams memory p = _params(3, IConditionalPot.Rule.TOP2_70_30);
        assertEq(address(usdc), 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f);
        assertEq(players[0], 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7);
        assertEq(players[1], 0x0376AAc07Ad725E01357B1725B5ceC61aE10473c);
        assertEq(players[2], 0x0F89F1868aF3b14a5eca86ed9a5404A742a11454);
        assertEq(oracle, 0x5F084Ee99790C8150F9FE7BD7bcCBC979F9F5Dd0);
        assertEq(p.fundDeadline, 1_700_003_600);
        assertEq(p.settleDeadline, 1_700_086_400);
        bytes32 terms = pot.hashTerms(ID, p);
        assertEq(terms, 0x0f52473ee39ec509df5fc8f5d9ba9ac7c53e7480798804fea2b43bb8b742c7f3);
        assertEq(pot.acceptDigest(ID, terms), 0xa926c75162b309d5b4495789b223f42634cab716a8a3f681daa8cb3d91de0c9a);
        assertEq(pot.hashPlaces(_p(1, 1, 2)), 0x994e6ca720801e62b5cfec185d05a54cd20676bb5f16d480e8b3f6f09920ce29);
        assertEq(
            pot.settleDigest(ID, pot.hashPlaces(_p(1, 1, 2))),
            0x448cd79fad3b5f0ee567989fb675c2bcbea8540a1f431231f52a29da0df6afe5
        );
        assertEq(pot.contestDigest(ID), 0x0809eeba3d6e488330ea828aa2f8ae2a31d0351cab6f08d42e0aa956854f9282);
        assertEq(pot.fundingNonce(ID, players[1]), 0x7646387e312c2387400d1267d104cbf5797a3b96d09fb3104daab1105723e1ed);
    }
}
