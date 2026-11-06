// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FamiliarLog
/// @notice Append-only day log on 0G Chain. Each entry commits to the day's 0G Private Computer
///         request IDs, the portrait hash and the 0G Storage root of the encrypted memory blob.
contract FamiliarLog {
    event Day(
        bytes32 indexed familiarNode,
        uint32 day,
        bytes32 requestIdsHash,
        bytes32 imageHash,
        bytes32 memoryRoot
    );

    address public immutable agent;

    /// @notice Latest logged day per Familiar.
    mapping(bytes32 node => uint32) public lastDay;

    error AgentOnly();
    error DayNotIncreasing(uint32 last, uint32 day);

    constructor(address _agent) {
        agent = _agent;
    }

    function logDay(bytes32 node, uint32 day, bytes32 reqHash, bytes32 imgHash, bytes32 memRoot)
        external
    {
        if (msg.sender != agent) revert AgentOnly();
        uint32 last = lastDay[node];
        if (day <= last) revert DayNotIncreasing(last, day);
        lastDay[node] = day;
        emit Day(node, day, reqHash, imgHash, memRoot);
    }
}
