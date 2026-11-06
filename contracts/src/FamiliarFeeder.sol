// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FamiliarFeeder
/// @notice Receives W0G (swapped from USDC through the Uniswap API) and signals a paid visit.
///         `familiarNode` is the ENS namehash of the Familiar, so each payment is tied to a name.
contract FamiliarFeeder is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable w0g;
    uint256 public pricePerVisit; // in W0G wei

    event Fed(address indexed feeder, bytes32 indexed familiarNode, uint256 amount, uint256 visits);
    event PriceUpdated(uint256 price);
    event Withdrawn(address indexed to, uint256 amount);

    error TooLittle(uint256 amount, uint256 price);
    error ZeroPrice();

    constructor(address _w0g, uint256 _price) Ownable(msg.sender) {
        if (_price == 0) revert ZeroPrice();
        w0g = IERC20(_w0g);
        pricePerVisit = _price;
        emit PriceUpdated(_price);
    }

    /// @notice Pull `amount` W0G from the caller and credit `amount / pricePerVisit` visits.
    function feed(bytes32 familiarNode, uint256 amount) external {
        uint256 price = pricePerVisit;
        if (amount < price) revert TooLittle(amount, price);
        w0g.safeTransferFrom(msg.sender, address(this), amount);
        emit Fed(msg.sender, familiarNode, amount, amount / price);
    }

    function setPrice(uint256 p) external onlyOwner {
        if (p == 0) revert ZeroPrice();
        pricePerVisit = p;
        emit PriceUpdated(p);
    }

    function withdraw(address to, uint256 amt) external onlyOwner {
        w0g.safeTransfer(to, amt);
        emit Withdrawn(to, amt);
    }
}
