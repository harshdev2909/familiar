// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FamiliarLog} from "../src/FamiliarLog.sol";

contract FamiliarLogTest is Test {
    FamiliarLog dayLog;
    address agent = makeAddr("agent");
    bytes32 constant EMBER = keccak256("ember.familiar.eth");

    function setUp() public {
        dayLog = new FamiliarLog(agent);
    }

    function _reqHash() internal pure returns (bytes32) {
        return keccak256(bytes("req_whisper_1,req_0gm_1,req_seedream_1"));
    }

    function test_logDay_emitsAndTracksLastDay() public {
        vm.expectEmit(address(dayLog));
        emit FamiliarLog.Day(EMBER, 1, _reqHash(), bytes32("img"), bytes32("root"));
        vm.prank(agent);
        dayLog.logDay(EMBER, 1, _reqHash(), bytes32("img"), bytes32("root"));
        assertEq(dayLog.lastDay(EMBER), 1);
    }

    function test_logDay_agentOnly() public {
        vm.expectRevert(FamiliarLog.AgentOnly.selector);
        dayLog.logDay(EMBER, 1, _reqHash(), 0, 0);
    }

    function test_logDay_dayMustIncrease() public {
        vm.startPrank(agent);
        dayLog.logDay(EMBER, 3, _reqHash(), 0, 0);
        vm.expectRevert(abi.encodeWithSelector(FamiliarLog.DayNotIncreasing.selector, 3, 3));
        dayLog.logDay(EMBER, 3, _reqHash(), 0, 0);
        vm.expectRevert(abi.encodeWithSelector(FamiliarLog.DayNotIncreasing.selector, 3, 2));
        dayLog.logDay(EMBER, 2, _reqHash(), 0, 0);
        dayLog.logDay(EMBER, 4, _reqHash(), 0, 0);
        vm.stopPrank();
        assertEq(dayLog.lastDay(EMBER), 4);
    }

    function test_logDay_familiarsAreIndependent() public {
        bytes32 moss = keccak256("moss.familiar.eth");
        vm.startPrank(agent);
        dayLog.logDay(EMBER, 5, 0, 0, 0);
        dayLog.logDay(moss, 1, 0, 0, 0);
        vm.stopPrank();
        assertEq(dayLog.lastDay(EMBER), 5);
        assertEq(dayLog.lastDay(moss), 1);
    }
}
