// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Base mainnet (8453). W0G from the 0G token-address table (Chainlink CCIP bridged);
///      pool found via UniswapV3Factory.getPool(W0G, USDC, 3000) and checked onchain.
library BaseAddresses {
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant W0G = 0x23cd099eB438CcA50349EE2BC809196b1ae00861;
    address internal constant W0G_USDC_POOL = 0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e;
    uint24 internal constant W0G_USDC_FEE = 3000;
    address internal constant SWAP_ROUTER_02 = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address internal constant QUOTER_V2 = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
}

/// @dev ENSv2 on Sepolia (11155111), from ensdomains/contracts-v2 deployments/sepolia
///      (deployed 2026-06-29, commit 48b3e2d).
library SepoliaENSv2 {
    address internal constant ROOT_REGISTRY = 0x11b5BfbE9078D826b1eDBDd1cFC12f5828D9F50C;
    address internal constant ETH_REGISTRY = 0x67b728a792e789a8978b30cF1b3b641f19354b43;
    address internal constant ETH_REGISTRAR = 0xa4449a0dD2b83007553D9b1d28b583A46A805a30;
    address internal constant LABEL_STORE = 0xB03524289C16424f71802A1794c29c7Bd1B9f577;
    address internal constant VERIFIABLE_FACTORY = 0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F;
    address internal constant PERMISSIONED_RESOLVER_IMPL = 0x7E4B2d59938930168024201752EE5503df402303;
    address internal constant UNIVERSAL_RESOLVER_V2 = 0x85eDf8B6b7D4211e2b07AA687506B746357B92cf;
    address internal constant MOCK_USDC = 0xD3322B29a7BdEe707D1684676f149bf41Aa3422f;
}

/// @dev 0G Chain mainnet (16661).
library ZeroGAddresses {
    address internal constant W0G = 0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c;
}
