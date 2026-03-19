// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Lite} from "./lib/IERC20Lite.sol";
import {SafeERC20Lite} from "./lib/SafeERC20Lite.sol";
import {OwnableLite} from "./lib/OwnableLite.sol";

/// @title Vault
/// @notice Holds user funds and emits trade intents for Injective relay settlement.
contract Vault is OwnableLite {
    using SafeERC20Lite for IERC20Lite;

    mapping(address => mapping(address => uint256)) private balances;
    mapping(address => bool) public approvedSmartAccounts;

    address public relay;

    event TradeRequested(
        address user,
        bytes32 pair,
        uint256 qty,
        uint8 side,
        uint256 timestamp
    );
    event TradeSettled(
        address user,
        bytes32 pair,
        uint256 qty,
        uint8 side,
        string txHash
    );
    // ✅ NEW
    event Deposit(address indexed user, address indexed token, uint256 amount);

    modifier onlyApprovedSmartAccount() {
        require(approvedSmartAccounts[msg.sender], "not approved account");
        _;
    }

    modifier onlyRelay() {
        require(msg.sender == relay, "not relay");
        _;
    }

    constructor(address owner_) OwnableLite(owner_) {}

    function setRelay(address relay_) external onlyOwner {
        relay = relay_;
    }

    function setApprovedSmartAccount(
        address account,
        bool approved
    ) external onlyOwner {
        approvedSmartAccounts[account] = approved;
    }

    /// @notice Deposits an ERC20 token to user balance.
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "token=0");
        require(amount > 0, "amount=0");
        IERC20Lite(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    // ✅ NEW — Accept native INJ via depositNative()
    function depositNative() external payable {
        require(msg.value > 0, "amount=0");
        balances[msg.sender][address(0)] += msg.value;
        emit Deposit(msg.sender, address(0), msg.value);
    }

    // ✅ NEW — Accept plain INJ transfers (from Setup.tsx sendTransaction)
    receive() external payable {
        balances[msg.sender][address(0)] += msg.value;
        emit Deposit(msg.sender, address(0), msg.value);
    }

    // ✅ NEW — Fallback
    fallback() external payable {
        balances[msg.sender][address(0)] += msg.value;
    }

    /// @notice Owner-only ERC20 withdrawal.
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20Lite(token).safeTransfer(owner(), amount);
    }

    // ✅ NEW — Owner-only native INJ withdrawal.
    function withdrawNative(uint256 amount) external onlyOwner {
        (bool ok, ) = owner().call{value: amount}("");
        require(ok, "transfer failed");
    }

    function executeTrade(
        address user,
        bytes32 pair,
        uint256 qty,
        uint8 side
    ) external onlyApprovedSmartAccount {
        require(user != address(0), "user=0");
        require(qty > 0, "qty=0");
        require(side <= 1, "side");
        emit TradeRequested(user, pair, qty, side, block.timestamp);
    }

    function settleTradeRecord(
        address user,
        bytes32 pair,
        uint256 qty,
        uint8 side,
        string calldata txHash
    ) external onlyRelay {
        emit TradeSettled(user, pair, qty, side, txHash);
    }

    function getBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return balances[user][token];
    }
}
