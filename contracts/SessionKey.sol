// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OwnableLite} from "./lib/OwnableLite.sol";

/// @title SessionKey
/// @notice Stores time and scope-limited session key permissions for gasless trading.
contract SessionKey is OwnableLite {
    /// @notice Session key permissions and expiry metadata.
    struct SessionKeyData {
        uint256 expiry;
        uint256 maxTradeSize;
        bytes32[] allowedPairs;
        bool active;
    }

    mapping(address => SessionKeyData) public sessionKeys;
    mapping(address => bool) public authorizedCallers;

    event SessionKeyCreated(address key, uint256 expiry);
    event SessionKeyRevoked(address key);

    constructor(address owner_) OwnableLite(owner_) {}

    modifier onlyOwnerOrAuthorized() {
        require(
            msg.sender == owner() || authorizedCallers[msg.sender],
            "forbidden"
        );
        _;
    }

    /// @notice Sets authorized smart account callers.
    function setAuthorizedCaller(
        address caller,
        bool allowed
    ) external onlyOwner {
        authorizedCallers[caller] = allowed;
    }

    /// @notice Creates or replaces a session key policy.
    /// @param key Session key address.
    /// @param durationSeconds Number of seconds this key remains valid.
    /// @param maxTradeSize Max trade size in USDT (6 decimals).
    /// @param allowedPairs Hashed pair symbols, e.g. keccak256("INJ/USDT").
    function createSessionKey(
        address key,
        uint256 durationSeconds,
        uint256 maxTradeSize,
        bytes32[] calldata allowedPairs
    ) external onlyOwnerOrAuthorized {
        require(key != address(0), "invalid key");
        require(durationSeconds > 0, "duration=0");
        require(maxTradeSize > 0, "maxTradeSize=0");
        require(allowedPairs.length > 0, "pairs=0");

        SessionKeyData storage data = sessionKeys[key];
        data.expiry = block.timestamp + durationSeconds;
        data.maxTradeSize = maxTradeSize;
        data.active = true;

        delete data.allowedPairs;
        for (uint256 i = 0; i < allowedPairs.length; i++) {
            data.allowedPairs.push(allowedPairs[i]);
        }

        emit SessionKeyCreated(key, data.expiry);
    }

    /// @notice Revokes a session key.
    /// @param key Session key address.
    function revokeSessionKey(address key) external onlyOwnerOrAuthorized {
        sessionKeys[key].active = false;
        emit SessionKeyRevoked(key);
    }

    /// @notice Validates session key constraints.
    /// @param key Session key address.
    /// @param pair Hashed spot pair.
    /// @param amount Trade amount in USDT units.
    /// @return True when key is active, unexpired, pair-allowed, and size-limited.
    function isValidSessionKey(
        address key,
        bytes32 pair,
        uint256 amount
    ) external view returns (bool) {
        SessionKeyData storage data = sessionKeys[key];
        if (!data.active) return false;
        if (block.timestamp > data.expiry) return false;
        if (amount > data.maxTradeSize) return false;

        for (uint256 i = 0; i < data.allowedPairs.length; i++) {
            if (data.allowedPairs[i] == pair) {
                return true;
            }
        }

        return false;
    }
}
