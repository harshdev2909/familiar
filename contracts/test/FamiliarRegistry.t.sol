// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEnhancedAccessControl} from "ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {EACBaseRolesLib} from "ensv2/access-control/libraries/EACBaseRolesLib.sol";
import {IStandardRegistry} from "ensv2/registry/interfaces/IStandardRegistry.sol";
import {IPermissionedRegistry} from "ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {RegistryRolesLib} from "ensv2/registry/libraries/RegistryRolesLib.sol";
import {PermissionedResolver} from "ensv2/resolver/PermissionedResolver.sol";
import {PermissionedResolverLib} from "ensv2/resolver/libraries/PermissionedResolverLib.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {LibLabel} from "ensv2/utils/LibLabel.sol";

import {FamiliarRegistry} from "../src/FamiliarRegistry.sol";
import {FamiliarBase} from "./FamiliarBase.sol";

contract FamiliarRegistryTest is FamiliarBase {
    // ------------------------------------------------------------------
    // Hatching
    // ------------------------------------------------------------------

    function test_hatch_registersOwnerExpiryAndResolver() public {
        PermissionedResolver r = _hatch("ember", iris);

        assertEq(familiars.findOwner("ember"), iris, "owner");
        assertEq(familiars.findExpiry("ember"), block.timestamp + 7 days, "expiry");
        assertEq(familiars.getResolver("ember"), address(r), "resolver");
        assertEq(uint8(familiars.getStatus(LibLabel.id("ember"))), uint8(IPermissionedRegistry.Status.REGISTERED));

        (FamiliarRegistry.Familiar memory f,, bool dormant) = familiars.familiar("ember");
        assertEq(f.bondedOwner, iris);
        assertEq(f.generation, 1);
        assertEq(f.day, 0);
        assertFalse(dormant);
    }

    function test_hatch_resolvesThroughUniversalResolver() public {
        PermissionedResolver r = _hatch("ember", iris);
        (address found,,) = universalResolver.findResolver(_name("ember"));
        assertEq(found, address(r), "ember.familiar.eth resolves to its own resolver");
        assertEq(universalResolver.findOwner(_name("ember")), iris);
    }

    function test_hatch_eachFamiliarGetsItsOwnVerifiableResolver() public {
        PermissionedResolver a = _hatch("ember", iris);
        PermissionedResolver b = _hatch("moss", kabir);
        assertTrue(address(a) != address(b));
        assertEq(verifiableFactory.verifyContract(address(a)), address(resolverImpl));
        assertEq(verifiableFactory.verifyContract(address(b)), address(resolverImpl));
    }

    function test_hatch_emitsEvent() public {
        address predicted =
            _computeVerifiableFactoryAddress(address(familiars), uint256(keccak256(abi.encode(LibLabel.id("ember"), uint32(1)))));
        vm.expectEmit(address(familiars));
        emit FamiliarRegistry.Hatched("ember", _node("ember"), iris, predicted, 1, uint64(block.timestamp + 7 days));
        _hatch("ember", iris);
    }

    function test_hatch_onlyOperator() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector,
                familiars.ROOT_RESOURCE(),
                RegistryRolesLib.ROLE_REGISTRAR,
                iris
            )
        );
        vm.prank(iris);
        familiars.hatch("ember", iris);
    }

    function test_hatch_rejectsZeroOwner() public {
        vm.expectRevert(FamiliarRegistry.ZeroOwner.selector);
        vm.prank(operator);
        familiars.hatch("ember", address(0));
    }

    function test_hatch_cannotHatchTwiceWhileAwake() public {
        _hatch("ember", iris);
        vm.expectRevert(abi.encodeWithSelector(IStandardRegistry.LabelAlreadyRegistered.selector, "ember"));
        vm.prank(operator);
        familiars.hatch("ember", iris);
    }

    function test_hatch_bondedLabelCannotGoToSomeoneElse() public {
        _hatch("ember", iris);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(abi.encodeWithSelector(FamiliarRegistry.BondedToAnother.selector, "ember", iris));
        vm.prank(operator);
        familiars.hatch("ember", kabir);
    }

    // ------------------------------------------------------------------
    // Resolver roles (Enhanced Access Control)
    // ------------------------------------------------------------------

    function test_agent_canWriteScopedTextRecords() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 node = _node("ember");
        vm.startPrank(agent);
        r.setText(node, "avatar", "https://0g.storage/ember-day1.png");
        r.setText(node, "mood", "proud");
        r.setText(node, "day", "1");
        vm.stopPrank();
        assertEq(r.text(node, "avatar"), "https://0g.storage/ember-day1.png");
        assertEq(r.text(node, "mood"), "proud");
        assertEq(r.text(node, "day"), "1");
    }

    function test_agent_setAddrReverts() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 node = _node("ember");
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector,
                PermissionedResolverLib.resource(node, 0),
                PermissionedResolverLib.ROLE_SET_ADDR,
                agent
            )
        );
        vm.prank(agent);
        r.setAddr(node, agent);
    }

    function test_agent_cannotWriteOtherTextKeys() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 node = _node("ember");
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector,
                PermissionedResolverLib.resource(node, 0),
                PermissionedResolverLib.ROLE_SET_TEXT,
                agent
            )
        );
        vm.prank(agent);
        r.setText(node, "url", "https://phish.example");
    }

    function test_agent_cannotWriteAnotherNameOnSameResolver() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 other = _node("moss");
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector,
                PermissionedResolverLib.resource(other, 0),
                PermissionedResolverLib.ROLE_SET_TEXT,
                agent
            )
        );
        vm.prank(agent);
        r.setText(other, "avatar", "x");
    }

    function test_agent_cannotWriteAnotherFamiliarsResolver() public {
        _hatch("ember", iris);
        PermissionedResolver moss = _hatch("moss", kabir);
        // The agent is authorized on moss's resolver for moss only, never for ember.
        bytes32 emberNode = _node("ember");
        vm.expectRevert();
        vm.prank(agent);
        moss.setText(emberNode, "avatar", "x");
    }

    function test_agent_cannotGrantItselfMoreRoles() public {
        PermissionedResolver r = _hatch("ember", iris);
        vm.expectRevert();
        vm.prank(agent);
        r.authorizeTextRoles(_name("ember"), "url", agent, true);
        vm.expectRevert();
        vm.prank(agent);
        r.grantRootRoles(PermissionedResolverLib.ROLE_SET_ADDR, agent);
    }

    function test_owner_holdsAllRolesAndRegistryRenounced() public {
        PermissionedResolver r = _hatch("ember", iris);
        assertTrue(r.hasRootRoles(EACBaseRolesLib.ALL_ROLES, iris), "owner has every root role");
        assertEq(r.roles(r.ROOT_RESOURCE(), address(familiars)), 0, "registry renounced");
        assertEq(r.roles(r.ROOT_RESOURCE(), agent), 0, "agent has no root roles");
    }

    function test_owner_canSetAddrAndFireAgent() public {
        PermissionedResolver r = _hatch("ember", iris);
        bytes32 node = _node("ember");
        vm.startPrank(iris);
        r.setAddr(node, iris);
        r.authorizeTextRoles(_name("ember"), "mood", agent, false);
        vm.stopPrank();
        assertEq(r.addr(node), iris);

        vm.expectRevert();
        vm.prank(agent);
        r.setText(node, "mood", "sad");
    }

    // ------------------------------------------------------------------
    // Non-transferability
    // ------------------------------------------------------------------

    function test_name_isNonTransferable() public {
        _hatch("ember", iris);
        uint256 tokenId = familiars.findTokenId("ember");
        vm.expectRevert(abi.encodeWithSelector(IStandardRegistry.TransferDisallowed.selector, tokenId, iris));
        vm.prank(iris);
        familiars.safeTransferFrom(iris, kabir, tokenId, 1, "");
    }

    function test_owner_cannotRenewOrUnregister() public {
        _hatch("ember", iris);
        uint256 tokenId = familiars.findTokenId("ember");
        vm.expectRevert();
        vm.prank(iris);
        familiars.renew(tokenId, uint64(block.timestamp + 365 days));
        vm.expectRevert();
        vm.prank(iris);
        familiars.unregister(tokenId);
    }

    // ------------------------------------------------------------------
    // Visits, streak renewal, dormancy, revival
    // ------------------------------------------------------------------

    function test_recordVisit_incrementsDayAndRollsExpiry() public {
        _hatch("ember", iris);
        vm.warp(block.timestamp + 3 days);
        vm.expectEmit(address(familiars));
        emit FamiliarRegistry.Visited(_node("ember"), 1, uint64(block.timestamp + 7 days));
        vm.prank(operator);
        (uint32 day, uint64 expiry) = familiars.recordVisit("ember");
        assertEq(day, 1);
        assertEq(expiry, block.timestamp + 7 days);
        assertEq(familiars.findExpiry("ember"), expiry);
    }

    function test_recordVisit_doesNotStackBeyondSevenDays() public {
        _hatch("ember", iris);
        vm.startPrank(operator);
        for (uint256 i; i < 10; ++i) familiars.recordVisit("ember");
        vm.stopPrank();
        assertEq(familiars.findExpiry("ember"), block.timestamp + 7 days, "rolling window, not stacked");
        (FamiliarRegistry.Familiar memory f,,) = familiars.familiar("ember");
        assertEq(f.day, 10);
    }

    function test_recordVisit_onlyOperator() public {
        _hatch("ember", iris);
        vm.expectRevert();
        vm.prank(iris);
        familiars.recordVisit("ember");
    }

    function test_dormancy_afterSevenDaysNameStopsResolving() public {
        _hatch("ember", iris);
        vm.warp(block.timestamp + 7 days);
        assertTrue(familiars.isDormant("ember"));
        assertEq(familiars.findOwner("ember"), address(0), "no owner while asleep");
        assertEq(familiars.getResolver("ember"), address(0), "no resolver while asleep");
        (address found,,) = universalResolver.findResolver(_name("ember"));
        assertEq(found, address(0), "ember.familiar.eth stops resolving");

        vm.expectRevert(abi.encodeWithSelector(FamiliarRegistry.Dormant.selector, "ember"));
        vm.prank(operator);
        familiars.recordVisit("ember");
    }

    function test_streakKeepsFamiliarAwake() public {
        _hatch("ember", iris);
        for (uint256 i; i < 30; ++i) {
            vm.warp(block.timestamp + 1 days);
            vm.prank(operator);
            familiars.recordVisit("ember");
        }
        assertFalse(familiars.isDormant("ember"));
        (FamiliarRegistry.Familiar memory f,,) = familiars.familiar("ember");
        assertEq(f.day, 30);
    }

    function test_wake_rehatchesForBondedOwnerWithFreshResolver() public {
        PermissionedResolver first = _hatch("ember", iris);
        vm.prank(operator);
        familiars.recordVisit("ember");
        vm.prank(agent);
        first.setText(_node("ember"), "mood", "calm");

        vm.warp(block.timestamp + 8 days);
        vm.prank(operator);
        (, address resolver) = familiars.wake("ember");
        PermissionedResolver second = PermissionedResolver(resolver);

        assertTrue(address(second) != address(first));
        assertEq(familiars.findOwner("ember"), iris);
        assertEq(familiars.getResolver("ember"), address(second));
        assertFalse(familiars.isDormant("ember"));
        (FamiliarRegistry.Familiar memory f,,) = familiars.familiar("ember");
        assertEq(f.generation, 2);
        assertEq(f.day, 1, "day counter survives dormancy");

        vm.prank(agent);
        second.setText(_node("ember"), "mood", "joyful");
        assertEq(second.text(_node("ember"), "mood"), "joyful");
    }

    function test_wake_revertsIfAwakeOrNeverHatched() public {
        vm.expectRevert(abi.encodeWithSelector(FamiliarRegistry.NeverHatched.selector, "ghost"));
        vm.prank(operator);
        familiars.wake("ghost");

        _hatch("ember", iris);
        vm.expectRevert(abi.encodeWithSelector(FamiliarRegistry.StillAwake.selector, "ember"));
        vm.prank(operator);
        familiars.wake("ember");
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function test_nodeAndDnsNameMatchENS() public view {
        assertEq(familiars.node("ember"), _node("ember"));
        assertEq(familiars.dnsName("ember"), _name("ember"));
        assertEq(familiars.PARENT_NODE(), NameCoder.namehash(NameCoder.encode("familiar.eth"), 0));
    }

    function testFuzz_hatchAnyValidLabel(string memory label) public {
        vm.assume(bytes(label).length > 0 && bytes(label).length < 64);
        for (uint256 i; i < bytes(label).length; ++i) {
            vm.assume(bytes(label)[i] != ".");
        }
        PermissionedResolver r = _hatch(label, iris);
        vm.prank(agent);
        r.setText(_node(label), "day", "1");
        assertEq(r.text(_node(label), "day"), "1");
    }
}
