#!/usr/bin/env bash
# Deploy all Familiar contracts. Requires PRIVATE_KEY, and BASE_RPC / SEPOLIA_RPC / ZG_RPC.
# Usage: ./deploy.sh [all|base|sepolia|zg]   (add EXTRA="--verify" etc. via env)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
: "${PRIVATE_KEY:?set PRIVATE_KEY}"
target="${1:-all}"
# --skip-simulation: gas comes from the node's eth_estimateGas. Forge's local EVM undercounts
# state-creation gas on Amsterdam chains (Sepolia), ~4.2M vs ~29.6M for FamiliarRegistry.
B="--broadcast --slow --skip-simulation ${EXTRA:-}"

if [[ $target == all || $target == sepolia ]]; then
  forge script script/Deploy.s.sol:DeployENSCommit --rpc-url "${SEPOLIA_RPC:?}" $B
  echo "waiting 70s for the ENS commitment to mature..."
  if [[ "${LOCAL_REHEARSAL:-}" == 1 ]]; then cast rpc evm_increaseTime 70 --rpc-url "$SEPOLIA_RPC" >/dev/null; cast rpc evm_mine --rpc-url "$SEPOLIA_RPC" >/dev/null; else sleep 70; fi
  forge script script/Deploy.s.sol:DeployENSFinish --rpc-url "$SEPOLIA_RPC" $B
fi
if [[ $target == all || $target == base ]]; then
  forge script script/Deploy.s.sol:DeployFeeder --rpc-url "${BASE_RPC:?}" $B
fi
if [[ $target == all || $target == zg ]]; then
  forge script script/Deploy.s.sol:DeployLog --rpc-url "${ZG_RPC:?}" $B --legacy
fi
echo "done. addresses in deployments/<chainId>.json"
