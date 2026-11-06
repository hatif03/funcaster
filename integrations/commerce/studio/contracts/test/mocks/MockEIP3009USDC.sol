// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice TEST-ONLY mock of USDC: 6 decimals, EIP-3009 receiveWithAuthorization, public mint,
/// blocklist toggle, and an optional re-entrancy hook fired after every non-mint balance update.
contract MockEIP3009USDC is ERC20, EIP712 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => bool) public blocklisted;

    // Re-entrancy hook (test aid): after any non-mint transfer, call hookTarget with hookData once.
    address public hookTarget;
    bytes public hookData;
    bool public hookRan;
    bool public hookOk;
    bytes public hookRet;
    bool private _inHook;

    error Blocklisted(address account);

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("USD Coin", "USDC") EIP712("USD Coin", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Circle FiatToken-style blocklist getter, read by the router on claim.
    function isBlacklisted(address account) external view returns (bool) {
        return blocklisted[account];
    }

    /// @dev Toggles the blocklist flag of `account`.
    function blocklist(address account) external {
        blocklisted[account] = !blocklisted[account];
    }

    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
        hookRan = false;
        hookOk = false;
        delete hookRet;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizationState[from][nonce], "FiatTokenV2: authorization is used or canceled");

        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        require(ECDSA.recover(digest, v, r, s) == from, "FiatTokenV2: invalid signature");

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocklisted[from]) revert Blocklisted(from);
        if (blocklisted[to]) revert Blocklisted(to);
        super._update(from, to, value);

        if (hookTarget != address(0) && !_inHook && from != address(0)) {
            _inHook = true;
            (bool ok, bytes memory ret) = hookTarget.call(hookData);
            hookRan = true;
            hookOk = ok;
            hookRet = ret;
            _inHook = false;
        }
    }
}
