// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FamiliarFeeder} from "../../src/FamiliarFeeder.sol";
import {BaseAddresses} from "../../script/Addresses.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

interface IQuoterV2 {
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

/// @notice Fork of Base mainnet: $1 USDC -> real W0G through the real Uniswap V3 W0G/USDC pool,
///         then approve + feed, i.e. the same three calls the EIP-5792 batch performs.
contract BaseFeedForkTest is Test {
    IERC20 usdc = IERC20(BaseAddresses.USDC);
    IERC20 w0g = IERC20(BaseAddresses.W0G);
    FamiliarFeeder feeder;
    address kabir = makeAddr("kabir");
    bytes32 constant EMBER = keccak256("ember.familiar.eth");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC", string("https://mainnet.base.org")));
        uint256 pricePerVisit = _quote(1e6) * 95 / 100; // $1 always covers one visit, 5% slippage room
        feeder = new FamiliarFeeder(address(w0g), pricePerVisit);
        deal(address(usdc), kabir, 10e6);
    }

    function _quote(uint256 usdcIn) internal returns (uint256 out) {
        (out,,,) = IQuoterV2(BaseAddresses.QUOTER_V2).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams(address(usdc), address(w0g), usdcIn, BaseAddresses.W0G_USDC_FEE, 0)
        );
    }

    function test_fork_poolIsTheW0GUSDCPool() public view {
        assertGt(w0g.balanceOf(BaseAddresses.W0G_USDC_POOL), 1000e18, "pool has W0G liquidity");
        assertGt(usdc.balanceOf(BaseAddresses.W0G_USDC_POOL), 1000e6, "pool has USDC liquidity");
    }

    function test_fork_swapOneDollarAndFeed() public {
        uint256 minOut = _quote(1e6) * 99 / 100;
        vm.startPrank(kabir);
        usdc.approve(BaseAddresses.SWAP_ROUTER_02, 1e6);
        uint256 out = ISwapRouter02(BaseAddresses.SWAP_ROUTER_02).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(usdc),
                tokenOut: address(w0g),
                fee: BaseAddresses.W0G_USDC_FEE,
                recipient: kabir,
                amountIn: 1e6,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        assertGe(out, minOut);

        // The batch feeds the quote's minimum output, so it never exceeds what the swap returned.
        w0g.approve(address(feeder), minOut);
        vm.expectEmit(address(feeder));
        emit FamiliarFeeder.Fed(kabir, EMBER, minOut, 1);
        feeder.feed(EMBER, minOut);
        vm.stopPrank();

        assertEq(w0g.balanceOf(address(feeder)), minOut);
        assertEq(usdc.balanceOf(kabir), 9e6);
        emit log_named_decimal_uint("W0G per $1", out, 18);
    }
}
