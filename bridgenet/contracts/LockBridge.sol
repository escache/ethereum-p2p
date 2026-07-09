// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LockBridge — Chain A source bridge (lock/unlock)
/// @notice MVP trusted-relayer bridge; unlock requires off-chain proof verification
contract LockBridge {
    event Locked(
        bytes32 indexed messageId,
        address indexed sender,
        address recipientOnB,
        uint256 amount
    );

    event Unlocked(bytes32 indexed messageId, address indexed recipient, uint256 amount);

    mapping(bytes32 => bool) public processed;
    uint256 public nonce;
    uint256 public totalLocked;

    function lock(address recipientOnB) external payable {
        require(msg.value > 0, "amount required");
        require(recipientOnB != address(0), "invalid recipient");

        bytes32 messageId = keccak256(
            abi.encodePacked(block.chainid, block.number, nonce++, msg.sender, recipientOnB, msg.value)
        );

        processed[messageId] = true;
        totalLocked += msg.value;

        emit Locked(messageId, msg.sender, recipientOnB, msg.value);
    }

    function unlock(
        bytes32 messageId,
        address recipient,
        uint256 amount,
        bytes calldata /* proof */
    ) external {
        require(!processed[messageId], "already processed");
        require(amount <= address(this).balance, "insufficient balance");

        processed[messageId] = true;
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "transfer failed");

        emit Unlocked(messageId, recipient, amount);
    }
}
