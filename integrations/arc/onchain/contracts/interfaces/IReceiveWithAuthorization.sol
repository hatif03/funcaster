// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Payee-only token authorization using a bytes signature.
interface IReceiveWithAuthorization {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;
}
