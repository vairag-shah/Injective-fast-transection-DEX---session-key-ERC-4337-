// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockEntryPoint {
    receive() external payable {}

    function depositTo(address) external payable {}
    function addStake(uint32) external payable {}
    function unlockStake() external {}
    function withdrawStake(address payable) external {}
    function withdrawTo(address payable, uint256) external {}
}
