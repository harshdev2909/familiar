#!/usr/bin/env bash
# Post-deploy smoke test against the DEPLOYED contracts (reads deployments/<chainId>.json).
# Drives the same calls the backend makes: hatch -> visit -> agent writes records -> resolve via the
# live ENSv2 UniversalResolver -> agent setAddr must revert; $1 USDC -> W0G -> feed; logDay on 0G.
#
# Env: PRIVATE_KEY (deployer/owner/payer), AGENT_PRIVATE_KEY, OPERATOR_PRIVATE_KEY (default: agent), SEPOLIA_RPC, BASE_RPC, ZG_RPC
#      SMOKE_LABEL (default: smoke<timestamp>), SKIP_BASE=1 to skip the real-money feed.
#      LOCAL_REHEARSAL=1 funds the wallet with USDC on an anvil Base fork.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; exit 1; }
addr() { jq -r ".$2" "deployments/$1.json"; }
lc() { echo "$1" | tr "[:upper:]" "[:lower:]"; }
OPERATOR_PRIVATE_KEY="${OPERATOR_PRIVATE_KEY:-$AGENT_PRIVATE_KEY}"

LABEL="${SMOKE_LABEL:-smoke$(date +%s)}"
OP=$(cast wallet address "$PRIVATE_KEY")
AGENT=$(cast wallet address "$AGENT_PRIVATE_KEY")
UR=0x85eDf8B6b7D4211e2b07AA687506B746357B92cf

echo "== Sepolia ENSv2 ($LABEL)"
REG=$(addr 11155111 FamiliarRegistry)
PARENT=$(cast call "$REG" "parentName()(string)" --rpc-url "$SEPOLIA_RPC" | tr -d '"')
NAME="$LABEL.$PARENT"
DNS=$(cast call "$REG" "dnsName(string)(bytes)" "$LABEL" --rpc-url "$SEPOLIA_RPC")
NODE=$(cast namehash "$NAME")
[ "$(cast call "$REG" "node(string)(bytes32)" "$LABEL" --rpc-url "$SEPOLIA_RPC")" == "$NODE" ] && pass "registry node == namehash($NAME)" || fail "node mismatch"

cast send "$REG" "hatch(string,address)" "$LABEL" "$OP" --private-key "$OPERATOR_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC" >/dev/null
RES=$(cast call "$REG" "getResolver(string)(address)" "$LABEL" --rpc-url "$SEPOLIA_RPC")
[ "$RES" != 0x0000000000000000000000000000000000000000 ] && pass "hatched $NAME, resolver $RES" || fail "no resolver"

FOUND=$(cast call "$UR" "findResolver(bytes)(address,bytes32,uint256)" "$DNS" --rpc-url "$SEPOLIA_RPC" | head -1)
[ "$(lc "$FOUND")" == "$(lc "$RES")" ] && pass "live UniversalResolverV2 resolves $NAME" || fail "UR returned $FOUND"

cast send "$REG" "recordVisit(string)" "$LABEL" --private-key "$OPERATOR_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC" >/dev/null
for kv in "avatar=https://example.com/$LABEL-1.png" "mood=proud" "day=1"; do
  cast send "$RES" "setText(bytes32,string,string)" "$NODE" "${kv%%=*}" "${kv#*=}" --private-key "$AGENT_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC" >/dev/null
done
MOOD=$(cast call "$RES" "text(bytes32,string)(string)" "$NODE" mood --rpc-url "$SEPOLIA_RPC" | tr -d '"')
[ "$MOOD" == proud ] && pass "agent wrote avatar/mood/day (mood=$MOOD)" || fail "mood=$MOOD"

if cast call "$RES" "setAddr(bytes32,address)" "$NODE" "$AGENT" --from "$AGENT" --rpc-url "$SEPOLIA_RPC" >/dev/null 2>&1; then
  fail "agent setAddr did NOT revert"
else pass "agent setAddr reverts (EACUnauthorizedAccountRoles)"; fi
if cast call "$RES" "setText(bytes32,string,string)" "$NODE" url x --from "$AGENT" --rpc-url "$SEPOLIA_RPC" >/dev/null 2>&1; then
  fail "agent setText(url) did NOT revert"
else pass "agent setText(url) reverts"; fi

TOKEN=$(cast call "$REG" "findTokenId(string)(uint256)" "$LABEL" --rpc-url "$SEPOLIA_RPC" | cut -d' ' -f1)
if cast call "$REG" "safeTransferFrom(address,address,uint256,uint256,bytes)" "$OP" "$AGENT" "$TOKEN" 1 0x --from "$OP" --rpc-url "$SEPOLIA_RPC" >/dev/null 2>&1; then
  fail "transfer did NOT revert"
else pass "name is non-transferable"; fi

echo "== 0G Chain FamiliarLog"
LOG=$(addr 16661 FamiliarLog)
LAST=$(cast call "$LOG" "lastDay(bytes32)(uint32)" "$NODE" --rpc-url "$ZG_RPC")
cast send "$LOG" "logDay(bytes32,uint32,bytes32,bytes32,bytes32)" "$NODE" $((LAST + 1)) \
  "$(cast keccak "smoke-req-ids")" "$(cast keccak "smoke-img")" "$(cast keccak "smoke-root")" \
  --private-key "$AGENT_PRIVATE_KEY" --rpc-url "$ZG_RPC" --legacy >/dev/null
[ "$(cast call "$LOG" "lastDay(bytes32)(uint32)" "$NODE" --rpc-url "$ZG_RPC")" == $((LAST + 1)) ] && pass "logDay recorded on 0G" || fail "logDay"

if [ "${SKIP_BASE:-}" == 1 ]; then echo "== Base feed skipped (SKIP_BASE=1)"; exit 0; fi
echo "== Base FamiliarFeeder (\$1 USDC -> W0G via Uniswap V3 -> feed)"
FEEDER=$(addr 8453 FamiliarFeeder)
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; W0G=0x23cd099eB438CcA50349EE2BC809196b1ae00861
ROUTER=0x2626664c2603336E57B271c5C0b26F421741e481; QUOTER=0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
if [ "${LOCAL_REHEARSAL:-}" == 1 ]; then
  POOL=0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e
  cast rpc anvil_impersonateAccount $POOL --rpc-url "$BASE_RPC" >/dev/null
  cast rpc anvil_setBalance $POOL 0xDE0B6B3A7640000 --rpc-url "$BASE_RPC" >/dev/null
  cast send $USDC "transfer(address,uint256)" "$OP" 5000000 --from $POOL --unlocked --rpc-url "$BASE_RPC" >/dev/null
fi
OUT=$(cast call $QUOTER "quoteExactInputSingle((address,address,uint256,uint24,uint160))(uint256,uint160,uint32,uint256)" "($USDC,$W0G,1000000,3000,0)" --rpc-url "$BASE_RPC" | head -1 | cut -d' ' -f1)
MIN=$(echo "$OUT * 99 / 100" | bc)
PRICE=$(cast call "$FEEDER" "pricePerVisit()(uint256)" --rpc-url "$BASE_RPC" | cut -d' ' -f1)
echo "  quote: \$1 -> $(cast from-wei "$OUT") W0G, pricePerVisit $(cast from-wei "$PRICE") W0G"
cast send $USDC "approve(address,uint256)" $ROUTER 1000000 --private-key "$PRIVATE_KEY" --rpc-url "$BASE_RPC" >/dev/null
cast send $ROUTER "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" "($USDC,$W0G,3000,$OP,1000000,$MIN,0)" --private-key "$PRIVATE_KEY" --rpc-url "$BASE_RPC" >/dev/null
cast send $W0G "approve(address,uint256)" "$FEEDER" "$MIN" --private-key "$PRIVATE_KEY" --rpc-url "$BASE_RPC" >/dev/null
TX=$(cast send "$FEEDER" "feed(bytes32,uint256)" "$NODE" "$MIN" --private-key "$PRIVATE_KEY" --rpc-url "$BASE_RPC" --json | jq -r .transactionHash)
FED=$(cast receipt "$TX" --json --rpc-url "$BASE_RPC" | jq -r --arg f "$(lc "$FEEDER")" '.logs[] | select((.address|ascii_downcase)==$f) | .topics[2]')
[ "$FED" == "$NODE" ] && pass "Fed event tied to $NAME (tx $TX)" || fail "Fed node $FED"
