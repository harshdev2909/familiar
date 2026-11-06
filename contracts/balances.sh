#!/usr/bin/env bash
# Show what the deployer and agent wallets hold on each chain, and what they still need.
set -euo pipefail
cd "$(dirname "$0")"; set -a; . ./.env; set +a
D=$(cast wallet address "$PRIVATE_KEY"); A=$(cast wallet address "$AGENT_PRIVATE_KEY")
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
row() { printf "  %-9s %-14s %-12s need >= %s\n" "$1" "$2" "$3" "$4"; }
bal() { cast from-wei "$(cast balance "$1" --rpc-url "$2")"; }
echo "deployer $D"
row deployer "Sepolia ETH" "$(bal $D $SEPOLIA_RPC)" 0.05
row deployer "Base ETH"    "$(bal $D $BASE_RPC)"    0.001
row deployer "Base USDC"   "$(cast call $USDC 'balanceOf(address)(uint256)' $D --rpc-url $BASE_RPC | awk '{printf "%.2f", $1/1e6}')" "4 (smoke test + 3 README swaps)"
row deployer "0G"          "$(bal $D $ZG_RPC)"      0.05
echo "agent    $A"
row agent "Sepolia ETH" "$(bal $A $SEPOLIA_RPC)" 0.05
row agent "0G"          "$(bal $A $ZG_RPC)"      0.5
