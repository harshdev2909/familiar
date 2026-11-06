// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";

import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {PermissionedResolver} from "ensv2/resolver/PermissionedResolver.sol";
import {ILabelStore} from "ensv2/utils/interfaces/ILabelStore.sol";

import {FamiliarRegistry} from "../../src/FamiliarRegistry.sol";
import {SepoliaENSv2} from "../../script/Addresses.sol";

interface IETHRegistrar {
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        IERC20 paymentToken,
        bytes32 referrer
    ) external returns (uint256);
    function getRegisterPrice(string calldata label, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);
    function isAvailable(string calldata label) external view returns (bool);
}

interface IMintable {
    function mint(address to, uint256 amount) external;
}

interface IUniversalResolverV2 {
    function findResolver(bytes memory name) external view returns (address, bytes32, uint256);
    function findOwner(bytes calldata name) external view returns (address);
}

/// @notice Fork of Sepolia against the live ENSv2 deployment: registers a parent `.eth` name with
///         FamiliarRegistry as its subregistry and resolves a hatched Familiar through the live
///         UniversalResolverV2. This is exactly what script/DeployENS.s.sol does.
contract SepoliaENSv2ForkTest is Test {
    FamiliarRegistry familiars;
    address deployer = makeAddr("deployer");
    address agent = makeAddr("agent");
    address iris = makeAddr("iris");
    string parentLabel;

    function setUp() public {
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC", string("https://ethereum-sepolia-rpc.publicnode.com")));
        // familiar.eth is registered for real now; rehearse with a fresh parent label each run.
        parentLabel = vm.envOr("FORK_TEST_PARENT_LABEL", string.concat("familiarfork", vm.toString(block.number)));
        IETHRegistrar registrar = IETHRegistrar(SepoliaENSv2.ETH_REGISTRAR);
        assertTrue(registrar.isAvailable(parentLabel), "parent label available on Sepolia ENSv2");

        vm.startPrank(deployer);
        familiars = new FamiliarRegistry(
            ILabelStore(SepoliaENSv2.LABEL_STORE),
            IVerifiableFactory(SepoliaENSv2.VERIFIABLE_FACTORY),
            SepoliaENSv2.PERMISSIONED_RESOLVER_IMPL,
            string.concat(parentLabel, ".eth"),
            deployer,
            deployer,
            agent
        );

        uint64 duration = 365 days;
        bytes32 secret = keccak256("familiar-secret");
        IRegistry sub = IRegistry(address(familiars));
        registrar.commit(registrar.makeCommitment(parentLabel, deployer, secret, sub, address(0), duration, 0));
        vm.warp(block.timestamp + 61);

        IERC20 usdc = IERC20(SepoliaENSv2.MOCK_USDC);
        (uint256 base, uint256 premium) = registrar.getRegisterPrice(parentLabel, duration, usdc);
        IMintable(address(usdc)).mint(deployer, base + premium);
        usdc.approve(address(registrar), base + premium);
        registrar.register(parentLabel, deployer, secret, sub, address(0), duration, usdc, 0);

        familiars.setParent(IRegistry(SepoliaENSv2.ETH_REGISTRY), parentLabel);
        vm.stopPrank();
    }

    function test_fork_hatchResolvesOnLiveENSv2() public {
        vm.prank(deployer);
        (, address resolver) = familiars.hatch("ember", iris);

        bytes memory name = NameCoder.encode(string.concat("ember.", parentLabel, ".eth"));
        IUniversalResolverV2 ur = IUniversalResolverV2(SepoliaENSv2.UNIVERSAL_RESOLVER_V2);
        (address found,,) = ur.findResolver(name);
        assertEq(found, resolver, "live UniversalResolverV2 finds the Familiar's resolver");
        assertEq(ur.findOwner(name), iris);

        PermissionedResolver r = PermissionedResolver(resolver);
        bytes32 node = familiars.node("ember");
        vm.prank(agent);
        r.setText(node, "mood", "joyful");
        assertEq(r.text(node, "mood"), "joyful");

        vm.expectRevert();
        vm.prank(agent);
        r.setAddr(node, agent);
    }

    function test_fork_dormancyOnLiveENSv2() public {
        vm.prank(deployer);
        familiars.hatch("ember", iris);
        vm.warp(block.timestamp + 7 days);
        bytes memory name = NameCoder.encode(string.concat("ember.", parentLabel, ".eth"));
        (address found,,) = IUniversalResolverV2(SepoliaENSv2.UNIVERSAL_RESOLVER_V2).findResolver(name);
        assertEq(found, address(0));
    }
}
