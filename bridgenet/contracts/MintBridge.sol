// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MintBridge — Chain B destination bridge (mint/burn)
/// @notice MVP trusted-relayer bridge; mint requires relayer-authorized proof
contract MintBridge {
    event Minted(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event Burned(address indexed sender, address recipientOnA, uint256 amount);

    address public relayer;
    mapping(bytes32 => bool) public minted;
    mapping(address => uint256) public balances;

    constructor(address _relayer) {
        relayer = _relayer;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    function mint(
        bytes32 messageId,
        address recipient,
        uint256 amount,
        bytes calldata /* proof */
    ) external onlyRelayer {
        require(!minted[messageId], "already minted");
        require(recipient != address(0), "invalid recipient");
        require(amount > 0, "amount required");

        minted[messageId] = true;
        balances[recipient] += amount;

        emit Minted(messageId, recipient, amount);
    }

    function burn(address recipientOnA, uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");
        balances[msg.sender] -= amount;
        emit Burned(msg.sender, recipientOnA, amount);
    }
}
