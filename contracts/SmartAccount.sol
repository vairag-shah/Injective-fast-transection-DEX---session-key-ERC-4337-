// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ISessionKeyStore {
    function createSessionKey(
        address key,
        uint256 durationSeconds,
        uint256 maxTradeSize,
        bytes32[] calldata allowedPairs
    ) external;

    function revokeSessionKey(address key) external;

    function isValidSessionKey(
        address key,
        bytes32 pair,
        uint256 amount
    ) external view returns (bool);
}

/// @title SmartAccount
/// @notice ERC-4337 account that accepts owner signatures and policy-limited session key signatures.
contract SmartAccount is IAccount, Ownable {
    using ECDSA for bytes32;

    IEntryPoint public immutable entryPoint;
    ISessionKeyStore public sessionKeyStore;

    uint256 public nonce;

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "only entrypoint");
        _;
    }

    modifier onlyEntryPointOrOwner() {
        require(
            msg.sender == address(entryPoint) || msg.sender == owner(),
            "forbidden"
        );
        _;
    }

    constructor(address owner_, address entryPoint_) Ownable(owner_) {
        require(entryPoint_ != address(0), "entrypoint=0");
        entryPoint = IEntryPoint(entryPoint_);
    }

    receive() external payable {}

    /// @notice Sets the shared SessionKey store contract.
    function setSessionKeyStore(address sessionKeyStore_) external onlyOwner {
        require(sessionKeyStore_ != address(0), "session=0");
        sessionKeyStore = ISessionKeyStore(sessionKeyStore_);
    }

    /// @notice Creates a new session key policy in SessionKey.sol.
    function createSessionKey(
        address key,
        uint256 durationSeconds,
        uint256 maxTradeSize,
        bytes32[] calldata allowedPairs
    ) external onlyOwner {
        sessionKeyStore.createSessionKey(
            key,
            durationSeconds,
            maxTradeSize,
            allowedPairs
        );
    }

    /// @notice Revokes a previously issued session key.
    function revokeSessionKey(address key) external onlyOwner {
        sessionKeyStore.revokeSessionKey(key);
    }

    /// @notice ERC-4337 validation hook.
    /// @dev Returns 0 on valid signature, 1 on invalid signature.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        validationData = _validateUserOp(userOp, userOpHash);

        if (missingAccountFunds > 0) {
            (bool ok, ) = payable(msg.sender).call{value: missingAccountFunds}(
                ""
            );
            require(ok, "prefund failed");
        }

        nonce++;
    }

    /// @notice Executes a call via the EntryPoint.
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyEntryPoint {
        _call(to, value, data);
    }

    /// @notice Executes batched calls via the EntryPoint.
    function executeBatch(
        address[] calldata to,
        bytes[] calldata data
    ) external onlyEntryPoint {
        require(to.length == data.length, "length mismatch");
        for (uint256 i = 0; i < to.length; i++) {
            _call(to[i], 0, data[i]);
        }
    }

    /// @notice Deposits ETH into account balance.
    function deposit() external payable {}

    /// @notice Withdraws ETH to owner.
    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "insufficient");
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function _validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view returns (uint256) {
        if (address(sessionKeyStore) == address(0)) {
            return 1;
        }

        bytes32 digest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        address signer = digest.recover(userOp.signature);

        if (signer == owner()) {
            return 0;
        }

        (bytes32 pair, uint256 amount) = _extractPairAndAmount(userOp.callData);
        bool validSession = sessionKeyStore.isValidSessionKey(
            signer,
            pair,
            amount
        );

        return validSession ? 0 : 1;
    }

    /// @dev Extracts pair and qty from execute(address,uint256,bytes) -> Vault.executeTrade.
    function _extractPairAndAmount(
        bytes calldata callData
    ) internal pure returns (bytes32 pair, uint256 amount) {
        if (callData.length < 4) return (bytes32(0), type(uint256).max);

        bytes4 selector;
        assembly {
            selector := calldataload(callData.offset)
        }

        if (selector != this.execute.selector) {
            return (bytes32(0), type(uint256).max);
        }

        (, , bytes memory targetData) = abi.decode(
            callData[4:],
            (address, uint256, bytes)
        );
        if (targetData.length < 4) return (bytes32(0), type(uint256).max);

        bytes4 targetSelector;
        assembly {
            targetSelector := mload(add(targetData, 32))
        }

        if (
            targetSelector !=
            bytes4(keccak256("executeTrade(address,bytes32,uint256,uint8)"))
        ) {
            return (bytes32(0), type(uint256).max);
        }

        if (targetData.length < 132) {
            return (bytes32(0), type(uint256).max);
        }

        assembly {
            pair := mload(add(targetData, 68))
            amount := mload(add(targetData, 100))
        }
    }

    function _call(address to, uint256 value, bytes memory data) internal {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            if (ret.length > 0) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
            revert("call failed");
        }
    }
}
