// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PotMath} from "../PotMath.sol";
import {IConditionalPot} from "../IConditionalPot.sol";

/// @dev External wrapper so expectRevert works on the internal production library.
contract PotMathHarness {
    function shares(IConditionalPot.Rule rule, uint256 stake, uint8[] memory places)
        external
        pure
        returns (uint256[4] memory)
    {
        return PotMath.shares(rule, stake, places);
    }

    function isDense(uint8[] memory places, uint256 seats) external pure returns (bool) {
        return PotMath.isDensePlacing(places, seats);
    }
}

/// @notice The production allocation routine at uint256 boundaries. A token cannot hold a
///         maxUint256 pot (its supply would overflow), so the library is exercised directly.
contract PotMathTest is Test {
    PotMathHarness internal h = new PotMathHarness();
    uint256 internal constant MAX = type(uint256).max;

    // ------------------------------------------------------------ reference model

    /// @dev floor(t * pct / 100) without ever forming t * pct: t = 100q + r  =>  q*pct + floor(r*pct/100).
    function _pct(uint256 t, uint256 pct) internal pure returns (uint256) {
        return (t / 100) * pct + ((t % 100) * pct) / 100;
    }

    function _vector(uint256 n, uint256 code, uint256 base) internal pure returns (uint8[] memory p) {
        p = new uint8[](n);
        for (uint256 i; i < n; ++i) {
            p[i] = uint8(code % base);
            code /= base;
        }
    }

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

    function _ref(IConditionalPot.Rule rule, uint256 stake, uint8[] memory p) internal pure returns (uint256[4] memory out) {
        uint256 n = p.length;
        uint256 total = stake * n;
        uint256[5] memory count;
        uint8 k;
        for (uint256 i; i < n; ++i) {
            ++count[p[i]];
            if (p[i] > k) k = p[i];
        }
        uint256 a1 = total;
        uint256 a2;
        if (rule == IConditionalPot.Rule.TOP2_70_30 && k >= 2) {
            a1 = _pct(total, 70);
            a2 = _pct(total, 30);
        }
        uint256 paid;
        uint256 first = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            if (p[i] == 1) {
                out[i] = a1 / count[1];
                if (first == type(uint256).max) first = i;
            } else if (p[i] == 2) {
                out[i] = a2 / count[2];
            }
            paid += out[i];
        }
        out[first] += total - paid;
    }

    function _stakesFor(uint256 n) internal pure returns (uint256[8] memory s) {
        uint256 top = MAX / n; // the largest stake create() accepts
        s[0] = 1;
        s[1] = 99; // total*70 and /100 land on different remainders
        s[2] = 100_003;
        s[3] = top / 2 + 1;
        s[4] = top - 1;
        s[5] = top;
        s[6] = (MAX / 100) / n; // just below the point where total*100 would overflow
        s[7] = (MAX / 70) / n + 1; // total*70 overflows plain arithmetic from here on
    }

    // -------------------------------------------------------------- exhaustive

    function _exhaustiveAt(uint256 n, uint256 stake) internal view returns (uint256 valid) {
        uint256 base = n + 2;
        for (uint256 c; c < base ** n; ++c) {
            uint8[] memory p = _vector(n, c, base);
            bool dense = _refDense(p);
            assertEq(h.isDense(p, n), dense, "library accepts exactly the dense placings");
            if (!dense) continue;
            ++valid;
            for (uint256 r; r < 3; ++r) {
                IConditionalPot.Rule rule = IConditionalPot.Rule(r);
                uint256[4] memory got = h.shares(rule, stake, p);
                uint256[4] memory want = _ref(rule, stake, p);
                uint256 sum;
                for (uint256 i; i < n; ++i) {
                    assertEq(got[i], want[i], "share equals the reference model");
                    sum += got[i];
                }
                assertEq(sum, stake * n, "no value created or destroyed");
                for (uint256 i = n; i < 4; ++i) assertEq(got[i], 0, "unused seat slots stay empty");
            }
        }
    }

    function test_shares_exhaustive_twoSeats_atEveryBoundaryStake() public view {
        uint256[8] memory s = _stakesFor(2);
        for (uint256 i; i < 8; ++i) assertEq(_exhaustiveAt(2, s[i]), 3);
    }

    function test_shares_exhaustive_threeSeats_atEveryBoundaryStake() public view {
        uint256[8] memory s = _stakesFor(3);
        for (uint256 i; i < 8; ++i) assertEq(_exhaustiveAt(3, s[i]), 13);
    }

    function test_shares_exhaustive_fourSeats_atEveryBoundaryStake() public view {
        uint256[8] memory s = _stakesFor(4);
        for (uint256 i; i < 8; ++i) assertEq(_exhaustiveAt(4, s[i]), 75);
    }

    // ------------------------------------------------------------ boundary cases

    function test_shares_maxStakeDoesNotOverflowTheSeventyPercentStep() public view {
        uint256 stake = MAX / 4;
        uint256 total = stake * 4;
        assertGt(total, MAX / 70, "a naive total * 70 would overflow here");
        uint8[] memory p = new uint8[](4);
        p[0] = 1;
        p[1] = 2;
        p[2] = 3;
        p[3] = 3;
        uint256[4] memory out = h.shares(IConditionalPot.Rule.TOP2_70_30, stake, p);
        assertEq(out[0], _pct(total, 70) + (total - _pct(total, 70) - _pct(total, 30)));
        assertEq(out[1], _pct(total, 30));
        assertEq(out[2], 0);
        assertEq(out[3], 0);
        assertEq(out[0] + out[1], total);
    }

    function test_shares_largestAcceptedStakePerSeatCount() public view {
        for (uint256 n = 2; n <= 4; ++n) {
            uint256 stake = MAX / n;
            uint8[] memory p = new uint8[](n);
            for (uint256 i; i < n; ++i) p[i] = 1; // everyone tied
            uint256[4] memory out = h.shares(IConditionalPot.Rule.TOP2_70_30, stake, p);
            uint256 sum;
            for (uint256 i; i < n; ++i) {
                assertEq(out[i], stake);
                sum += out[i];
            }
            assertEq(sum, stake * n);
        }
    }

    function test_shares_revertsOnlyWhenThePotItselfCouldNotExist() public {
        uint8[] memory p = new uint8[](2);
        p[0] = 1;
        p[1] = 2;
        // stake * seats overflows: create() rejects this stake, and the library refuses it too.
        vm.expectRevert();
        h.shares(IConditionalPot.Rule.WINNER_TAKES_ALL, MAX / 2 + 1, p);
        // the largest accepted stake works
        uint256[4] memory out = h.shares(IConditionalPot.Rule.WINNER_TAKES_ALL, MAX / 2, p);
        assertEq(out[0], (MAX / 2) * 2);
    }

    function test_shares_remainderGoesToLowestIndexTierOneSeat_notToTierTwo() public view {
        // stake chosen so both tiers leave a remainder
        uint8[] memory p = new uint8[](4);
        p[0] = 2;
        p[1] = 1;
        p[2] = 1;
        p[3] = 2;
        uint256 stake = 1_000_000_000_000_000_001;
        uint256[4] memory out = h.shares(IConditionalPot.Rule.TOP2_70_30, stake, p);
        uint256 total = stake * 4;
        uint256 a1 = _pct(total, 70);
        uint256 a2 = _pct(total, 30);
        assertEq(out[0], a2 / 2);
        assertEq(out[3], a2 / 2);
        assertEq(out[2], a1 / 2);
        assertEq(out[1], a1 / 2 + (total - (a1 / 2) * 2 - (a2 / 2) * 2));
    }

    function test_shares_allTied_isEqualUnderEveryRule() public view {
        for (uint256 n = 2; n <= 4; ++n) {
            uint8[] memory p = new uint8[](n);
            for (uint256 i; i < n; ++i) p[i] = 1;
            for (uint256 r; r < 3; ++r) {
                uint256[4] memory out = h.shares(IConditionalPot.Rule(r), 12_345_678_901, p);
                for (uint256 i; i < n; ++i) assertEq(out[i], 12_345_678_901);
            }
        }
    }

    function testFuzz_shares_sumAlwaysEqualsTotal(uint256 stakeSeed, uint8 nSeed, uint8 ruleSeed, uint256 placeSeed) public view {
        uint256 n = bound(nSeed, 2, 4);
        uint256 stake = bound(stakeSeed, 1, MAX / n);
        uint256 base = n + 2;
        uint8[] memory p = _vector(n, placeSeed % (base ** n), base);
        if (!_refDense(p)) return;
        IConditionalPot.Rule rule = IConditionalPot.Rule(bound(ruleSeed, 0, 2));
        uint256[4] memory got = h.shares(rule, stake, p);
        uint256[4] memory want = _ref(rule, stake, p);
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            assertEq(got[i], want[i]);
            sum += got[i];
        }
        assertEq(sum, stake * n);
    }

    // ------------------------------------------------------------- dense ranks

    function test_isDense_rejectsEveryMalformedShape() public view {
        uint8[] memory a = new uint8[](3);
        a[0] = 1;
        a[1] = 1;
        a[2] = 3; // competition rank, gap
        assertFalse(h.isDense(a, 3));
        a[2] = 2;
        assertTrue(h.isDense(a, 3));
        a[0] = 0; // zero
        assertFalse(h.isDense(a, 3));
        a[0] = 4; // above seat count
        assertFalse(h.isDense(a, 3));
        a[0] = 255;
        assertFalse(h.isDense(a, 3));
        uint8[] memory b = new uint8[](2);
        b[0] = 2;
        b[1] = 2; // nobody is first
        assertFalse(h.isDense(b, 2));
        assertFalse(h.isDense(b, 3)); // wrong length for the seat count
    }
}
