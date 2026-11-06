// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {console} from "forge-std/console.sol";
import {PotBase} from "./PotBase.sol";
import {IConditionalPot} from "../IConditionalPot.sol";

contract PayoutTest is PotBase {
    IConditionalPot.Rule internal constant WTA = IConditionalPot.Rule.WINNER_TAKES_ALL;
    IConditionalPot.Rule internal constant T2 = IConditionalPot.Rule.TOP2_70_30;
    IConditionalPot.Rule internal constant EQ = IConditionalPot.Rule.EQUAL_AMONG_TOP;

    uint256 internal constant ODD = 1_000_001; // makes every rounding path visible

    // ----------------------------------------------------------------- helpers

    function _lockedWith(bytes32 id, uint256 n, IConditionalPot.Rule rule, uint256 stake) internal {
        for (uint256 i; i < n; ++i) {
            usdc.mint(players[i], stake); // make sure any stake plus the retained floor is available
        }
        IConditionalPot.CreateParams memory p = _params(n, rule);
        p.stake = stake;
        vm.prank(relayer);
        pot.create(id, p);
        _fundAll(id, n);
    }

    function _payoutVia(bytes32 id, uint8[] memory places) internal {
        _settleCoop(id, places);
    }

    function _assertPayout(bytes32 id, uint256[4] memory expected, uint256 n) internal view {
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            assertEq(pot.claimableOf(id, players[i]), expected[i], "seat payout");
            sum += expected[i];
        }
        assertEq(sum, pot.getPot(id).total, "expected vector sums to total");
        assertEq(_sumClaimable(id, n), pot.getPot(id).total, "sum invariant");
    }

    // Independent reference model used by the exhaustive / fuzz tests.
    function _refDense(uint8[] memory p) internal pure returns (bool) {
        uint256 n = p.length;
        bool[6] memory seen;
        uint8 k;
        for (uint256 i; i < n; ++i) {
            if (p[i] == 0 || p[i] > n) return false;
            seen[p[i]] = true;
            if (p[i] > k) k = p[i];
        }
        for (uint8 j = 1; j <= k; ++j) {
            if (!seen[j]) return false;
        }
        return true;
    }

    function _refPayout(IConditionalPot.Rule rule, uint256 stake, uint8[] memory p)
        internal
        pure
        returns (uint256[4] memory out)
    {
        uint256 n = p.length;
        uint256 total = stake * n;
        uint256[5] memory count;
        uint8 k;
        for (uint256 i; i < n; ++i) {
            ++count[p[i]];
            if (p[i] > k) k = p[i];
        }
        uint256 tier1 = total;
        uint256 tier2;
        if (rule == IConditionalPot.Rule.TOP2_70_30 && k >= 2) {
            tier1 = total * 70 / 100;
            tier2 = total * 30 / 100;
        }
        uint256 paid;
        uint256 firstTop = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            if (p[i] == 1) {
                out[i] = tier1 / count[1];
                if (firstTop == type(uint256).max) firstTop = i;
            } else if (p[i] == 2 && tier2 != 0) {
                out[i] = tier2 / count[2];
            }
            paid += out[i];
        }
        out[firstTop] += total - paid;
    }

    // --------------------------------------------------------- hand-computed vectors

    function test_payout_winnerTakesAll_singleWinner() public {
        _lockedWith(ID, 3, WTA, ODD);
        _payoutVia(ID, _p(2, 1, 3));
        _assertPayout(ID, [uint256(0), 3_000_003, 0, 0], 3);
    }

    function test_payout_winnerTakesAll_tieRemainderToLowestIndexWinner() public {
        _lockedWith(ID, 3, WTA, ODD); // T = 3,000,003; two winners
        _payoutVia(ID, _p(1, 1, 2));
        _assertPayout(ID, [uint256(1_500_002), 1_500_001, 0, 0], 3);
    }

    function test_payout_winnerTakesAll_remainderGoesToLowestIndexAmongTopEvenIfNotSeatZero() public {
        _lockedWith(ID, 4, WTA, ODD); // T = 4,000,004; three-way tie among seats 1..3
        _payoutVia(ID, _p(2, 1, 1, 1));
        _assertPayout(ID, [uint256(0), 1_333_336, 1_333_334, 1_333_334], 4);
    }

    function test_payout_winnerTakesAll_threeWayTieAmongFour() public {
        _lockedWith(ID, 4, WTA, ODD);
        _payoutVia(ID, _p(1, 1, 1, 2));
        _assertPayout(ID, [uint256(1_333_336), 1_333_334, 1_333_334, 0], 4);
    }

    function test_payout_equalAmongTop_behavesLikeWinnerTakesAll() public {
        _lockedWith(ID, 4, EQ, ODD);
        _payoutVia(ID, _p(1, 2, 1, 3));
        _assertPayout(ID, [uint256(2_000_002), 0, 2_000_002, 0], 4);
    }

    function test_payout_everySeatTied_isEqualSplit_forAllRules() public {
        for (uint256 r; r < 3; ++r) {
            bytes32 id = keccak256(abi.encode("alltie", r));
            _lockedWith(id, 3, IConditionalPot.Rule(r), ODD);
            _payoutVia(id, _p(1, 1, 1));
            _assertPayout(id, [uint256(ODD), ODD, ODD, 0], 3);
        }
    }

    function test_payout_top2_distinctFourSeats_remainderToFirstPlace() public {
        _lockedWith(ID, 4, T2, ODD); // T = 4,000,004: 70% -> 2,800,002 ; 30% -> 1,200,001 ; leftover 1
        _payoutVia(ID, _p(1, 2, 3, 4));
        _assertPayout(ID, [uint256(2_800_003), 1_200_001, 0, 0], 4);
    }

    function test_payout_top2_exactSplitNoRemainder() public {
        _lockedWith(ID, 4, T2, STAKE);
        _payoutVia(ID, _p(3, 1, 2, 4));
        _assertPayout(ID, [uint256(0), 2_800_000, 1_200_000, 0], 4);
    }

    function test_payout_top2_tieAtFirst() public {
        _lockedWith(ID, 4, T2, STAKE);
        _payoutVia(ID, _p(1, 1, 2, 3));
        _assertPayout(ID, [uint256(1_400_000), 1_400_000, 1_200_000, 0], 4);
    }

    function test_payout_top2_tieAtSecond() public {
        _lockedWith(ID, 3, T2, ODD); // T = 3,000,003: 70% 2,100,002 ; 30% 900,000 split in two ; leftover 1
        _payoutVia(ID, _p(1, 2, 2));
        _assertPayout(ID, [uint256(2_100_003), 450_000, 450_000, 0], 3);
    }

    function test_payout_top2_tieAtFirstRemainderGoesToLowestIndexOfThatTier() public {
        _lockedWith(ID, 4, T2, ODD); // T = 4,000,004
        _payoutVia(ID, _p(2, 1, 1, 2));
        // tier1 2,800,002 / 2 = 1,400,001 ; tier2 1,200,001 / 2 = 600,000 ; leftover 2 -> seat 1
        _assertPayout(ID, [uint256(600_000), 1_400_003, 1_400_001, 600_000], 4);
    }

    function test_payout_top2_twoSeats() public {
        _lockedWith(ID, 2, T2, ODD); // T = 2,000,002 : 1,400,001 + 600,000 + 1
        _payoutVia(ID, _p(1, 2));
        _assertPayout(ID, [uint256(1_400_002), 600_000, 0, 0], 2);
    }

    function test_payout_top2_thirdAndFourthPlacesGetNothing() public {
        _lockedWith(ID, 4, T2, STAKE);
        _payoutVia(ID, _p(4, 3, 2, 1));
        _assertPayout(ID, [uint256(0), 0, 1_200_000, 2_800_000], 4);
    }

    function test_payout_oraclePathMatchesCooperativePath() public {
        _lockedWith(ID, 4, T2, ODD);
        _lockedWith(ID2, 4, T2, ODD);
        uint8[] memory places = _p(2, 1, 1, 3);
        _settleCoop(ID, places);
        vm.warp(block.timestamp + MIN_PLAY);
        vm.prank(oracle);
        pot.propose(ID2, places, keccak256("r"));
        vm.warp(block.timestamp + WINDOW);
        pot.finalize(ID2, places);
        for (uint256 i; i < 4; ++i) {
            assertEq(pot.claimableOf(ID, players[i]), pot.claimableOf(ID2, players[i]));
        }
    }

    function test_payout_maximumStakeDoesNotOverflow() public {
        uint256 big = type(uint128).max;
        for (uint256 i; i < 4; ++i) usdc.mint(players[i], big);
        IConditionalPot.CreateParams memory p = _params(4, T2);
        p.stake = big;
        vm.prank(relayer);
        pot.create(ID, p);
        _fundAll(ID, 4);
        _settleCoop(ID, _p(1, 2, 3, 3));
        assertEq(_sumClaimable(ID, 4), 4 * big);
        _claimAll(ID, 4);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    // ------------------------------------------------------------------- fuzz

    function _denseFromSeed(uint256 seed, uint256 n) internal pure returns (uint8[] memory p) {
        uint8[] memory raw = new uint8[](n);
        bool[6] memory seen;
        for (uint256 i; i < n; ++i) {
            raw[i] = uint8(uint256(keccak256(abi.encode(seed, i))) % n) + 1;
            seen[raw[i]] = true;
        }
        p = new uint8[](n);
        for (uint256 i; i < n; ++i) {
            uint8 rank = 1;
            for (uint8 v = 1; v < raw[i]; ++v) {
                if (seen[v]) ++rank;
            }
            p[i] = rank;
        }
    }

    function testFuzz_sumOfClaimableAlwaysEqualsTotal(uint256 stakeSeed, uint8 nSeed, uint8 ruleSeed, uint256 placeSeed)
        public
    {
        uint256 n = bound(nSeed, 2, 4);
        uint256 stake = bound(stakeSeed, 1, 1e15);
        IConditionalPot.Rule rule = IConditionalPot.Rule(bound(ruleSeed, 0, 2));
        uint8[] memory places = _denseFromSeed(placeSeed, n);
        assertTrue(_refDense(places));
        _lockedWith(ID, n, rule, stake);
        _settleCoop(ID, places);

        uint256[4] memory expected = _refPayout(rule, stake, places);
        assertEq(_sumClaimable(ID, n), stake * n);
        for (uint256 i; i < n; ++i) assertEq(pot.claimableOf(ID, players[i]), expected[i]);
        _claimAll(ID, n);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }

    function testFuzz_winnerTakesAll_onlyTopTierIsPaid_andSplitIsEvenWithinOneRemainder(
        uint256 stakeSeed,
        uint8 nSeed,
        uint256 placeSeed
    ) public {
        uint256 n = bound(nSeed, 2, 4);
        uint256 stake = bound(stakeSeed, 1, 1e15);
        uint8[] memory places = _denseFromSeed(placeSeed, n);
        _lockedWith(ID, n, WTA, stake);
        _settleCoop(ID, places);
        uint256 winners;
        for (uint256 i; i < n; ++i) {
            if (places[i] == 1) ++winners;
        }
        uint256 floorShare = stake * n / winners;
        for (uint256 i; i < n; ++i) {
            uint256 got = pot.claimableOf(ID, players[i]);
            if (places[i] != 1) {
                assertEq(got, 0);
            } else {
                assertGe(got, floorShare);
                assertLt(got, floorShare + winners); // remainder is strictly less than the winner count
            }
        }
    }

    // ------------------------------------------------- exhaustive vectors (2..4 seats)

    /// @dev For every vector in {0..n+1}^n and every rule: the contract accepts exactly the dense
    ///      rankings, and the finalized payouts equal the reference model and sum to the total.
    function _exhaustive(uint256 n, IConditionalPot.Rule rule) internal returns (uint256 accepted) {
        bytes32 id = keccak256(abi.encode("ex", n, uint8(rule)));
        _lockedWith(id, n, rule, ODD);
        vm.warp(block.timestamp + MIN_PLAY);
        uint256 base = n + 2;
        uint256 combos = base ** n;
        for (uint256 c; c < combos; ++c) {
            uint8[] memory p = new uint8[](n);
            uint256 x = c;
            for (uint256 i; i < n; ++i) {
                p[i] = uint8(x % base);
                x /= base;
            }
            uint256 snap = vm.snapshotState();
            vm.prank(oracle);
            (bool ok,) = address(pot).call(abi.encodeCall(pot.propose, (id, p, bytes32(0))));
            assertEq(ok, _refDense(p), "validity matches the dense-rank definition");
            if (ok) {
                ++accepted;
                vm.warp(block.timestamp + WINDOW);
                pot.finalize(id, p);
                uint256[4] memory expected = _refPayout(rule, ODD, p);
                uint256 sum;
                for (uint256 i; i < n; ++i) {
                    assertEq(pot.claimableOf(id, players[i]), expected[i]);
                    sum += expected[i];
                }
                assertEq(sum, ODD * n);
            }
            vm.revertToState(snap);
        }
    }

    function test_exhaustive_twoSeats_allRules() public {
        for (uint256 r; r < 3; ++r) assertEq(_exhaustive(2, IConditionalPot.Rule(r)), 3); // (1,1)(1,2)(2,1)
    }

    function test_exhaustive_threeSeats_allRules() public {
        // ordered set partitions of 3 elements (Fubini number) = 13
        for (uint256 r; r < 3; ++r) assertEq(_exhaustive(3, IConditionalPot.Rule(r)), 13);
    }

    function test_exhaustive_fourSeats_allRules() public {
        // Fubini number for 4 elements = 75
        for (uint256 r; r < 3; ++r) assertEq(_exhaustive(4, IConditionalPot.Rule(r)), 75);
    }

    // ------------------------------------------- vectors shared with the relay

    string[3] internal ruleNames = ["WINNER_TAKES_ALL", "TOP2_70_30", "EQUAL_AMONG_TOP"];

    function _placesJson(uint8[] memory p) internal pure returns (string memory out) {
        out = "[";
        for (uint256 i; i < p.length; ++i) out = string.concat(out, i == 0 ? "" : ",", vm.toString(uint256(p[i])));
        out = string.concat(out, "]");
    }

    function _payoutsJson(bytes32 id, uint256 n) internal view returns (string memory out) {
        out = "[";
        for (uint256 i; i < n; ++i) {
            out = string.concat(out, i == 0 ? "" : ",", '"', vm.toString(pot.claimableOf(id, players[i])), '"');
        }
        out = string.concat(out, "]");
    }

    /// @dev Only runs when DUMP_VECTORS=true: prints every valid ranking with the payouts THE CONTRACT
    ///      computed, so the relay's adapter can be checked against the real thing (see src/lib/payout.test.ts).
    function test_dumpVectors() public {
        if (!vm.envOr("DUMP_VECTORS", false)) return;
        string memory out = "[";
        bool first = true;
        for (uint256 n = 2; n <= 4; ++n) {
            for (uint256 r; r < 3; ++r) {
                bytes32 id = keccak256(abi.encode("dump", n, r));
                _lockedWith(id, n, IConditionalPot.Rule(r), ODD);
                vm.warp(block.timestamp + MIN_PLAY);
                uint256 base = n + 2;
                for (uint256 c; c < base ** n; ++c) {
                    uint8[] memory p = new uint8[](n);
                    uint256 x = c;
                    for (uint256 i; i < n; ++i) {
                        p[i] = uint8(x % base);
                        x /= base;
                    }
                    if (!_refDense(p)) continue;
                    uint256 snap = vm.snapshotState();
                    vm.prank(oracle);
                    pot.propose(id, p, bytes32(0));
                    vm.warp(block.timestamp + WINDOW);
                    pot.finalize(id, p);
                    out = string.concat(
                        out,
                        first ? "" : ",\n",
                        '  {"seats":', vm.toString(n),
                        ',"rule":"', ruleNames[r],
                        '","stake":"', vm.toString(ODD),
                        '","places":', _placesJson(p),
                        ',"payouts":', _payoutsJson(id, n), "}"
                    );
                    first = false;
                    vm.revertToState(snap);
                }
            }
        }
        console.log("VECTORS_JSON_BEGIN");
        console.log(string.concat(out, "\n]"));
        console.log("VECTORS_JSON_END");
    }
}
