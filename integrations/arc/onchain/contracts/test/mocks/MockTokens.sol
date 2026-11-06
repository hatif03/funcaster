// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @dev Test double of Circle FiatToken v2.2: 6 decimals, EIP-712 domain (name, "2"), payee-only
///      receiveWithAuthorization(bytes) with real signature checks, a blocklist and per-nonce state.
contract MockFiatToken is ERC20, EIP712 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => bool) public blocklisted;
    string internal _tokenName;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) EIP712(name_, "2") {
        _tokenName = name_;
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocklisted(address account, bool value) external {
        blocklisted[account] = value;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        require(!blocklisted[from] && !blocklisted[to], "Blocklistable: account is blocklisted");
        super._update(from, to, value);
    }

    /// @dev Validates and consumes an authorization exactly like FiatToken v2.2 (without moving funds).
    function _consume(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) internal {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizationState[from][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        require(
            SignatureChecker.isValidSignatureNow(from, _hashTypedDataV4(structHash), signature),
            "FiatTokenV2: invalid signature"
        );
        authorizationState[from][nonce] = true;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external virtual {
        _consume(from, to, value, validAfter, validBefore, nonce, signature);
        _transfer(from, to, value);
    }
}

/// @dev Configurable misbehaving token. Used only through the pot's immutable allowlist.
contract HostileToken is MockFiatToken {
    enum Mode {
        Honest,
        FeeOnPull, // recipient receives 1% less than `value`
        NoPull, // reports success but moves nothing
        OverPull, // moves value + 1
        FalseTransfer, // transfer() returns false
        ReenterOnPull, // calls `target` with `payload` while a pull is in flight
        ReenterOnTransfer // calls `target` with `payload` after a transfer to `trigger`
    }

    Mode public mode;
    uint8 public tokenDecimals = 6;
    address public target;
    address public trigger;
    bytes public payload;
    bool public bubble;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public lastReturn;

    constructor(string memory name_, string memory symbol_) MockFiatToken(name_, symbol_) {}

    function configure(Mode mode_, address target_, address trigger_, bytes calldata payload_, bool bubble_) external {
        mode = mode_;
        target = target_;
        trigger = trigger_;
        payload = payload_;
        bubble = bubble_;
    }

    function setDecimals(uint8 value) external {
        tokenDecimals = value;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (mode == Mode.FalseTransfer) return false;
        return super.transfer(to, value);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (mode == Mode.ReenterOnTransfer && from != address(0) && to == trigger) _reenter();
    }

    function _reenter() internal {
        reentryAttempted = true;
        (bool ok, bytes memory ret) = target.call(payload);
        reentrySucceeded = ok;
        lastReturn = ret;
        if (!ok && bubble) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external override {
        _consume(from, to, value, validAfter, validBefore, nonce, signature);
        if (mode == Mode.FeeOnPull) {
            uint256 fee = value / 100;
            _transfer(from, to, value - fee);
            _transfer(from, address(0xdead), fee);
        } else if (mode == Mode.NoPull) {
            return;
        } else if (mode == Mode.OverPull) {
            _transfer(from, to, value + 1);
        } else if (mode == Mode.ReenterOnPull) {
            _reenter();
            _transfer(from, to, value);
        } else {
            _transfer(from, to, value);
        }
    }
}

/// @dev Minimal ERC-1271 smart wallet whose owner is a single EOA key.
contract Wallet1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(hash, signature);
        return (err == ECDSA.RecoverError.NoError && recovered == owner) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// @dev ERC-1271 wallet that misbehaves in a chosen way.
contract HostileWallet1271 {
    enum Mode {
        Reverts,
        WrongMagic,
        NoReturnData,
        TriesToWriteState
    }

    Mode public immutable mode;
    uint256 public counter;

    constructor(Mode mode_) {
        mode = mode_;
    }

    function isValidSignature(bytes32, bytes calldata) external returns (bytes4) {
        if (mode == Mode.Reverts) revert("no");
        if (mode == Mode.WrongMagic) return 0xdeadbeef;
        if (mode == Mode.TriesToWriteState) {
            // SignatureChecker uses STATICCALL, so this write must revert.
            counter += 1;
            return 0x1626ba7e;
        }
        assembly {
            return(0, 0)
        }
    }
}
