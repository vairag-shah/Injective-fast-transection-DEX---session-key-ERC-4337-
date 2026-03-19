// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    BasePaymaster
} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/// @title VerifyingPaymaster
/// @notice Sponsors gas for known smart accounts only.
contract Paymaster is BasePaymaster {
    mapping(address => bool) public knownSmartAccounts;
    mapping(address => uint256) public sponsoredGas;

    event SmartAccountSet(address indexed account, bool allowed);
    event GasSponsored(
        address indexed user,
        uint256 actualGasCost,
        bytes32 userOpHash
    );

    constructor(
        address entryPoint_,
        address owner_
    ) BasePaymaster(IEntryPoint(entryPoint_)) {
        transferOwnership(owner_);
    }

    /// @dev Some testnet EntryPoint deployments do not expose ERC165 metadata.
    function _validateEntryPointInterface(IEntryPoint) internal pure override {}

    /// @notice Whitelists a smart account for sponsorship.
    function setKnownSmartAccount(
        address account,
        bool allowed
    ) external onlyOwner {
        knownSmartAccounts[account] = allowed;
        emit SmartAccountSet(account, allowed);
    }

    /// @notice Deposits ETH to EntryPoint for paymaster gas coverage.
    function depositToEntryPoint() external payable onlyOwner {
        deposit();
    }

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256
    )
        internal
        view
        override
        returns (bytes memory context, uint256 validationData)
    {
        address sender = userOp.sender;
        if (!knownSmartAccounts[sender]) {
            return ("", 1);
        }

        return (abi.encode(sender), 0);
    }

    function _postOp(
        PostOpMode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256
    ) internal override {
        address user = abi.decode(context, (address));
        sponsoredGas[user] += actualGasCost;
        emit GasSponsored(user, actualGasCost, bytes32(0));
    }
}
