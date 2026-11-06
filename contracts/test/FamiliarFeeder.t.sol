// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "~test/mocks/MockERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {FamiliarFeeder} from "../src/FamiliarFeeder.sol";

contract FamiliarFeederTest is Test {
    MockERC20 w0g;
    FamiliarFeeder feeder;
    address kabir = makeAddr("kabir");
    bytes32 constant EMBER = keccak256("ember.familiar.eth");
    uint256 constant PRICE = 3e18; // ~$1 of W0G

    function setUp() public {
        w0g = new MockERC20("W0G", 18);
        feeder = new FamiliarFeeder(address(w0g), PRICE);
        w0g.mint(kabir, 100e18);
    }

    function test_feed_pullsW0GAndEmitsFed() public {
        vm.startPrank(kabir);
        w0g.approve(address(feeder), 7e18);
        vm.expectEmit(address(feeder));
        emit FamiliarFeeder.Fed(kabir, EMBER, 7e18, 2);
        feeder.feed(EMBER, 7e18);
        vm.stopPrank();
        assertEq(w0g.balanceOf(address(feeder)), 7e18);
        assertEq(w0g.balanceOf(kabir), 93e18);
    }

    function test_feed_revertsBelowPrice() public {
        vm.startPrank(kabir);
        w0g.approve(address(feeder), PRICE);
        vm.expectRevert(abi.encodeWithSelector(FamiliarFeeder.TooLittle.selector, PRICE - 1, PRICE));
        feeder.feed(EMBER, PRICE - 1);
        vm.stopPrank();
    }

    function test_feed_revertsWithoutApproval() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(feeder), 0, PRICE)
        );
        vm.prank(kabir);
        feeder.feed(EMBER, PRICE);
    }

    function test_setPrice_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, kabir));
        vm.prank(kabir);
        feeder.setPrice(1);

        vm.expectEmit(address(feeder));
        emit FamiliarFeeder.PriceUpdated(5e18);
        feeder.setPrice(5e18);
        assertEq(feeder.pricePerVisit(), 5e18);
    }

    function test_setPrice_rejectsZero() public {
        vm.expectRevert(FamiliarFeeder.ZeroPrice.selector);
        feeder.setPrice(0);
        vm.expectRevert(FamiliarFeeder.ZeroPrice.selector);
        new FamiliarFeeder(address(w0g), 0);
    }

    function test_withdraw_onlyOwner() public {
        vm.startPrank(kabir);
        w0g.approve(address(feeder), PRICE);
        feeder.feed(EMBER, PRICE);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, kabir));
        vm.prank(kabir);
        feeder.withdraw(kabir, PRICE);

        address treasury = makeAddr("treasury");
        feeder.withdraw(treasury, PRICE);
        assertEq(w0g.balanceOf(treasury), PRICE);
    }

    function testFuzz_feed_visitsIsFloorOfAmountOverPrice(uint256 amount) public {
        amount = bound(amount, PRICE, 100e18);
        vm.startPrank(kabir);
        w0g.approve(address(feeder), amount);
        vm.expectEmit(address(feeder));
        emit FamiliarFeeder.Fed(kabir, EMBER, amount, amount / PRICE);
        feeder.feed(EMBER, amount);
        vm.stopPrank();
        assertEq(w0g.balanceOf(address(feeder)), amount);
    }
}
