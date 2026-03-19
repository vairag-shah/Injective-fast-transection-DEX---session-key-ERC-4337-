// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Lite} from "./IERC20Lite.sol";

library SafeERC20Lite {
    function safeTransfer(
        IERC20Lite token,
        address to,
        uint256 value
    ) internal {
        _call(
            token,
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
    }

    function safeTransferFrom(
        IERC20Lite token,
        address from,
        address to,
        uint256 value
    ) internal {
        _call(
            token,
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
    }

    function _call(IERC20Lite token, bytes memory data) private {
        (bool success, bytes memory ret) = address(token).call(data);
        require(success, "SafeERC20: call failed");
        if (ret.length > 0) {
            require(abi.decode(ret, (bool)), "SafeERC20: operation failed");
        }
    }
}
