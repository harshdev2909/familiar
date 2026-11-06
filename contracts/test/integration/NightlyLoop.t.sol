// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {MockERC20} from "~test/mocks/MockERC20.sol";
import {PermissionedResolver} from "ensv2/resolver/PermissionedResolver.sol";

import {FamiliarFeeder} from "../../src/FamiliarFeeder.sol";
import {FamiliarLog} from "../../src/FamiliarLog.sol";
import {FamiliarRegistry} from "../../src/FamiliarRegistry.sol";
import {FamiliarBase} from "../FamiliarBase.sol";

/// @notice End-to-end user journeys from the PRD, across all three contracts on one local chain.
///         The backend's role (watch Fed -> record visit -> write ENS records -> log day) is played
///         by the test, using the same calls the backend makes.
contract NightlyLoopTest is FamiliarBase {
    MockERC20 w0g;
    FamiliarFeeder feeder;
    FamiliarLog dayLog;
    uint256 constant PRICE = 3e18;

    function setUp() public override {
        super.setUp();
        w0g = new MockERC20("W0G", 18);
        feeder = new FamiliarFeeder(address(w0g), PRICE);
        dayLog = new FamiliarLog(agent);
        w0g.mint(kabir, 50e18);
    }

    /// @dev What the backend does once a visit is paid and the 0G pipeline returned.
    function _backendCompleteVisit(string memory label, string memory mood, string memory img, string[3] memory reqIds)
        internal
        returns (uint32 day)
    {
        vm.prank(operator);
        (day,) = familiars.recordVisit(label);

        PermissionedResolver r = PermissionedResolver(familiars.getResolver(label));
        bytes32 node = familiars.node(label);
        vm.startPrank(agent);
        r.setText(node, "avatar", img);
        r.setText(node, "mood", mood);
        r.setText(node, "day", vm.toString(day));
        dayLog.logDay(
            node,
            day,
            keccak256(bytes(string.concat(reqIds[0], ",", reqIds[1], ",", reqIds[2]))),
            keccak256(bytes(img)),
            keccak256("0g-storage-root")
        );
        vm.stopPrank();
    }

    /// @dev Kabir (wallet user) pays with W0G; the backend reads the Fed event to unlock the visit.
    function _kabirFeeds(bytes32 node, uint256 amount) internal returns (uint256 visits) {
        vm.startPrank(kabir);
        w0g.approve(address(feeder), amount);
        vm.recordLogs();
        feeder.feed(node, amount);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 fedSig = keccak256("Fed(address,bytes32,uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(feeder) && logs[i].topics[0] == fedSig) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), kabir, "feeder");
                assertEq(logs[i].topics[2], node, "Fed is tied to the ENS node");
                (, visits) = abi.decode(logs[i].data, (uint256, uint256));
            }
        }
    }

    // Journey A + B: hatch, feed, visit — records resolve and the day is logged.
    function test_journeyAB_hatchFeedVisit() public {
        PermissionedResolver r = _hatch("moss", kabir);
        bytes32 node = familiars.node("moss");

        uint256 visits = _kabirFeeds(node, PRICE);
        assertEq(visits, 1, "one $1 feed = one visit");

        uint32 day = _backendCompleteVisit(
            "moss", "proud", "https://0g/moss-1.png", ["whisper-req-1", "0gm-req-1", "seedream-req-1"]
        );

        assertEq(day, 1);
        (address resolved,,) = universalResolver.findResolver(_name("moss"));
        assertEq(resolved, address(r));
        assertEq(r.text(node, "mood"), "proud");
        assertEq(r.text(node, "avatar"), "https://0g/moss-1.png");
        assertEq(r.text(node, "day"), "1");
        assertEq(dayLog.lastDay(node), 1);
        assertEq(familiars.findExpiry("moss"), block.timestamp + 7 days);
    }

    // Journey B over a week: daily visits keep the name alive, every 7th visit is an evolution day.
    function test_journeyB_weekOfVisits() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 node = familiars.node("ember");
        string[7] memory moods = ["calm", "tired", "anxious", "joyful", "curious", "sad", "proud"];
        for (uint256 i; i < 7; ++i) {
            vm.warp(block.timestamp + 1 days);
            _backendCompleteVisit("ember", moods[i], string.concat("img-", vm.toString(i)), ["a", "b", "c"]);
        }
        assertEq(r.text(node, "day"), "7");
        assertEq(r.text(node, "mood"), "proud");
        assertEq(dayLog.lastDay(node), 7);
        assertFalse(familiars.isDormant("ember"));
    }

    // Journey C: skip 7 days -> asleep, then wake up with a feed and continue the day count.
    function test_journeyC_dormancyAndRevival() public {
        _hatch("moss", kabir);
        bytes32 node = familiars.node("moss");
        _kabirFeeds(node, PRICE);
        _backendCompleteVisit("moss", "calm", "img-1", ["a", "b", "c"]);

        vm.warp(block.timestamp + 7 days + 1);
        assertTrue(familiars.isDormant("moss"));
        (address asleep,,) = universalResolver.findResolver(_name("moss"));
        assertEq(asleep, address(0), "dormant name does not resolve");

        // Wake up costs one feed.
        _kabirFeeds(node, PRICE);
        vm.prank(operator);
        (, address woke) = familiars.wake("moss");
        uint32 day = _backendCompleteVisit("moss", "joyful", "img-wake", ["a", "b", "c"]);

        assertEq(day, 2, "day continues after revival");
        (address resolved,,) = universalResolver.findResolver(_name("moss"));
        assertEq(resolved, woke);
        assertEq(PermissionedResolver(woke).text(node, "mood"), "joyful");
        assertEq(familiars.findOwner("moss"), kabir);
        assertEq(w0g.balanceOf(address(feeder)), 2 * PRICE);
    }

    // Journey D: the agent's attempt to change the address reverts.
    function test_journeyD_agentAddressChangeReverts() public {
        PermissionedResolver r = _hatch("ember", iris);
        _backendCompleteVisit("ember", "curious", "img", ["a", "b", "c"]);
        bytes32 node = familiars.node("ember");
        vm.expectRevert();
        vm.prank(agent);
        r.setAddr(node, agent);
        assertEq(r.addr(node), address(0));
    }
}
