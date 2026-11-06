// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";

import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "ensv2/utils/interfaces/ILabelStore.sol";

import {FamiliarFeeder} from "../src/FamiliarFeeder.sol";
import {FamiliarLog} from "../src/FamiliarLog.sol";
import {FamiliarRegistry} from "../src/FamiliarRegistry.sol";
import {BaseAddresses, SepoliaENSv2} from "./Addresses.sol";
import {IETHRegistrar, IMintable} from "../test/fork/SepoliaENSv2.fork.t.sol";

interface IQuoterV2Lite {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

abstract contract DeployBase is Script {
    uint256 internal pk;
    address internal deployer;
    address internal agent;

    function _init() internal {
        pk = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(pk);
        agent = vm.envOr("AGENT_ADDRESS", deployer);
    }

    function _path() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
    }

    function _save(string memory key, address value) internal {
        string memory path = _path();
        if (!vm.exists(path)) vm.writeFile(path, "{}");
        vm.writeJson(vm.toString(value), path, string.concat(".", key));
        console2.log(key, value);
    }
}

/// @notice Base mainnet: FamiliarFeeder priced so that $1 of USDC (minus slippage room) buys one visit.
///         forge script script/Deploy.s.sol:DeployFeeder --rpc-url base --broadcast
contract DeployFeeder is DeployBase {
    function run() external returns (FamiliarFeeder feeder) {
        _init();
        uint256 price = vm.envOr("FEEDER_PRICE_W0G", uint256(0));
        if (price == 0) {
            (uint256 out,,,) = IQuoterV2Lite(BaseAddresses.QUOTER_V2).quoteExactInputSingle(
                IQuoterV2Lite.QuoteExactInputSingleParams(
                    BaseAddresses.USDC, BaseAddresses.W0G, 1e6, BaseAddresses.W0G_USDC_FEE, 0
                )
            );
            price = out * 90 / 100;
        }
        console2.log("pricePerVisit (W0G wei)", price);
        vm.startBroadcast(pk);
        feeder = new FamiliarFeeder(BaseAddresses.W0G, price);
        vm.stopBroadcast();
        _save("FamiliarFeeder", address(feeder));
    }
}

/// @notice 0G Chain mainnet: FamiliarLog with the agent key.
///         forge script script/Deploy.s.sol:DeployLog --rpc-url zg --broadcast
contract DeployLog is DeployBase {
    function run() external returns (FamiliarLog dayLog) {
        _init();
        vm.startBroadcast(pk);
        dayLog = new FamiliarLog(agent);
        vm.stopBroadcast();
        _save("FamiliarLog", address(dayLog));
    }
}

/// @notice Sepolia ENSv2, phase 1: deploy FamiliarRegistry and commit to `<label>.eth`.
///         Wait >= 60 s, then run DeployENSFinish.
contract DeployENSCommit is DeployBase {
    function run() external virtual returns (FamiliarRegistry familiars) {
        _init();
        string memory label = vm.envOr("FAMILIAR_PARENT_LABEL", string("familiar"));
        IETHRegistrar registrar = IETHRegistrar(SepoliaENSv2.ETH_REGISTRAR);
        require(registrar.isAvailable(label), "parent label not available");

        vm.startBroadcast(pk);
        familiars = new FamiliarRegistry(
            ILabelStore(SepoliaENSv2.LABEL_STORE),
            IVerifiableFactory(SepoliaENSv2.VERIFIABLE_FACTORY),
            SepoliaENSv2.PERMISSIONED_RESOLVER_IMPL,
            string.concat(label, ".eth"),
            deployer,
            vm.envOr("OPERATOR_ADDRESS", agent),
            agent
        );
        registrar.commit(
            registrar.makeCommitment(
                label, deployer, _secret(), IRegistry(address(familiars)), address(0), _duration(), 0
            )
        );
        vm.stopBroadcast();
        _save("FamiliarRegistry", address(familiars));
    }

    function _secret() internal view returns (bytes32) {
        return keccak256(abi.encode("familiar", vm.envUint("PRIVATE_KEY")));
    }

    function _duration() internal pure returns (uint64) {
        return 365 days;
    }
}

/// @notice Sepolia ENSv2, phase 2: register `<label>.eth` with FamiliarRegistry as its subregistry
///         (paid in the testnet MockUSDC) and link the registry to its parent.
contract DeployENSFinish is DeployENSCommit {
    function run() external override returns (FamiliarRegistry familiars) {
        _init();
        string memory label = vm.envOr("FAMILIAR_PARENT_LABEL", string("familiar"));
        familiars = FamiliarRegistry(vm.parseJsonAddress(vm.readFile(_path()), ".FamiliarRegistry"));
        IETHRegistrar registrar = IETHRegistrar(SepoliaENSv2.ETH_REGISTRAR);
        IERC20 usdc = IERC20(SepoliaENSv2.MOCK_USDC);
        (uint256 base, uint256 premium) = registrar.getRegisterPrice(label, _duration(), usdc);

        vm.startBroadcast(pk);
        IMintable(address(usdc)).mint(deployer, base + premium);
        usdc.approve(address(registrar), base + premium);
        registrar.register(
            label, deployer, _secret(), IRegistry(address(familiars)), address(0), _duration(), usdc, 0
        );
        familiars.setParent(IRegistry(SepoliaENSv2.ETH_REGISTRY), label);
        vm.stopBroadcast();
        console2.log("registered", string.concat(label, ".eth"));
    }
}
