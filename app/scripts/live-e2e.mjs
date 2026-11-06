#!/usr/bin/env node
// Live end-to-end check against a running Familiar server. SPENDS REAL MONEY:
// ~$0.04 of 0G inference per visit, Sepolia/0G gas from the agent, and FEED_USD of USDC on Base.
//
//   BASE_URL=http://localhost:3000 NAME=pixel AUDIO=voice.m4a \
//   FEEDER_PRIVATE_KEY=0x… (a Base wallet holding USDC + a little ETH) node scripts/live-e2e.mjs
//
// Flow: SIWE sign-in (fresh owner wallet) → hatch with a voice note → wait for ENS records and
// the 0G day log → feed $FEED_USD through the Uniswap API (EIP-5792 calls, sent in order from the
// feeder EOA) → confirm the Fed event → visit using the feed credit → verify ENS day = 2.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const NAME = process.env.NAME;
const AUDIO = process.env.AUDIO;
const AUDIO2 = process.env.AUDIO2 ?? AUDIO;
const FEED_USD = Number(process.env.FEED_USD ?? 1);
const BASE_RPC = process.env.BASE_RPC ?? "https://base-rpc.publicnode.com";
if (!NAME || !AUDIO || !process.env.FEEDER_PRIVATE_KEY) {
  console.error("Set NAME, AUDIO and FEEDER_PRIVATE_KEY");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s, extra = "") => console.log(`\n▸ ${s} ${extra}`);

async function api(path, { method = "GET", json, form, cookie } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(json && { "content-type": "application/json" }), ...(cookie && { cookie }) },
    body: form ?? (json ? JSON.stringify(json) : undefined),
  });
  const body = await res.json();
  if (!res.ok && res.status !== 202) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(body.error ?? body)}`);
  return { status: res.status, body, res };
}

async function signIn(account) {
  const { body } = await api("/api/auth/nonce", { method: "POST", json: { address: account.address } });
  const signature = await account.signMessage({ message: body.message });
  const v = await api("/api/auth/verify", { method: "POST", json: { message: body.message, signature } });
  return v.res.headers.get("set-cookie").split(";")[0];
}

function voice(path) {
  const type = path.endsWith(".m4a") || path.endsWith(".mp4") ? "audio/mp4" : path.endsWith(".wav") ? "audio/wav" : "audio/webm";
  const f = new FormData();
  f.set("audio", new File([readFileSync(path)], basename(path), { type }));
  return f;
}

async function waitForChain(cookie, visitId) {
  for (let i = 0; i < 90; i++) {
    const { body } = await api(`/api/visits/${visitId}`, { cookie });
    if (body.visit.status === "complete") return body.visit;
    if (i % 5 === 0) console.log(`  … ${body.visit.status}${body.visit.chain.lastError ? ` (${body.visit.chain.lastError})` : ""}`);
    await sleep(4000);
  }
  throw new Error("visit did not finalize in time");
}

const printVisit = (v) => {
  console.log(`  day ${v.day} · mood ${v.mood} · "${v.reply}"`);
  console.log(`  portrait ${v.imageUrl}${v.replyAudioUrl ? `\n  voice    ${v.replyAudioUrl}` : ""}`);
  for (const r of v.receipts) console.log(`  receipt  ${r.step.padEnd(10)} ${r.model.padEnd(30)} ${r.requestId}  ${r.latencyMs}ms  ${r.costUsd != null ? `$${r.costUsd.toFixed(6)}` : (r.cost ?? "")}  tee=${r.teeVerified}`);
};

const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY ?? generatePrivateKey());
const feeder = privateKeyToAccount(process.env.FEEDER_PRIVATE_KEY);
const basePc = createPublicClient({ chain: base, transport: http(BASE_RPC) });
const baseWallet = createWalletClient({ account: feeder, chain: base, transport: http(BASE_RPC) });

// ONLY_VISIT=1 resumes at the nightly visit (e.g. after the one-visit-per-day limit was hit).
const onlyVisit = process.env.ONLY_VISIT === "1";
let ownerCookie;
let t;
if (!onlyVisit) {
step("health");
console.log(JSON.stringify((await api("/api/health")).body.checks));

step("sign in (owner)", owner.address);
ownerCookie = await signIn(owner);

step(`hatch ${NAME}.familiar.eth`);
t = Date.now();
const hatch = await api("/api/hatch", { method: "POST", form: (() => { const f = voice(AUDIO); f.set("name", NAME); return f; })(), cookie: ownerCookie });
console.log(`  ${((Date.now() - t) / 1000).toFixed(1)}s · hatch tx ${hatch.body.hatchTx}`);
printVisit(hatch.body.visit);

step("wait for onchain writes (renew · ENS records · 0G day log)");
const v1 = await waitForChain(ownerCookie, hatch.body.visit.id);
console.log(`  renew   ${v1.chain.links.renew}\n  records ${v1.chain.links.records}\n  log     ${v1.chain.links.log}`);
const ens1 = (await api(`/api/ens/${NAME}`)).body.ens;
console.log(`  ENS: owner ${ens1.owner} · resolver ${ens1.resolver} · ${JSON.stringify(ens1.records)}`);

step("agent overreach (live revert)");
for (const a of (await api(`/api/ens/${NAME}/agent-overreach`, { method: "POST" })).body.attempts) console.log(`  ${a.call} → ${a.reverted ? `REVERT ${a.error.split("(")[0]}` : "ok"}`);

step(`feed $${FEED_USD} via the Uniswap API`, `(payer ${feeder.address})`);
const feederCookie = await signIn(feeder);
const quote = (await api("/api/feed/quote", { method: "POST", json: { name: NAME, usd: FEED_USD }, cookie: feederCookie })).body;
console.log(`  quote ${quote.uniswapRequestId}: $${quote.amountInUsdc} → ${quote.expectedW0g} W0G (min ${quote.minimumW0g}) · ${quote.visits} visit(s) · ${quote.route}`);
const build = (await api("/api/feed/build", { method: "POST", json: { quoteId: quote.quoteId, mode: "eip5792" }, cookie: feederCookie })).body;
console.log(`  /swap_5792 ${build.uniswapRequestId}: ${build.walletSendCalls.calls.length} calls`);
let lastHash;
for (const [i, c] of build.walletSendCalls.calls.entries()) {
  lastHash = await baseWallet.sendTransaction({ to: c.to, data: c.data, value: BigInt(c.value) });
  const r = await basePc.waitForTransactionReceipt({ hash: lastHash });
  console.log(`  call ${i + 1} ${c.to} → ${r.status} https://basescan.org/tx/${lastHash}`);
  if (r.status !== "success") throw new Error("batch call reverted");
}
let confirm;
for (let i = 0; i < 30; i++) {
  confirm = (await api("/api/feed/confirm", { method: "POST", json: { txHash: lastHash } })).body;
  if (confirm.status === "confirmed") break;
  await sleep(2000);
}
console.log(`  confirmed: ${JSON.stringify(confirm.credited)} · feedCredits ${confirm.feedCredits}`);
} else {
  ownerCookie = await signIn(owner);
}

step("nightly visit, paid by the feed");
t = Date.now();
const visit = await api(`/api/familiar/${NAME}/visit`, { method: "POST", form: voice(AUDIO2), cookie: ownerCookie });
console.log(`  ${((Date.now() - t) / 1000).toFixed(1)}s · paidBy ${visit.body.visit.paidBy}`);
printVisit(visit.body.visit);
const v2 = await waitForChain(ownerCookie, visit.body.visit.id);
const ens2 = (await api(`/api/ens/${NAME}`)).body.ens;
console.log(`  log ${v2.chain.links.log}\n  ENS records now ${JSON.stringify(ens2.records)} · expires ${ens2.expiresAt}`);
console.log(`\n✓ live end-to-end complete (owner ${owner.address})`);
