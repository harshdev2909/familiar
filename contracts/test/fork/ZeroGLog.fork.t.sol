// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FamiliarLog} from "../../src/FamiliarLog.sol";

/// @notice Fork of 0G Chain mainnet (16661): FamiliarLog deploys and logs on the real chain state.
contract ZeroGLogForkTest is Test {
    function test_fork_logDayOnZeroG() public {
        vm.createSelectFork(vm.envOr("ZG_RPC", string("https://evmrpc.0g.ai")));
        assertEq(block.chainid, 16661);
        address agent = makeAddr("agent");
        FamiliarLog dayLog = new FamiliarLog(agent);
        bytes32 node = keccak256("ember.familiar.eth");
        vm.prank(agent);
        dayLog.logDay(node, 1, keccak256("req-ids"), keccak256("img"), keccak256("root"));
        assertEq(dayLog.lastDay(node), 1);
    }
}
