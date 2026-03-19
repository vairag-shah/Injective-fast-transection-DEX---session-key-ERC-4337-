// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SmartAccount} from "./SmartAccount.sol";

interface ISessionKeyAdmin {
    function setAuthorizedCaller(address caller, bool allowed) external;
}

/// @title SmartAccountFactory
/// @notice Deploys deterministic-ish smart accounts per owner.
contract SmartAccountFactory {
    address public immutable entryPoint;
    address public immutable sessionKeyStore;

    mapping(address => address) public accountOf;

    event SmartAccountCreated(address indexed owner, address account);

    constructor(address entryPoint_, address sessionKeyStore_) {
        entryPoint = entryPoint_;
        sessionKeyStore = sessionKeyStore_;
    }

    function createAccount(address owner) external returns (address account) {
        require(owner != address(0), "owner=0");
        if (accountOf[owner] != address(0)) {
            return accountOf[owner];
        }

        SmartAccount smartAccount = new SmartAccount(address(this), entryPoint);
        account = address(smartAccount);
        smartAccount.setSessionKeyStore(sessionKeyStore);
        ISessionKeyAdmin(sessionKeyStore).setAuthorizedCaller(account, true);
        smartAccount.transferOwnership(owner);
        accountOf[owner] = account;

        emit SmartAccountCreated(owner, account);
    }
}
