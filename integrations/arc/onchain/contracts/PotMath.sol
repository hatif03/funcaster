// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IConditionalPot} from "./IConditionalPot.sol";

/// @title PotMath
/// @notice Placing validation and payout arithmetic of ConditionalPot, as pure functions so the
///         production routine can be tested directly at uint256 boundaries (a token could never
///         hold a maxUint256 pot, but the arithmetic must still be exact).
library PotMath {
    /// @notice True when `places` is a dense ranking for `seatCount` seats: length == seatCount,
    ///         every value in 1..seatCount, and the distinct values are exactly {1..k} (ties allowed, no gaps).
    function isDensePlacing(uint8[] memory places, uint256 seatCount) internal pure returns (bool) {
        if (places.length != seatCount) return false;
        uint256 mask;
        for (uint256 i; i < places.length; ++i) {
            uint8 place = places[i];
            if (place == 0 || place > seatCount) return false;
            mask |= uint256(1) << (place - 1);
        }
        // mask must be 0b0..011..1 (ranks 1..k all present)
        return (mask & (mask + 1)) == 0;
    }

    /// @notice Payout per seat for a DENSE placing. Exact for every stake with stake * seats <= maxUint256.
    /// @dev    T = stake * seats (checked). WINNER_TAKES_ALL / EQUAL_AMONG_TOP, or every seat tied:
    ///         tier 1 gets T. TOP2_70_30 with at least two tiers: tier 1 gets floor(T*70/100) and tier 2
    ///         floor(T*30/100), both via full-precision mulDiv (no T*70 overflow). Seats of a tier share
    ///         equally (floor). Every remainder goes to the lowest-index seat of tier 1, so the shares
    ///         always sum to T exactly.
    function shares(IConditionalPot.Rule rule, uint256 stake, uint8[] memory places)
        internal
        pure
        returns (uint256[4] memory out)
    {
        uint256 n = places.length;
        uint256 total = stake * n;

        uint256 count1;
        uint256 count2;
        uint8 tiers;
        uint256 firstTop = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            uint8 p = places[i];
            if (p > tiers) tiers = p;
            if (p == 1) {
                ++count1;
                if (firstTop == type(uint256).max) firstTop = i;
            } else if (p == 2) {
                ++count2;
            }
        }

        uint256 tier1 = total;
        uint256 tier2;
        if (rule == IConditionalPot.Rule.TOP2_70_30 && tiers >= 2) {
            tier1 = Math.mulDiv(total, 70, 100);
            tier2 = Math.mulDiv(total, 30, 100);
        }
        uint256 perFirst = tier1 / count1;
        uint256 perSecond = count2 == 0 ? 0 : tier2 / count2;

        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            uint256 amount = places[i] == 1 ? perFirst : (places[i] == 2 ? perSecond : 0);
            out[i] = amount;
            distributed += amount;
        }
        out[firstTop] += total - distributed;
    }
}
