// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {V2Fixture} from "~test/fixtures/V2Fixture.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

import {RegistryRolesLib} from "ensv2/registry/libraries/RegistryRolesLib.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {PermissionedResolver} from "ensv2/resolver/PermissionedResolver.sol";

import {FamiliarRegistry} from "../src/FamiliarRegistry.sol";

/// @dev Full local ENSv2 stack: root -> eth -> familiar.eth (FamiliarRegistry) -> per-Familiar resolvers.
abstract contract FamiliarBase is V2Fixture {
    FamiliarRegistry familiars;
    PermissionedResolver resolverImpl;

    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address agent = makeAddr("agent");
    address iris = makeAddr("iris");
    address kabir = makeAddr("kabir");

    function setUp() public virtual {
        deployV2Fixture();
        resolverImpl = new PermissionedResolver(address(this));
        familiars = new FamiliarRegistry(
            labelStore, verifiableFactory, address(resolverImpl), "familiar.eth", admin, operator, agent
        );
        // familiar.eth is registered in the .eth registry with FamiliarRegistry as its subregistry.
        ethRegistry.register(
            "familiar",
            address(this),
            IRegistry(address(familiars)),
            address(0),
            RegistryRolesLib.ROLE_SET_SUBREGISTRY | RegistryRolesLib.ROLE_SET_RESOLVER,
            uint64(block.timestamp + 365 days)
        );
        vm.prank(admin);
        familiars.setParent(ethRegistry, "familiar");
    }

    function _hatch(string memory label, address owner) internal returns (PermissionedResolver r) {
        vm.prank(operator);
        (, address resolver) = familiars.hatch(label, owner);
        r = PermissionedResolver(resolver);
    }

    function _name(string memory label) internal pure returns (bytes memory) {
        return NameCoder.encode(string.concat(label, ".familiar.eth"));
    }

    function _node(string memory label) internal pure returns (bytes32) {
        return NameCoder.namehash(_name(label), 0);
    }
}
