import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import {
  type Address,
  type Hex,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { mockUniswap, mockZeroG } from "../helpers/mocks";

// `after()` runs work post-response in Next; here we capture it so each step can await it.
const pendingAfter: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void pendingAfter.push(Promise.resolve().then(fn)),
  connection: async () => undefined,
}));
const flushAfter = async () => {
  while (pendingAfter.length) await pendingAfter.shift();
};

const rpcs = inject("rpcs");
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const W0G = "0x23cd099eB438CcA50349EE2BC809196b1ae00861" as const;
const POOL = "0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e" as const;

const userKey = generatePrivateKey();
const user = privateKeyToAccount(userKey);
const iaiUser = privateKeyToAccount(generatePrivateKey());
const label = `itest${Date.now().toString(36)}`;
const iaiLabel = `${label}z`;

const basePc = createPublicClient({ chain: base, transport: http(rpcs.BASE_RPC) }) as PublicClient;
const sepPc = createPublicClient({ chain: sepolia, transport: http(rpcs.SEPOLIA_RPC) }) as PublicClient;
const rpc = (url: string, method: string, params: unknown[] = []) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());

let zg: Awaited<ReturnType<typeof mockZeroG>>;
let uni: Awaited<ReturnType<typeof mockUniswap>>;
let R: Record<string, Record<string, (req: Request, ctx: { params: Promise<Record<string, unknown>> }) => Promise<Response>>>;
let cookie = "";
let iaiCookie = "";

async function call(
  mod: string,
  method: string,
  opts: { json?: unknown; form?: FormData; params?: Record<string, unknown>; cookie?: string; path?: string } = {},
) {
  const headers: Record<string, string> = { "x-forwarded-for": "10.0.0.1" };
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie ?? cookie) headers.cookie = opts.cookie ?? cookie;
  const req = new Request(`http://localhost:3000${opts.path ?? "/api/x"}`, {
    method,
    headers,
    body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
  });
  const res = await R[mod]![method]!(req, { params: Promise.resolve(opts.params ?? {}) });
  const body = await res.json();
  return { status: res.status, body, res };
}

const voice = () => {
  const f = new FormData();
  f.set("audio", new File([new Uint8Array(2048).fill(7)], "voice.webm", { type: "audio/webm" }));
  return f;
};

/** Confirm a feed the way the frontend does: poll while the backend says 202 "pending". */
async function confirmFinal(txHash: Hex) {
  for (let i = 0; ; i++) {
    const r = await call("confirm", "POST", { json: { txHash } });
    if (r.status !== 202 || i > 20) return r;
    await new Promise((res) => setTimeout(res, 500));
  }
}

/** Plays the wallet: sends each call in order on the Base fork (atomic batch emulation). */
async function sendCalls(calls: { to: Address; data: Hex; value: Hex }[]) {
  const w = createWalletClient({ account: user, chain: base, transport: http(rpcs.BASE_RPC) });
  let last: Hex = "0x";
  for (const c of calls) {
    last = await w.sendTransaction({ to: c.to, data: c.data, value: BigInt(c.value) });
    const r = await basePc.waitForTransactionReceipt({ hash: last, pollingInterval: 200 });
    expect(r.status).toBe("success");
  }
  await rpc(rpcs.BASE_RPC, "evm_mine"); // 2 confirmations
  return last;
}

beforeAll(async () => {
  zg = await mockZeroG({ privyWallet: () => iaiUser.address });
  uni = await mockUniswap(basePc);
  Object.assign(process.env, {
    ...rpcs,
    AGENT_PRIVATE_KEY: inject("agentKey"),
    ZG_ROUTER_URL: zg.url,
    UNISWAP_API_URL: uni.url,
    CRON_SECRET: "cron-secret-for-tests-123",
    DEMO_LABELS: "",
    // Pin event spotlights to a quiet day so reward amounts don't depend on the calendar
    // (the round-3 journey switches to an event day explicitly).
    EVENTS_TODAY: "2026-10-01",
  });
  const { resetEnvForTests } = await import("@/server/env");
  resetEnvForTests();

  // Fund: agent gas on Sepolia + 0G forks; user ETH + 5 USDC on the Base fork (from the pool).
  const agentAddr = privateKeyToAccount(inject("agentKey") as Hex).address;
  await rpc(rpcs.SEPOLIA_RPC, "anvil_setBalance", [agentAddr, "0x56BC75E2D63100000"]);
  await rpc(rpcs.ZG_RPC, "anvil_setBalance", [agentAddr, "0x56BC75E2D63100000"]);
  await rpc(rpcs.BASE_RPC, "anvil_setBalance", [user.address, "0xDE0B6B3A7640000"]);
  await rpc(rpcs.BASE_RPC, "anvil_impersonateAccount", [POOL]);
  await rpc(rpcs.BASE_RPC, "anvil_setBalance", [POOL, "0xDE0B6B3A7640000"]);
  const poolWallet = createWalletClient({ account: POOL, chain: base, transport: http(rpcs.BASE_RPC) });
  await poolWallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [user.address, 5_000_000n] });

  const load = (p: string) => import(`@/app/api/${p}/route`);
  R = {
    health: await load("health"),
    nonce: await load("auth/nonce"),
    verify: await load("auth/verify"),
    iai: await load("auth/iai"),
    me: await load("me"),
    names: await load("names/[name]"),
    hatch: await load("hatch"),
    familiar: await load("familiar/[name]"),
    history: await load("familiar/[name]/history"),
    visit: await load("familiar/[name]/visit"),
    wake: await load("familiar/[name]/wake"),
    visits: await load("visits/[id]"),
    credits: await load("credits"),
    quote: await load("feed/quote"),
    build: await load("feed/build"),
    confirm: await load("feed/confirm"),
    ens: await load("ens/[name]"),
    overreach: await load("ens/[name]/agent-overreach"),
    cron: await load("cron/reconcile"),
    shop: await load("shop"),
    buy: await load("shop/buy"),
    equip: await load("familiar/[name]/equip"),
    spin: await load("familiar/[name]/spin"),
    quests: await load("quests"),
    claim: await load("quests/claim"),
    care: await load("familiar/[name]/care"),
    spot: await load("familiar/[name]/spot"),
    gift: await load("familiar/[name]/gift"),
    explore: await load("explore"),
    dex: await load("dex"),
    events: await load("events"),
    keys: await load("keys"),
    key: await load("keys/[id]"),
    mcp: await load("mcp"),
    mcpKey: await load("mcp/[key]"),
  };
});

afterAll(() => {
  zg?.close();
  uni?.close();
});

describe("health", () => {
  it("reports every dependency up and the deployed contracts", async () => {
    const { status, body } = await call("health", "GET");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.contracts.registry).toBe("0xe70FB7f0921E720b6e78847e2Aa7970809c63833");
    expect(JSON.stringify(body)).not.toMatch(/sk-test|uni-test|PRIVATE/);
  });
});

describe("auth (SIWE)", () => {
  it("rejects protected routes without a session", async () => {
    const { status, body } = await call("me", "GET", { cookie: "none=1" });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("signs in with a wallet signature and sets an HttpOnly cookie", async () => {
    const n = await call("nonce", "POST", { json: { address: user.address }, cookie: "none=1" });
    expect(n.status).toBe(200);
    const signature = await user.signMessage({ message: n.body.message });
    const v = await call("verify", "POST", { json: { message: n.body.message, signature }, cookie: "none=1" });
    expect(v.status).toBe(200);
    expect(v.body.session.address).toBe(user.address);
    const setCookie = v.res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/);
    cookie = setCookie.split(";")[0]!;
  });

  it("refuses a replayed nonce", async () => {
    const n = await call("nonce", "POST", { json: { address: user.address }, cookie: "none=1" });
    const signature = await user.signMessage({ message: n.body.message });
    expect((await call("verify", "POST", { json: { message: n.body.message, signature }, cookie: "none=1" })).status).toBe(200);
    const again = await call("verify", "POST", { json: { message: n.body.message, signature }, cookie: "none=1" });
    expect(again.status).toBe(401);
  });

  it("refuses a signature from another key", async () => {
    const n = await call("nonce", "POST", { json: { address: user.address }, cookie: "none=1" });
    const signature = await iaiUser.signMessage({ message: n.body.message });
    expect((await call("verify", "POST", { json: { message: n.body.message, signature }, cookie: "none=1" })).status).toBe(401);
  });
});

let hatchVisitId = "";

describe("journey A: hatch", () => {
  it("name is available and validated", async () => {
    expect((await call("names", "GET", { params: { name: label } })).body).toEqual({ label, available: true });
    expect((await call("names", "GET", { params: { name: "-bad" } })).status).toBe(400);
  });

  it("hatches <name>.familiar.eth and returns the first portrait with 0G receipts", async () => {
    const form = voice();
    form.set("name", label);
    form.set("species", "fox");
    form.set("color", "ember orange");
    const { status, body } = await call("hatch", "POST", { form });
    expect(status).toBe(201);
    expect(body.familiar).toMatchObject({ label, name: `${label}.familiar.eth`, owner: user.address.toLowerCase(), day: 1, streak: 1, stage: "hatchling", mood: "proud", dormant: false });
    expect(body.visit).toMatchObject({ kind: "hatch", paidBy: "free", status: "chain_pending", day: 1 });
    expect(body.visit.receipts.map((r: { step: string }) => r.step)).toEqual(["transcribe", "think", "draw", "speak"]);
    expect(body.visit.receipts[0]).toMatchObject({ costCurrency: "usd", costUsd: 0.00091 });
    expect(body.visit.replyAudioUrl).toMatch(new RegExp(`/api/media/voice/${label}/day-1`));
    expect(body.visit.receipts.every((r: { requestId: string }) => r.requestId.startsWith("0g-req-"))).toBe(true);
    expect(body.visit.imageUrl).toMatch(new RegExp(`/api/media/portraits/${label}/day-1`));
    expect(body.hatchTx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toMatch(/demo broke twice/); // transcript never returned or stored
    hatchVisitId = body.visit.id;
    // Every 0G call carried our visit id for correlation and the team key.
    expect(zg.calls.filter((c) => c.path !== "/auth/privy").every((c) => c.auth === "Bearer sk-test")).toBe(true);
    expect(zg.calls.at(-1)!.headers["x-client-request-id"]).toBe(body.visit.id);
  });

  it("finalizes onchain after the response: renew, ENS records, 0G day log", async () => {
    await flushAfter();
    const { body } = await call("visits", "GET", { params: { id: hatchVisitId } });
    expect(body.visit.status).toBe("complete");
    expect(body.visit.chain.renewTx).toMatch(/^0x/);
    expect(body.visit.chain.recordsTx).toMatch(/^0x/);
    expect(body.visit.chain.logTx).toMatch(/^0x/);
    expect(body.visit.chain.links.log).toMatch(/^https:\/\/chainscan\.0g\.ai\/tx\//);
  });

  it("resolves live through the ENSv2 UniversalResolver with the agent's records", async () => {
    const { body } = await call("ens", "GET", { params: { name: label } });
    expect(body.ens.owner).toBe(user.address);
    expect(body.ens.resolver).toMatch(/^0x/);
    expect(body.ens.records).toMatchObject({ mood: "proud", day: "1" });
    expect(body.ens.records.avatar).toContain(`/portraits/${label}/day-1`);
    expect(body.ens.dormant).toBe(false);
  });

  it("the agent's overreach reverts live; its scoped key succeeds", async () => {
    const { body } = await call("overreach", "POST", { params: { name: label } });
    const [setAddr, setUrl, setMood] = body.attempts;
    expect(setAddr.reverted).toBe(true);
    expect(setAddr.error).toMatch(/^EACUnauthorizedAccountRoles/);
    expect(setUrl.reverted).toBe(true);
    expect(setMood.reverted).toBe(false);
  });

  it("the 0G day log commits to the receipts drawer", async () => {
    const { requestIdsHash, lastLoggedDay } = await import("@/server/chain/dayLog");
    const { body } = await call("visits", "GET", { params: { id: hatchVisitId } });
    expect(body.visit.requestIdsHash).toBe(requestIdsHash(body.visit.receipts.map((r: { requestId: string }) => r.requestId)));
    expect(await lastLoggedDay(body.familiar.node)).toBe(1);
  });

  it("one Familiar per human, names are unique", async () => {
    const form = voice();
    form.set("name", `${label}b`);
    const { status, body } = await call("hatch", "POST", { form });
    expect(status).toBe(409);
    expect(body.error.code).toBe("ALREADY_HAS_FAMILIAR");
  });
});

describe("game: sparks, shop, accessories, lantern, quests", () => {
  it("hatching granted the welcome Sparks and XP", async () => {
    const { body } = await call("familiar", "GET", { params: { name: label } });
    expect(body.familiar.sparks).toBe(60); // 50 welcome + 10 for the first night
    expect(body.familiar.level).toMatchObject({ level: 1, xp: 40 });
  });

  it("buys an accessory atomically, once, and refuses what you can't afford", async () => {
    process.env.FESTIVAL = "diwali";
    (await import("@/server/env")).resetEnvForTests();
    const shop = await call("shop", "GET");
    expect(shop.body.festival.id).toBe("diwali");
    expect(shop.body.sparks).toBe(60);
    const bought = await call("buy", "POST", { json: { itemId: "diya" } });
    expect(bought.status).toBe(200);
    expect(bought.body.sparks).toBe(20);
    expect((await call("buy", "POST", { json: { itemId: "diya" } })).status).toBe(409);
    const tooMuch = await call("buy", "POST", { json: { itemId: "rangoli" } });
    expect(tooMuch.status).toBe(402);
    expect((await call("shop", "GET")).body.items.find((i: { id: string }) => i.id === "diya").owned).toBe(true);
  });

  it("equips only owned items in the right slot", async () => {
    expect((await call("equip", "POST", { params: { name: label }, json: { slot: "head", itemId: "diya" } })).status).toBe(400);
    expect((await call("equip", "POST", { params: { name: label }, json: { slot: "neck", itemId: "garland" } })).status).toBe(403); // not owned
    const ok = await call("equip", "POST", { params: { name: label }, json: { slot: "hand", itemId: "diya" } });
    expect(ok.body.equipped).toEqual({ hand: "diya" });
  });

  it("the daily lantern spins once per day", async () => {
    const first = await call("spin", "POST", { params: { name: label } });
    expect(first.status).toBe(200);
    expect(first.body.sparks).toBeGreaterThanOrEqual(10);
    expect((await call("spin", "POST", { params: { name: label } })).status).toBe(409);
  });

  it("quests track progress and pay once", async () => {
    const q = await call("quests", "GET");
    const daily = q.body.quests.find((x: { id: string }) => x.id === "daily-visit");
    expect(daily).toMatchObject({ claimable: true, claimed: false });
    expect(q.body.quests.find((x: { id: string }) => x.id === "diwali-light").claimable).toBe(true); // diya is worn
    const before = (await call("familiar", "GET", { params: { name: label } })).body.familiar.sparks;
    const claim = await call("claim", "POST", { json: { questId: "daily-visit" } });
    expect(claim.body.sparks).toBe(before + 10);
    expect((await call("claim", "POST", { json: { questId: "daily-visit" } })).status).toBe(409);
    expect((await call("claim", "POST", { json: { questId: "weekly-streak" } })).status).toBe(400); // not finished
  });
});

describe("journey B: nightly visit, paid with a Uniswap feed", () => {
  it("one visit per UTC day", async () => {
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label } });
    expect(status).toBe(409);
    expect(body.error.code).toBe("ALREADY_VISITED_TODAY");
  });

  it("a hungry Familiar asks to be fed (402)", async () => {
    process.env.VISITS_PER_DAY = "10"; // lift the daily limit for the rest of the suite
    (await import("@/server/env")).resetEnvForTests();
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label } });
    expect(status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
  });

  let quoteId = "";
  it("quotes $1 USDC → W0G sized to whole visits", async () => {
    const { status, body } = await call("quote", "POST", { json: { name: label, usd: 1 } });
    expect(status).toBe(200);
    expect(body.visits).toBe(1);
    expect(Number(body.minimumW0g)).toBeGreaterThan(Number(body.pricePerVisitW0g));
    expect(body.feedAmountRaw).toBe(BigInt(Math.floor(Number(body.minimumW0g) * 1e18)).toString().slice(0, 6) + body.feedAmountRaw.slice(6));
    const q = uni.calls.find((c) => c.path === "/quote")!;
    expect(q.auth).toBe("uni-test");
    expect(q.headers["x-universal-router-version"]).toBe("2.1.2");
    quoteId = body.quoteId;
  });

  let feedTx: Hex;
  it("builds one EIP-5792 batch: Uniswap calls + approve + feed, and it executes on Base", async () => {
    const { status, body } = await call("build", "POST", { json: { quoteId, mode: "eip5792" } });
    expect(status).toBe(200);
    expect(body.mode).toBe("eip5792");
    const ws = body.walletSendCalls;
    expect(ws).toMatchObject({ version: "2.0.0", chainId: "0x2105", from: user.address, atomicRequired: true });
    expect(ws.calls).toHaveLength(4);
    expect(ws.calls[2].to).toBe(W0G);
    expect(ws.calls[3].to).toBe("0xe70FB7f0921E720b6e78847e2Aa7970809c63833");
    feedTx = await sendCalls(ws.calls);
    // a quote is single-use
    expect((await call("build", "POST", { json: { quoteId, mode: "eip5792" } })).status).toBe(409);
  });

  it("confirms the Fed event from chain and credits exactly one visit, idempotently", async () => {
    const first = await confirmFinal(feedTx);
    expect(first.status).toBe(200);
    expect(first.body.credited).toEqual([expect.objectContaining({ label, visits: 1 })]);
    expect(first.body.feedCredits).toBe(1);
    const again = await confirmFinal(feedTx);
    expect(again.body.credited).toEqual([]);
    expect(again.body.feedCredits).toBe(1);
  });

  it("rejects transactions without a Fed event from our Feeder", async () => {
    const w = createWalletClient({ account: user, chain: base, transport: http(rpcs.BASE_RPC) });
    const tx = await w.sendTransaction({ to: user.address, value: 1n });
    expect((await basePc.waitForTransactionReceipt({ hash: tx, pollingInterval: 200 })).status).toBe("success");
    await rpc(rpcs.BASE_RPC, "evm_mine");
    const { status, body } = await confirmFinal(tx);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/No Fed event/);
  });

  it("refuses a spoofed Fed event emitted by a look-alike contract", async () => {
    // Same bytecode as FamiliarFeeder, so its Fed event is byte-identical, but a different address.
    const { familiarFeederAbi } = await import("@/server/chain/abis.generated");
    const art = (await import("../../../contracts/out/FamiliarFeeder.sol/FamiliarFeeder.json")).default as { bytecode: { object: Hex } };
    const w = createWalletClient({ account: user, chain: base, transport: http(rpcs.BASE_RPC) });
    const fake = (await basePc.waitForTransactionReceipt({ hash: await w.deployContract({ abi: familiarFeederAbi, bytecode: art.bytecode.object, args: [W0G, 1n] }), pollingInterval: 200 })).contractAddress!;
    const leftover = await basePc.readContract({ address: W0G, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
    expect(leftover).toBeGreaterThan(0n); // swap surplus above the fed minimum stays with the user
    await basePc.waitForTransactionReceipt({ hash: await w.writeContract({ address: W0G, abi: erc20Abi, functionName: "approve", args: [fake, 1n] }), pollingInterval: 200 });
    const { nodeOf } = await import("@/server/chain/ens");
    const tx = await w.writeContract({ address: fake, abi: familiarFeederAbi, functionName: "feed", args: [nodeOf(label), 1n] });
    expect((await basePc.waitForTransactionReceipt({ hash: tx, pollingInterval: 200 })).status).toBe("success");
    await rpc(rpcs.BASE_RPC, "evm_mine");
    const { status, body } = await confirmFinal(tx);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/No Fed event from FamiliarFeeder/);
    expect((await call("familiar", "GET", { params: { name: label } })).body.familiar.feedCredits).toBe(1);
  });

  it("visits using the feed credit; the day counter advances everywhere", async () => {
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label } });
    expect(status).toBe(200);
    expect(body.visit).toMatchObject({ day: 2, paidBy: "feed", kind: "visit" });
    // The equipped diya was painted into tonight's portrait, and the visit paid Sparks.
    const draw = zg.calls.filter((c) => c.path === "/images/generations").at(-1)!;
    expect((draw.body as { prompt: string }).prompt).toContain("diya");
    expect(body.reward.sparks).toBeGreaterThanOrEqual(10);
    expect(body.familiar.feedCredits).toBe(0);
    await flushAfter();
    const ens = await call("ens", "GET", { params: { name: label } });
    expect(ens.body.ens.records.day).toBe("2");
    const { lastLoggedDay } = await import("@/server/chain/dayLog");
    expect(await lastLoggedDay(body.familiar.node)).toBe(2);
  });

  it("sequential fallback (no EIP-5792): ordered transactions that also feed", async () => {
    const q = await call("quote", "POST", { json: { name: label, usd: 1 } });
    const { body } = await call("build", "POST", { json: { quoteId: q.body.quoteId, mode: "sequential" } });
    expect(body.mode).toBe("sequential");
    expect(body.transactions.map((t: { label: string }) => t.label)).toEqual([
      "Approve USDC for Permit2",
      "Swap USDC → W0G (Uniswap)",
      "Approve W0G for FamiliarFeeder",
      `Feed ${label}`,
    ]);
    const tx = await sendCalls(body.transactions);
    expect((await confirmFinal(tx)).body.feedCredits).toBe(1);
  });
});

describe("journey C: dormancy and wake-up", () => {
  it("after 7 days without a visit the name stops resolving", async () => {
    await rpc(rpcs.SEPOLIA_RPC, "evm_increaseTime", [8 * 86400]);
    await rpc(rpcs.SEPOLIA_RPC, "evm_mine");
    const { body } = await call("ens", "GET", { params: { name: label } });
    expect(body.ens.dormant).toBe(true);
    expect(body.ens.resolver).toBeNull();
    expect(body.ens.owner).toBeNull();
  });

  it("wake up costs one visit, re-hatches for the same owner, and keeps the day count", async () => {
    const before = await call("ens", "GET", { params: { name: label } });
    const { status, body } = await call("wake", "POST", { params: { name: label } });
    expect(status).toBe(200);
    expect(body.visit).toMatchObject({ kind: "wake", day: 3, paidBy: "feed" });
    expect(body.familiar.generation).toBe(2);
    expect(body.familiar.feedCredits).toBe(0);
    await flushAfter();
    const after = await call("ens", "GET", { params: { name: label } });
    expect(after.body.ens.dormant).toBe(false);
    expect(after.body.ens.owner).toBe(user.address);
    expect(after.body.ens.resolver).not.toBe(before.body.ens.resolver);
    expect(after.body.ens.records).toMatchObject({ day: "3", mood: "proud" });
  });

  it("waking an awake Familiar is refused", async () => {
    const { status, body } = await call("wake", "POST", { params: { name: label } });
    expect(status).toBe(409);
    expect(body.error.code).toBe("NOT_DORMANT");
  });
});

describe("history and privacy", () => {
  it("owner sees replies + receipts + tx links; others see the gallery only", async () => {
    const mine = await call("history", "GET", { params: { name: label } });
    expect(mine.body.owner).toBe(true);
    expect(mine.body.visits.map((v: { day: number }) => v.day)).toEqual([3, 2, 1]);
    expect(mine.body.visits[0].reply).toBeTruthy();
    expect(mine.body.visits[0].receipts.length).toBeGreaterThan(0);
    const theirs = await call("history", "GET", { params: { name: label }, cookie: "none=1" });
    expect(theirs.body.owner).toBe(false);
    expect(theirs.body.visits[0]).not.toHaveProperty("reply");
    expect(theirs.body.visits[0].imageUrl).toBeTruthy();
  });

  it("public familiar state carries no memory", async () => {
    const { body } = await call("familiar", "GET", { params: { name: label }, cookie: "none=1" });
    expect(body.familiar.label).toBe(label);
    expect(JSON.stringify(body)).not.toMatch(/memory|ciphertext/i);
  });

  it("only the owner can visit", async () => {
    // sign in as the iAI user via a plain wallet signature to get a different session
    const other = privateKeyToAccount(generatePrivateKey());
    const n = await call("nonce", "POST", { json: { address: other.address }, cookie: "none=1" });
    const v = await call("verify", "POST", { json: { message: n.body.message, signature: await other.signMessage({ message: n.body.message }) }, cookie: "none=1" });
    const otherCookie = v.res.headers.get("set-cookie")!.split(";")[0]!;
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label }, cookie: otherCookie });
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("iAI: sign in with 0G and spend the user's own credits", () => {
  it("exchanges the Privy token with 0G and opens an iAI session", async () => {
    const { status, body, res } = await call("iai", "POST", { json: { privyToken: "privy-access-token-from-0g-app" }, cookie: "none=1" });
    expect(status).toBe(200);
    expect(body.session).toEqual({ address: iaiUser.address, method: "iai" });
    iaiCookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect(iaiCookie).not.toContain("zg-user-session-jwt");
  });

  it("shows the live 0G credit balance", async () => {
    const { body } = await call("credits", "GET", { cookie: iaiCookie });
    expect(body.method).toBe("iai");
    expect(body.iai).toMatchObject({ credit: "1271000", currency: "usd" });
    expect(zg.calls.at(-1)).toMatchObject({ path: "/account/balance", auth: "Bearer zg-user-session-jwt" });
  });

  it("hatching with an iAI session bills the user's 0G account, not the team key", async () => {
    const mark = zg.calls.length;
    const form = voice();
    form.set("name", iaiLabel);
    const { status, body } = await call("hatch", "POST", { form, cookie: iaiCookie });
    expect(status).toBe(201);
    expect(body.visit.paidBy).toBe("iai");
    const inference = zg.calls.slice(mark);
    expect(inference.length).toBe(4); // transcribe, think, draw, speak
    expect(inference.every((c) => c.auth === "Bearer zg-user-session-jwt")).toBe(true);
    await flushAfter();
  });
});

describe("round 3: text visits, care, explore, dex, gifts, events, connectors", () => {
  const thirdLabel = `${label}t`;
  let thirdCookie = "";
  const newWallet = async () => {
    const who = privateKeyToAccount(generatePrivateKey());
    const n = await call("nonce", "POST", { json: { address: who.address }, cookie: "none=1" });
    const v = await call("verify", "POST", { json: { message: n.body.message, signature: await who.signMessage({ message: n.body.message }) }, cookie: "none=1" });
    return { who, cookie: v.res.headers.get("set-cookie")!.split(";")[0]! };
  };
  const setEnv = async (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    (await import("@/server/env")).resetEnvForTests();
  };
  const familiar = async (name: string) => (await call("familiar", "GET", { params: { name }, cookie: "none=1" })).body.familiar;

  beforeAll(() => setEnv({ EVENTS_TODAY: "2026-11-06" }));
  afterAll(() => setEnv({ EVENTS_TODAY: "2026-10-01", DEMO_LABELS: "" }));

  it("lists event spotlights, live first", async () => {
    const { status, body } = await call("events", "GET", { cookie: "none=1" });
    expect(status).toBe(200);
    expect(body.events.map((e: { id: string; status: string }) => [e.id, e.status])).toEqual([
      ["devcon-8", "live"],
      ["ethglobal-mumbai", "live"],
      ["diwali-2026", "live"],
      ["lantern-night", "upcoming"],
    ]);
  });

  it("hatches with typed text instead of a voice note (Whisper skipped)", async () => {
    const species = (await familiar(iaiLabel)).species;
    const third = await newWallet();
    thirdCookie = third.cookie;
    const mark = zg.calls.length;
    const form = new FormData();
    form.set("name", thirdLabel);
    form.set("species", species);
    form.set("text", "I love the sea, my little sister, and terrible puns.");
    const { status, body } = await call("hatch", "POST", { form, cookie: thirdCookie });
    expect(status).toBe(201);
    expect(body.familiar).toMatchObject({ label: thirdLabel, species, day: 1 });
    expect(body.visit.receipts.map((r: { step: string }) => r.step)).toEqual(["think", "draw", "speak"]);
    expect(zg.calls.slice(mark).some((c) => c.path === "/audio/transcriptions")).toBe(false);
    const think = zg.calls.slice(mark).find((c) => c.path === "/chat/completions")!;
    expect(JSON.stringify(think.body)).toContain("terrible puns");
    expect(body.familiar.care).toMatchObject({ fullness: 100, joy: 100, energy: 100, need: null, ready: { pet: null, snack: null, play: null } });
    await flushAfter();
  });

  it("visits with JSON { text }; ETHGlobal Mumbai doubles the visit Sparks", async () => {
    const mark = zg.calls.length;
    const { status, body } = await call("visit", "POST", { params: { name: iaiLabel }, json: { text: "Judged twelve hackathon demos today." }, cookie: iaiCookie });
    expect(status).toBe(200);
    expect(body.visit).toMatchObject({ kind: "visit", paidBy: "iai" });
    expect(body.visit.receipts.map((r: { step: string }) => r.step)).not.toContain("transcribe");
    expect(zg.calls.slice(mark).some((c) => c.path === "/audio/transcriptions")).toBe(false);
    expect(body.reward.sparks).toBe(20); // 10 for the night × 2
    await flushAfter();
    const both = voice();
    both.set("text", "hello");
    expect((await call("visit", "POST", { params: { name: iaiLabel }, form: both, cookie: iaiCookie })).status).toBe(400);
    expect((await call("visit", "POST", { params: { name: iaiLabel }, json: { text: "   " }, cookie: iaiCookie })).status).toBe(400);
  });

  it("care: pet, snack and play with cooldowns, costs and rewards", async () => {
    const before = await familiar(label);
    const pet = await call("care", "POST", { params: { name: label }, json: { action: "pet" } });
    expect(pet.status).toBe(200);
    expect(pet.body).toMatchObject({ action: "pet", reward: { sparks: 0, xp: 2 } });
    expect(pet.body.familiar.care.ready.pet).toEqual(expect.any(String));
    expect(pet.body.familiar.level.xp).toBe(before.level.xp + 2);
    const again = await call("care", "POST", { params: { name: label }, json: { action: "pet" } });
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe("COOLDOWN");
    expect(Date.parse(again.body.error.details.readyAt)).toBeGreaterThan(Date.now() + 19 * 60_000);
    const snack = await call("care", "POST", { params: { name: label }, json: { action: "snack" } });
    expect(snack.body).toMatchObject({ action: "snack", reward: { sparks: -5, xp: 3 } });
    expect(snack.body.familiar.sparks).toBe(before.sparks - 5);
    expect(snack.body.familiar.care.fullness).toBe(100);
    const play = await call("care", "POST", { params: { name: label }, json: { action: "play" } });
    expect(play.body).toMatchObject({ action: "play", reward: { sparks: 1, xp: 3 } });
    expect(play.body.familiar.sparks).toBe(before.sparks - 4);
    expect((await call("care", "POST", { params: { name: label }, json: { action: "dance" } })).status).toBe(400);
    expect((await call("care", "POST", { params: { name: label }, json: { action: "pet" }, cookie: thirdCookie })).status).toBe(403);
  });

  it("a snack you can't afford is 402 INSUFFICIENT_SPARKS", async () => {
    const { db, schema } = await import("@/server/db/client");
    const { eq } = await import("drizzle-orm");
    const d = await db();
    const [row] = await d.select({ sparks: schema.familiars.sparks }).from(schema.familiars).where(eq(schema.familiars.label, thirdLabel));
    await d.update(schema.familiars).set({ sparks: 4 }).where(eq(schema.familiars.label, thirdLabel));
    const r = await call("care", "POST", { params: { name: thirdLabel }, json: { action: "snack" }, cookie: thirdCookie });
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe("INSUFFICIENT_SPARKS");
    expect((await familiar(thirdLabel)).care.ready.snack).toBeNull(); // the failed snack didn't start a cooldown
    await d.update(schema.familiars).set({ sparks: row!.sparks }).where(eq(schema.familiars.label, thirdLabel));
  });

  it("explore lists awake Familiars with pins; spotted/mine need a session", async () => {
    const mine = await call("explore", "GET");
    expect(mine.status).toBe(200);
    const byLabel = Object.fromEntries(mine.body.familiars.map((x: { label: string }) => [x.label, x]));
    expect(byLabel[label]).toMatchObject({ mine: true, spotted: false, name: `${label}.familiar.eth`, species: "fox", stage: "hatchling" });
    expect(byLabel[iaiLabel]).toMatchObject({ mine: false, spotted: false, giftedToday: false, level: expect.any(Number) });
    expect(mine.body.familiars[0].label).toBe(iaiLabel); // most recently visited first
    for (const x of mine.body.familiars) expect(x.pin.x >= 0.08 && x.pin.x <= 0.92 && x.pin.y >= 0.08 && x.pin.y <= 0.92).toBe(true);
    const anon = await call("explore", "GET", { cookie: "none=1" });
    expect(anon.body.familiars.every((x: { mine: boolean; spotted: boolean }) => !x.mine && !x.spotted)).toBe(true);
  });

  it("spotting pays once per Familiar, with a bonus for a new species", async () => {
    const before = (await familiar(label)).sparks;
    const first = await call("spot", "POST", { params: { name: iaiLabel } });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ spotted: iaiLabel, reward: { sparks: 15, xp: 5 }, newSpecies: true });
    const dup = await call("spot", "POST", { params: { name: iaiLabel } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ALREADY_SPOTTED");
    const sameSpecies = await call("spot", "POST", { params: { name: thirdLabel } });
    expect(sameSpecies.body).toEqual({ spotted: thirdLabel, reward: { sparks: 5, xp: 5 }, newSpecies: false });
    expect((await familiar(label)).sparks).toBe(before + 20);
    expect((await call("spot", "POST", { params: { name: label } })).status).toBe(400);
    expect((await call("spot", "POST", { params: { name: "nobody-here" } })).status).toBe(404);
    expect((await call("spot", "POST", { params: { name: iaiLabel }, cookie: (await newWallet()).cookie })).status).toBe(404); // no Familiar
    const ex = await call("explore", "GET");
    expect(ex.body.familiars.find((x: { label: string }) => x.label === iaiLabel).spotted).toBe(true);
  });

  it("gifts need a sighting, once per day; the recipient gets 5 Sparks", async () => {
    const forbidden = await call("gift", "POST", { params: { name: label }, cookie: thirdCookie });
    expect(forbidden.status).toBe(403);
    const before = (await familiar(iaiLabel)).sparks;
    const g = await call("gift", "POST", { params: { name: iaiLabel } });
    expect(g.status).toBe(200);
    expect(g.body).toEqual({ gifted: iaiLabel, reward: { sparks: 0, xp: 3 } });
    expect((await familiar(iaiLabel)).sparks).toBe(before + 5);
    const again = await call("gift", "POST", { params: { name: iaiLabel } });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_GIFTED");
    expect((await call("explore", "GET")).body.familiars.find((x: { label: string }) => x.label === iaiLabel).giftedToday).toBe(true);
  });

  it("the Dex counts species caught and lists every sighting", async () => {
    const species = (await familiar(iaiLabel)).species;
    const { status, body } = await call("dex", "GET");
    expect(status).toBe(200);
    expect(body.total).toBe(8);
    expect(body.caught).toBe(1);
    expect(body.species.find((x: { id: string }) => x.id === species)).toEqual({ id: species, name: expect.any(String), art: `/art/${species}.jpg`, caught: true, count: 2 });
    expect(body.species.find((x: { id: string }) => x.id === "fox")).toMatchObject({ caught: species === "fox", count: species === "fox" ? 2 : 0 });
    expect(body.spotted.map((x: { label: string }) => x.label)).toEqual([thirdLabel, iaiLabel]);
    expect(body.spotted[1]).toMatchObject({ giftedToday: true, portraitUrl: expect.stringContaining("/portraits/"), spottedAt: expect.any(String) });
    expect((await call("dex", "GET", { cookie: "none=1" })).status).toBe(401);
  });

  it("new daily and event quests track spotting, gifts, care and event visits", async () => {
    const q = await call("quests", "GET");
    const byId = Object.fromEntries(q.body.quests.map((x: { id: string }) => [x.id, x]));
    expect(byId["daily-spot"]).toMatchObject({ kind: "daily", claimable: true, reward: 10 });
    expect(byId["daily-gift"]).toMatchObject({ kind: "daily", claimable: true, reward: 10 });
    expect(byId["daily-care"]).toMatchObject({ kind: "daily", progress: 3, goal: 3, claimable: true, reward: 15 });
    expect(byId["hackathon-spot"]).toMatchObject({ kind: "event", progress: 2, goal: 3, claimable: false, reward: 60, period: "ethglobal-mumbai" });
    expect(byId["devcon-visit"]).toMatchObject({ kind: "event", progress: 1, claimable: true, reward: 40, period: "devcon-8" });
    const before = (await familiar(label)).sparks;
    expect((await call("claim", "POST", { json: { questId: "daily-care" } })).body.sparks).toBe(before + 15);
    expect((await call("claim", "POST", { json: { questId: "daily-care" } })).status).toBe(409);
    expect((await call("claim", "POST", { json: { questId: "hackathon-spot" } })).status).toBe(400);
    await setEnv({ EVENTS_TODAY: "2026-12-01" });
    const later = await call("quests", "GET");
    expect(later.body.quests.map((x: { id: string }) => x.id)).not.toContain("hackathon-spot");
    await setEnv({ EVENTS_TODAY: "2026-11-06" });
  });

  const mcpBody = async (res: Response) => {
    const text = await res.text();
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      return JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean).at(-1)!);
    }
    return text ? JSON.parse(text) : null;
  };
  const mcp = async (via: { bearer?: string; urlKey?: string }, method: string, params: unknown = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": "10.0.0.1" };
    if (via.bearer) headers.authorization = `Bearer ${via.bearer}`;
    const req = new Request(`http://localhost:3000/api/mcp${via.urlKey ? `/${via.urlKey}` : ""}`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const res = await R[via.urlKey ? "mcpKey" : "mcp"]!.POST!(req, { params: Promise.resolve(via.urlKey ? { key: via.urlKey } : {}) });
    return { status: res.status, body: await mcpBody(res) };
  };
  const bearer = async (mod: string, method: string, key: string, opts: { json?: unknown; params?: Record<string, unknown> } = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, "x-forwarded-for": "10.0.0.1" };
    if (opts.json !== undefined) headers["content-type"] = "application/json";
    const req = new Request("http://localhost:3000/api/x", { method, headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
    const res = await R[mod]![method]!(req, { params: Promise.resolve(opts.params ?? {}) });
    return { status: res.status, body: await res.json() };
  };

  let key = "";
  let keyId = "";
  it("creates a connector key shown once; the key works as a Bearer session", async () => {
    const { status, body } = await call("keys", "POST", { json: { label: "Claude" } });
    expect(status).toBe(200);
    expect(body).toEqual({ id: expect.any(String), label: "Claude", prefix: body.key.slice(0, 10), key: expect.stringMatching(/^fam_[0-9A-Za-z]{32}$/), connectorUrl: `http://localhost:3000/api/mcp/${body.key}` });
    key = body.key;
    keyId = body.id;
    const list = await call("keys", "GET");
    expect(list.body.keys).toEqual([{ id: keyId, label: "Claude", prefix: body.prefix, createdAt: expect.any(String), lastUsedAt: null }]);
    expect(JSON.stringify(list.body)).not.toContain(key);
    const me = await bearer("me", "GET", key);
    expect(me.body.session).toEqual({ address: user.address, method: "wallet" });
    expect((await call("keys", "GET")).body.keys[0].lastUsedAt).toEqual(expect.any(String));
    expect((await bearer("keys", "POST", key, { json: { label: "sneaky" } })).status).toBe(403); // keys can't mint keys
  });

  it("MCP over Bearer and URL key: tools/list, familiar_status, and errors as tool results", async () => {
    const init = await mcp({ bearer: key }, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "itest", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("familiar");
    const tools = await mcp({ urlKey: key }, "tools/list");
    expect(tools.body.result.tools.length).toBeGreaterThanOrEqual(12);
    const status = await mcp({ urlKey: key }, "tools/call", { name: "familiar_status", arguments: {} });
    const text = status.body.result.content[0].text as string;
    expect(status.body.result.isError).toBeFalsy();
    expect(text).toContain(`${label}.familiar.eth`);
    expect(text).toMatch(/Care: fullness \d+ · joy \d+ · energy \d+/);
    expect(text).toMatch(/Portrait: http/);
    const pet = await mcp({ urlKey: key }, "tools/call", { name: "care_for_familiar", arguments: { action: "pet" } });
    expect(pet.body.result.isError).toBe(true);
    expect(pet.body.result.content[0].text).toMatch(/try again in/);
    const explore = await mcp({ bearer: key }, "tools/call", { name: "explore_nearby", arguments: {} });
    expect(explore.body.result.content[0].text).toContain(`${iaiLabel}:`);
    const quests = await mcp({ bearer: key }, "tools/call", { name: "list_quests", arguments: {} });
    expect(quests.body.result.content[0].text).toMatch(/daily-spot .*READY TO CLAIM/);
    const claim = await mcp({ bearer: key }, "tools/call", { name: "claim_quest", arguments: { questId: "daily-spot" } });
    expect(claim.body.result.content[0].text).toMatch(/Claimed daily-spot: \+10 Sparks/);
    // A key session is a wallet session: visits still need a feed (or a demo Familiar).
    const talk = await mcp({ bearer: key }, "tools/call", { name: "talk_to_familiar", arguments: { message: "Long day of judging." } });
    expect(talk.body.result.isError).toBe(true);
    expect(talk.body.result.content[0].text).toMatch(/hungry|feed/);
  });

  it("talk_to_familiar runs a text visit for a demo Familiar and returns the reply and portrait", async () => {
    await setEnv({ DEMO_LABELS: thirdLabel });
    const k = (await call("keys", "POST", { json: { label: "ChatGPT" }, cookie: thirdCookie })).body.key as string;
    const mark = zg.calls.length;
    const talk = await mcp({ urlKey: k }, "tools/call", { name: "talk_to_familiar", arguments: { message: "Finally fixed the bug." } });
    expect(talk.body.result.isError).toBeFalsy();
    expect(talk.body.result.content[0].text).toMatch(new RegExp(`^${thirdLabel} \\(proud\\): ".+"`));
    expect(talk.body.result.content[0].text).toMatch(/New portrait: http.*\/portraits\//);
    expect(zg.calls.slice(mark).some((c) => c.path === "/audio/transcriptions")).toBe(false);
    await flushAfter();
    expect((await familiar(thirdLabel)).day).toBe(2);
    await setEnv({ DEMO_LABELS: "" });
  });

  it("revoking a key stops it everywhere; at most 5 live keys", async () => {
    expect((await call("key", "DELETE", { params: { id: keyId } })).body).toEqual({ revoked: keyId });
    expect((await mcp({ urlKey: key }, "tools/list")).status).toBe(401);
    expect((await mcp({ bearer: key }, "tools/list")).status).toBe(401);
    expect((await bearer("me", "GET", key)).status).toBe(401);
    expect((await call("key", "DELETE", { params: { id: keyId } })).status).toBe(404);
    expect((await call("keys", "GET")).body.keys).toEqual([]);
    for (let i = 0; i < 5; i++) expect((await call("keys", "POST", { json: { label: `k${i}` } })).status).toBe(200);
    const sixth = await call("keys", "POST", { json: { label: "k5" } });
    expect(sixth.status).toBe(409);
  });
});

describe("round 4: meet in person, night walks, trades, diary, push", () => {
  type Seeded = { label: string; cookie: string; id: string };
  let B: Seeded;
  let C: Seeded;
  let D: Seeded;
  const setEnv = async (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    (await import("@/server/env")).resetEnvForTests();
  };
  const dbx = async () => {
    const { db, schema } = await import("@/server/db/client");
    const orm = await import("drizzle-orm");
    return { d: await db(), schema, eq: orm.eq, and: orm.and };
  };
  const stats = async (name: string) => {
    const { d, schema, eq } = await dbx();
    const [row] = await d.select({ sparks: schema.familiars.sparks, xp: schema.familiars.xp }).from(schema.familiars).where(eq(schema.familiars.label, name));
    return row!;
  };
  /** A signed-in human with a Familiar inserted straight into the DB (no chain needed), wearing A's portrait. */
  const seed = async (suffix: string, species: string, color: string): Promise<Seeded> => {
    const who = privateKeyToAccount(generatePrivateKey());
    const n = await call("nonce", "POST", { json: { address: who.address }, cookie: "none=1" });
    const v = await call("verify", "POST", { json: { message: n.body.message, signature: await who.signMessage({ message: n.body.message }) }, cookie: "none=1" });
    const { d, schema, eq } = await dbx();
    const [a] = await d.select().from(schema.familiars).where(eq(schema.familiars.label, label));
    await d.insert(schema.users).values({ address: who.address.toLowerCase() }).onConflictDoNothing();
    const [row] = await d
      .insert(schema.familiars)
      .values({
        label: `${label}${suffix}`,
        ensNode: generatePrivateKey(),
        owner: who.address.toLowerCase(),
        species,
        color,
        styleSeed: `cute round ${species} creature`,
        resolver: a!.resolver,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        day: 1,
        portraitUrl: a!.portraitUrl,
      })
      .returning();
    return { label: row!.label, cookie: v.res.headers.get("set-cookie")!.split(";")[0]!, id: row!.id };
  };

  beforeAll(async () => {
    const load = (p: string) => import(`@/app/api/${p}/route`);
    Object.assign(R, {
      meetCode: await load("familiar/[name]/meet-code"),
      meet: await load("familiar/[name]/meet"),
      walks: await load("walks"),
      walk: await load("walks/[id]"),
      walkJoin: await load("walks/[id]/join"),
      walkStart: await load("walks/[id]/start"),
      famWalks: await load("familiar/[name]/walks"),
      trades: await load("trades"),
      tradeAccept: await load("trades/[id]/accept"),
      tradeDecline: await load("trades/[id]/decline"),
      tradeCancel: await load("trades/[id]/cancel"),
      diary: await load("familiar/[name]/diary"),
      pushKey: await load("push/key"),
      pushSub: await load("push/subscribe"),
    });
    B = await seed("m", "owl", "tide blue");
    C = await seed("n", "otter", "moss green");
    D = await seed("o", "moth", "rose pink");
  });

  it("meet in person: a daily QR code, 3× the spot reward, once, and it upgrades a remote spot", async () => {
    const code = await call("meetCode", "GET", { params: { name: label } });
    expect(code.status).toBe(200);
    expect(code.body.code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(code.body.url).toBe(`http://localhost:3000/meet/${label}?c=${code.body.code}`);
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    expect(code.body.expiresAt).toBe(midnight.toISOString());
    expect((await call("meetCode", "GET", { params: { name: label }, cookie: B.cookie })).status).toBe(403);

    const bad = await call("meet", "POST", { params: { name: label }, json: { code: "x".repeat(16) }, cookie: B.cookie });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    const before = await stats(B.label);
    const met = await call("meet", "POST", { params: { name: label }, json: { code: code.body.code }, cookie: B.cookie });
    expect(met.status).toBe(200);
    expect(met.body).toEqual({ met: label, reward: { sparks: 45, xp: 15 }, newSpecies: true, inPerson: true });
    expect(await stats(B.label)).toEqual({ sparks: before.sparks + 45, xp: before.xp + 15 });
    const again = await call("meet", "POST", { params: { name: label }, json: { code: code.body.code }, cookie: B.cookie });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_MET");
    expect((await call("spot", "POST", { params: { name: label }, cookie: B.cookie })).body.error.code).toBe("ALREADY_SPOTTED");
    expect((await call("meet", "POST", { params: { name: label }, json: { code: code.body.code } })).status).toBe(400); // your own

    // A spotted the iAI Familiar remotely in round 3: meeting it in person still pays once (no new-species bonus).
    const iaiCode = (await call("meetCode", "GET", { params: { name: iaiLabel }, cookie: iaiCookie })).body.code;
    const a0 = await stats(label);
    const up = await call("meet", "POST", { params: { name: iaiLabel }, json: { code: iaiCode } });
    expect(up.body).toEqual({ met: iaiLabel, reward: { sparks: 15, xp: 15 }, newSpecies: false, inPerson: true });
    expect((await stats(label)).sparks).toBe(a0.sparks + 15);
    expect((await call("meet", "POST", { params: { name: iaiLabel }, json: { code: iaiCode } })).body.error.code).toBe("ALREADY_MET");

    const ex = (await call("explore", "GET")).body.familiars as { label: string; spotted: boolean; metInPerson: boolean }[];
    expect(ex.find((x) => x.label === iaiLabel)).toMatchObject({ spotted: true, metInPerson: true });
    expect(ex.find((x) => x.label === `${label}t`)).toMatchObject({ spotted: true, metInPerson: false });
    expect(ex.find((x) => x.label === B.label)).toMatchObject({ spotted: false, metInPerson: false });
    const dexSpotted = (await call("dex", "GET")).body.spotted as { label: string; metInPerson: boolean }[];
    expect(dexSpotted.find((x) => x.label === iaiLabel)?.metInPerson).toBe(true);
    expect(dexSpotted.find((x) => x.label === `${label}t`)?.metInPerson).toBe(false);

    // ETHGlobal Mumbai's last day: the in-person quest.
    await setEnv({ EVENTS_TODAY: "2026-11-07" });
    const q = (await call("quests", "GET")).body.quests as { id: string }[];
    expect(q.find((x) => x.id === "hackathon-meet")).toMatchObject({ kind: "event", progress: 1, goal: 1, claimable: true, reward: 40, period: "ethglobal-mumbai" });
    await setEnv({ EVENTS_TODAY: "2026-10-01" });
    expect(((await call("quests", "GET")).body.quests as { id: string }[]).map((x) => x.id)).not.toContain("hackathon-meet");
  });

  it("night walk: create → join → the third member auto-paints → done, each member paid once", async () => {
    const created = await call("walks", "POST");
    expect(created.status).toBe(200);
    const w = created.body.walk;
    expect(w).toMatchObject({ status: "gathering", host: label, imageUrl: null, joined: true, canJoin: false, canStart: false, inviteUrl: `http://localhost:3000/walk/${w.id}` });
    expect(w.members).toEqual([{ label, species: "fox", color: "ember orange", portraitUrl: expect.stringContaining("/portraits/") }]);
    const twice = await call("walks", "POST");
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("ALREADY_WALKED");
    expect((await call("walk", "GET", { params: { id: w.id }, cookie: "none=1" })).body.walk).toMatchObject({ canJoin: false, canStart: false, joined: false });
    expect((await call("walk", "GET", { params: { id: w.id }, cookie: B.cookie })).body.walk).toMatchObject({ canJoin: true, canStart: false, joined: false });
    expect((await call("walk", "GET", { params: { id: "not-a-walk" }, cookie: "none=1" })).status).toBe(404);
    expect((await call("walkStart", "POST", { params: { id: w.id } })).status).toBe(400); // alone

    const joined = await call("walkJoin", "POST", { params: { id: w.id }, cookie: B.cookie });
    expect(joined.status).toBe(200);
    expect(joined.body.walk).toMatchObject({ status: "gathering", joined: true, canJoin: false });
    expect(joined.body.walk.members.map((x: { label: string }) => x.label)).toEqual([label, B.label]);
    expect((await call("walk", "GET", { params: { id: w.id } })).body.walk.canStart).toBe(true);
    expect((await call("walkStart", "POST", { params: { id: w.id }, cookie: B.cookie })).status).toBe(403);
    expect((await call("walkJoin", "POST", { params: { id: w.id }, cookie: B.cookie })).body.error.code).toBe("CONFLICT");

    // One join per Familiar per day: B can't also join D's walk.
    const dWalk = (await call("walks", "POST", { cookie: D.cookie })).body.walk;
    const second = await call("walkJoin", "POST", { params: { id: dWalk.id }, cookie: B.cookie });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ALREADY_WALKED");
    expect((await call("walk", "GET", { params: { id: dWalk.id }, cookie: B.cookie })).body.walk.canJoin).toBe(false);

    const [a0, b0, c0, d0] = await Promise.all([stats(label), stats(B.label), stats(C.label), stats(D.label)]);
    const mark = zg.calls.length;
    const third = await call("walkJoin", "POST", { params: { id: w.id }, cookie: C.cookie });
    expect(third.status).toBe(200);
    expect(third.body.walk).toMatchObject({ status: "painting", imageUrl: null });
    const full = await call("walkJoin", "POST", { params: { id: w.id }, cookie: D.cookie });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("WALK_FULL");

    await flushAfter();
    const done = (await call("walk", "GET", { params: { id: w.id }, cookie: "none=1" })).body.walk;
    expect(done.status).toBe("done");
    expect(done.imageUrl).toMatch(new RegExp(`/api/media/walks/${w.id}\\.png$`));
    const draw = zg.calls.slice(mark).find((c) => c.path === "/images/generations")!;
    const body = draw.body as { prompt: string; image: string[] };
    expect(draw.auth).toBe("Bearer sk-test"); // team-paid
    expect(body.image).toHaveLength(3);
    expect(body.image.every((x) => x.startsWith("data:image/png;base64,"))).toBe(true);
    expect(body.prompt).toContain("walking together through a lantern-lit night street");
    for (const s of ["ember orange fox", "tide blue owl", "moss green otter"]) expect(body.prompt).toContain(s);
    expect(await stats(label)).toEqual({ sparks: a0.sparks + 20, xp: a0.xp + 20 });
    expect(await stats(B.label)).toEqual({ sparks: b0.sparks + 20, xp: b0.xp + 20 });
    expect(await stats(C.label)).toEqual({ sparks: c0.sparks + 20, xp: c0.xp + 20 });
    expect(await stats(D.label)).toEqual(d0);

    const list = await call("famWalks", "GET", { params: { name: B.label }, cookie: "none=1" });
    expect(list.status).toBe(200);
    expect(list.body.walks.map((x: { id: string }) => x.id)).toEqual([w.id]);
    expect(list.body.walks[0]).toMatchObject({ status: "done", host: label, canJoin: false, canStart: false });
    expect((await call("famWalks", "GET", { params: { name: D.label }, cookie: "none=1" })).body.walks).toEqual([]);
    const quest = ((await call("quests", "GET")).body.quests as { id: string }[]).find((x) => x.id === "daily-walk");
    expect(quest).toMatchObject({ kind: "daily", progress: 1, claimable: true, reward: 20 });

    // Start early with two, and a painting that fails: no rewards.
    expect((await call("walkJoin", "POST", { params: { id: dWalk.id } })).status).toBe(200); // A hosted, but hasn't joined anyone's yet
    zg.failNext("/images/generations", 500);
    const started = await call("walkStart", "POST", { params: { id: dWalk.id }, cookie: D.cookie });
    expect(started.body.walk.status).toBe("painting");
    const a1 = await stats(label);
    await flushAfter();
    expect((await call("walk", "GET", { params: { id: dWalk.id }, cookie: "none=1" })).body.walk).toMatchObject({ status: "failed", imageUrl: null });
    expect(await stats(D.label)).toEqual(d0);
    expect(await stats(label)).toEqual(a1);
    expect((await call("walkJoin", "POST", { params: { id: dWalk.id }, cookie: C.cookie })).status).toBe(409);
  });

  it("night walks: global daily cap, a failed walk frees the host's night, the cron fails stuck paintings", async () => {
    await setEnv({ WALKS_PER_DAY: "2" });
    const capped = await call("walks", "POST", { cookie: D.cookie });
    expect(capped.status).toBe(429);
    expect(capped.body.error.code).toBe("RATE_LIMITED");
    await setEnv({ WALKS_PER_DAY: undefined });
    const again = await call("walks", "POST", { cookie: D.cookie });
    expect(again.status).toBe(200);
    const { d, schema, eq } = await dbx();
    await d.update(schema.walks).set({ status: "painting", startedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(schema.walks.id, again.body.walk.id));
    const req = new Request("http://localhost:3000/api/cron/reconcile", { headers: { authorization: "Bearer cron-secret-for-tests-123" } });
    const res = await R.cron!.GET!(req, { params: Promise.resolve({}) });
    expect((await res.json()).walksFailed).toBe(1);
    expect((await call("walk", "GET", { params: { id: again.body.walk.id }, cookie: "none=1" })).body.walk.status).toBe("failed");
  });

  it("trades: friends only, ownership rules, atomic swap that takes worn items off, decline, cancel, expiry, caps", async () => {
    const { d, schema, eq, and } = await dbx();
    const inv = schema.inventory;
    // A owns (and wears) the diya from the shop test; B gets a star cap and wears it; C a garland.
    await d.insert(inv).values([
      { familiarId: B.id, itemId: "starcap", source: "shop" },
      { familiarId: C.id, itemId: "garland", source: "shop" },
    ]);
    await call("equip", "POST", { params: { name: label }, json: { slot: "hand", itemId: "diya" } });
    expect((await call("equip", "POST", { params: { name: B.label }, json: { slot: "head", itemId: "starcap" }, cookie: B.cookie })).status).toBe(200);

    const strangers = await call("trades", "POST", { json: { to: B.label, give: "garland", want: "starcap" }, cookie: C.cookie });
    expect(strangers.status).toBe(403);
    expect(strangers.body.error.code).toBe("NOT_FRIENDS");
    const offer = (give: string, want: string, cookie = B.cookie, to = label) => call("trades", "POST", { json: { to, give, want }, cookie });
    expect((await offer("garland", "diya")).body.error).toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/doesn't have the marigold garland/) });
    expect((await offer("starcap", "kandil")).body.error.message).toMatch(/doesn't have the akash kandil/);
    expect((await offer("starcap", "nope")).status).toBe(400);
    expect((await offer("starcap", "diya", B.cookie, B.label)).status).toBe(400); // yourself

    const made = await offer("starcap", "diya");
    expect(made.status).toBe(200);
    const t1 = made.body.trade;
    expect(t1).toMatchObject({
      status: "pending",
      from: { label: B.label, species: "owl" },
      to: { label, species: "fox" },
      give: { id: "starcap", name: "Star cap", art: "/art/items/starcap.jpg" },
      want: { id: "diya", name: "Clay diya", art: "/art/items/diya.jpg" },
    });
    expect(Date.parse(t1.expiresAt) - Date.parse(t1.createdAt)).toBe(72 * 3600_000);
    const mine = (await call("trades", "GET")).body;
    expect(mine.incoming.map((x: { id: string }) => x.id)).toEqual([t1.id]);
    expect(mine.outgoing).toEqual([]);
    expect((await call("trades", "GET", { cookie: B.cookie })).body.outgoing.map((x: { id: string }) => x.id)).toEqual([t1.id]);
    expect((await call("tradeAccept", "POST", { params: { id: t1.id }, cookie: B.cookie })).status).toBe(403);
    expect((await call("tradeAccept", "POST", { params: { id: t1.id }, cookie: D.cookie })).status).toBe(404);

    const accepted = await call("tradeAccept", "POST", { params: { id: t1.id } });
    expect(accepted.status).toBe(200);
    expect(accepted.body.trade.status).toBe("accepted");
    const owned = async (id: string) => (await d.select({ item: inv.itemId }).from(inv).where(eq(inv.familiarId, id))).map((r) => r.item).sort();
    const [aRow] = await d.select().from(schema.familiars).where(eq(schema.familiars.label, label));
    const [bRow] = await d.select().from(schema.familiars).where(eq(schema.familiars.id, B.id));
    expect(await owned(aRow!.id)).toContain("starcap");
    expect(await owned(aRow!.id)).not.toContain("diya");
    expect(await owned(B.id)).toEqual(["diya"]);
    expect(Object.values(aRow!.equipped)).not.toContain("diya"); // taken off on the way out
    expect(bRow!.equipped).toEqual({});
    expect((await call("tradeAccept", "POST", { params: { id: t1.id } })).body.error.code).toBe("CONFLICT");
    expect((await call("trades", "GET")).body.history[0]).toMatchObject({ id: t1.id, status: "accepted" });

    const t2 = (await offer("diya", "starcap")).body.trade;
    expect((await call("tradeDecline", "POST", { params: { id: t2.id }, cookie: B.cookie })).status).toBe(403);
    expect((await call("tradeDecline", "POST", { params: { id: t2.id } })).body.trade.status).toBe("declined");
    expect((await call("tradeCancel", "POST", { params: { id: t2.id }, cookie: B.cookie })).status).toBe(409);
    const t3 = (await offer("diya", "starcap")).body.trade;
    expect((await call("tradeCancel", "POST", { params: { id: t3.id } })).status).toBe(403);
    expect((await call("tradeCancel", "POST", { params: { id: t3.id }, cookie: B.cookie })).body.trade.status).toBe("cancelled");

    // Accept re-checks ownership: the star cap left A meanwhile → the offer is cancelled.
    const t4 = (await offer("diya", "starcap")).body.trade;
    await d.delete(inv).where(and(eq(inv.familiarId, aRow!.id), eq(inv.itemId, "starcap")));
    expect((await call("tradeAccept", "POST", { params: { id: t4.id } })).status).toBe(409);
    expect(await owned(B.id)).toEqual(["diya"]);
    expect((await call("trades", "GET")).body.history.find((x: { id: string }) => x.id === t4.id).status).toBe("cancelled");

    // Expiry after 72 h (reported and lazily marked).
    await d.insert(inv).values({ familiarId: aRow!.id, itemId: "scarf", source: "shop" }).onConflictDoNothing();
    const t5 = (await offer("diya", "scarf")).body.trade;
    await d.update(schema.trades).set({ createdAt: new Date(Date.now() - 73 * 3600_000) }).where(eq(schema.trades.id, t5.id));
    const listed = (await call("trades", "GET", { cookie: B.cookie })).body;
    expect(listed.outgoing).toEqual([]);
    expect(listed.history.find((x: { id: string }) => x.id === t5.id).status).toBe("expired");
    expect((await call("tradeAccept", "POST", { params: { id: t5.id } })).status).toBe(409);

    // At most 5 open offers.
    for (let i = 0; i < 5; i++) expect((await offer("diya", "scarf")).status).toBe(200);
    const sixth = await offer("diya", "scarf");
    expect(sixth.status).toBe(409);
    expect((await call("trades", "GET")).body.incoming).toHaveLength(5);
  });

  it("weekly diary: written by 0GM from the week's nights and memory, rewritten once a day, past weeks once", async () => {
    const { isoWeek } = await import("@/server/game/progress");
    const today = new Date().toISOString().slice(0, 10);
    const week = isoWeek(today);
    expect((await call("diary", "GET", { params: { name: label } })).body).toEqual({ diary: null, canWrite: true });
    expect((await call("diary", "GET", { params: { name: label }, cookie: B.cookie })).status).toBe(403);
    expect((await call("diary", "GET", { params: { name: D.label }, cookie: D.cookie })).body).toEqual({ diary: null, canWrite: false });
    const nothing = await call("diary", "POST", { params: { name: D.label }, json: {}, cookie: D.cookie });
    expect(nothing.status).toBe(400);
    expect(nothing.body.error.code).toBe("NOTHING_TO_WRITE");

    const mark = zg.calls.length;
    const wrote = await call("diary", "POST", { params: { name: label }, json: {} });
    expect(wrote.status).toBe(200);
    expect(wrote.body.diary).toMatchObject({ week, text: expect.stringMatching(/^Dear diary/), moodLine: "Proud, a little sleepy, mostly smug.", createdAt: expect.any(String) });
    expect(wrote.body.diary.days.at(-1)).toEqual({ date: today, mood: "proud" });
    const chat = zg.calls.slice(mark).find((c) => c.path === "/chat/completions")!;
    expect(chat.auth).toBe("Bearer sk-test");
    const prompt = (chat.body as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("diary entry");
    expect(prompt).toContain("builds things under pressure"); // the decrypted memory
    expect(prompt).toContain("Never quote your human");

    const soon = await call("diary", "POST", { params: { name: label }, json: {} });
    expect(soon.status).toBe(429);
    expect(soon.body.error.code).toBe("COOLDOWN");
    expect(Date.parse(soon.body.error.details.readyAt)).toBeGreaterThan(Date.now() + 23 * 3600_000);
    const read = (await call("diary", "GET", { params: { name: label } })).body;
    expect(read).toMatchObject({ diary: { week, text: wrote.body.diary.text }, canWrite: false });

    const { d, schema, eq } = await dbx();
    const [aRow] = await d.select().from(schema.familiars).where(eq(schema.familiars.label, label));
    await d.update(schema.diaries).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(schema.diaries.familiarId, aRow!.id));
    expect((await call("diary", "GET", { params: { name: label } })).body.canWrite).toBe(true);
    const rewrote = await call("diary", "POST", { params: { name: label }, json: { week } });
    expect(rewrote.status).toBe(200);
    expect(rewrote.body.diary.text).not.toBe(wrote.body.diary.text);
    expect(Date.parse(rewrote.body.diary.createdAt)).toBeGreaterThan(Date.parse(wrote.body.diary.createdAt));

    for (const bad of ["2027-W10", "2025-W53", "2026-45"]) expect((await call("diary", "POST", { params: { name: label }, json: { week: bad } })).status).toBe(400);
    expect((await call("diary", "GET", { params: { name: label }, path: "/api/x?week=nope" })).status).toBe(400);

    // A past week is written once.
    const lastWeekDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const lastWeek = isoWeek(lastWeekDate);
    const [past] = await d
      .insert(schema.visits)
      .values({ familiarId: B.id, day: 99, utcDate: lastWeekDate, kind: "visit", paidBy: "free", status: "complete", mood: "calm", reply: "You hummed the whole walk home." })
      .returning();
    const pastDiary = await call("diary", "POST", { params: { name: B.label }, json: { week: lastWeek }, cookie: B.cookie });
    expect(pastDiary.status).toBe(200);
    expect(pastDiary.body.diary).toMatchObject({ week: lastWeek, days: [{ date: lastWeekDate, mood: "calm" }] });
    await d.update(schema.diaries).set({ createdAt: new Date(Date.now() - 48 * 3600_000) }).where(eq(schema.diaries.familiarId, B.id));
    expect((await call("diary", "POST", { params: { name: B.label }, json: { week: lastWeek }, cookie: B.cookie })).status).toBe(409);
    expect((await call("diary", "GET", { params: { name: B.label }, path: `/api/x?week=${lastWeek}`, cookie: B.cookie })).body.canWrite).toBe(false);
    await d.delete(schema.visits).where(eq(schema.visits.id, past!.id)); // keep the cron test's visit pool clean
  });

  it("push: VAPID key, subscribe, and the cron sends one sassy nudge per 12 h", async () => {
    const push = await import("@/server/push");
    const sent: { endpoint: string; body: string }[] = [];
    push.setPushSenderForTests(async (sub, payload) => {
      sent.push({ endpoint: sub.endpoint, body: JSON.parse(payload).body });
      return { statusCode: 201 };
    });
    expect((await call("pushKey", "GET", { cookie: "none=1" })).body).toEqual({ key: null });
    await setEnv({ VAPID_PUBLIC_KEY: "BTestPublicKey", VAPID_PRIVATE_KEY: "test-private-key" });
    try {
      expect((await call("pushKey", "GET", { cookie: "none=1" })).body).toEqual({ key: "BTestPublicKey" });
      const sub = { endpoint: `https://push.example/${B.label}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
      expect((await call("pushSub", "POST", { json: sub, cookie: "none=1" })).status).toBe(401);
      expect((await call("pushSub", "POST", { json: sub, cookie: B.cookie })).body).toEqual({ ok: true });
      const { d, schema, eq } = await dbx();
      const now = Date.now();
      await d
        .update(schema.familiars)
        .set({ lastSnackAt: new Date(now - 20 * 3600_000), lastPetAt: new Date(now), lastVisitAt: new Date(now), lastVisitDate: new Date(now).toISOString().slice(0, 10) })
        .where(eq(schema.familiars.id, B.id));
      const cron = async () => (await (await R.cron!.GET!(new Request("http://localhost:3000/api/cron/reconcile", { headers: { authorization: "Bearer cron-secret-for-tests-123" } }), { params: Promise.resolve({}) })).json()).pushes;
      expect(await cron()).toEqual({ familiars: 1, sent: 1, dropped: 0 });
      expect(sent).toEqual([{ endpoint: sub.endpoint, body: `${B.label}: I'm starving. Dramatically.` }]);
      expect((await cron()).familiars).toBe(0);
      expect((await call("pushSub", "DELETE", { json: { endpoint: sub.endpoint }, cookie: B.cookie })).body).toEqual({ ok: true });
    } finally {
      push.setPushSenderForTests(null);
      await setEnv({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined });
    }
  });
});

describe("free hatch cap, demo, forget", () => {
  const newWalletCookie = async () => {
    const who = privateKeyToAccount(generatePrivateKey());
    const n = await call("nonce", "POST", { json: { address: who.address }, cookie: "none=1" });
    const v = await call("verify", "POST", { json: { message: n.body.message, signature: await who.signMessage({ message: n.body.message }) }, cookie: "none=1" });
    return v.res.headers.get("set-cookie")!.split(";")[0]!;
  };

  it("caps team-paid hatches per day", async () => {
    process.env.FREE_HATCHES_PER_DAY = "1"; // the wallet hatch above already used today's one
    (await import("@/server/env")).resetEnvForTests();
    const form = voice();
    form.set("name", `${label}c`);
    const { status, body } = await call("hatch", "POST", { form, cookie: await newWalletCookie() });
    expect(status).toBe(429);
    expect(body.error.message).toMatch(/free hatches/);
    process.env.FREE_HATCHES_PER_DAY = "50";
    (await import("@/server/env")).resetEnvForTests();
  });

  it("demo login is off by default, and on it signs in as the demo Familiar's owner", async () => {
    R.demo ??= await import("@/app/api/auth/demo/route");
    expect((await call("demo", "POST", { cookie: "none=1" })).status).toBe(404);
    Object.assign(process.env, { DEMO_LOGIN_ENABLED: "true", DEMO_LABELS: label });
    (await import("@/server/env")).resetEnvForTests();
    const { status, body } = await call("demo", "POST", { cookie: "none=1" });
    expect(status).toBe(200);
    expect(body.session.address).toBe(user.address);
    expect(body.familiar.label).toBe(label);
    process.env.DEMO_LOGIN_ENABLED = "false";
    (await import("@/server/env")).resetEnvForTests();
  });

  it("forget deletes off-chain data; hatching again adopts the onchain name with a blank memory", async () => {
    const wrong = await call("familiar", "DELETE", { params: { name: label }, json: { confirm: "nope" } });
    expect(wrong.status).toBe(400);
    const { status, body } = await call("familiar", "DELETE", { params: { name: label }, json: { confirm: label } });
    expect(status).toBe(200);
    expect(body).toEqual({ forgotten: label, visits: 3 });
    expect((await call("familiar", "GET", { params: { name: label } })).status).toBe(404);
    expect((await call("ens", "GET", { params: { name: label } })).body.ens.owner).toBe(user.address); // onchain stays

    const form = voice();
    form.set("name", label);
    const again = await call("hatch", "POST", { form });
    expect(again.status).toBe(201);
    expect(again.body.familiar).toMatchObject({ label, day: 4, generation: 2 }); // continues onchain state
    expect(again.body.visit.kind).toBe("hatch");
    await flushAfter();
    expect((await call("ens", "GET", { params: { name: label } })).body.ens.records.day).toBe("4");
  });
});

describe("agent transactions", () => {
  it("concurrent writes from the agent get distinct nonces (advisory lock + stored nonce)", async () => {
    const { logDayOnchain, lastLoggedDay } = await import("@/server/chain/dayLog");
    const nodes = [1, 2, 3].map((i) => `0x${i.toString(16).padStart(64, "0")}` as Hex);
    const z = `0x${"00".repeat(32)}` as Hex;
    const hashes = await Promise.all(nodes.map((node) => logDayOnchain({ node, day: 1, reqHash: z, imageHash: z, memoryRoot: z })));
    expect(new Set(hashes).size).toBe(3);
    for (const node of nodes) expect(await lastLoggedDay(node)).toBe(1);
  });

  it("health reports agent gas balances", async () => {
    const { body } = await call("health", "GET");
    expect(body.agent.sepoliaEth).toBeGreaterThan(1);
    expect(body.agent.low).toBe(false);
  });
});

describe("cron reconcile", () => {
  it("requires the cron secret", async () => {
    expect((await call("cron", "GET", { cookie: "none=1" })).status).toBe(401);
  });

  it("retries visits whose onchain writes failed", async () => {
    const { db, schema } = await import("@/server/db/client");
    const { eq } = await import("drizzle-orm");
    const d = await db();
    const [v] = await d.select().from(schema.visits).where(eq(schema.visits.status, "complete")).limit(1);
    // Simulate a visit left behind by a crashed instance: pending, old, records not yet written.
    await d.update(schema.visits).set({ status: "chain_pending", recordsTx: null, createdAt: new Date(Date.now() - 3600_000) }).where(eq(schema.visits.id, v!.id));
    const req = new Request("http://localhost:3000/api/cron/reconcile", { headers: { authorization: "Bearer cron-secret-for-tests-123" } });
    const res = await R.cron!.GET!(req, { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.finalized).toEqual(expect.arrayContaining([{ id: v!.id, status: "complete" }]));
  });
});

// Sanity: the Sepolia fork is reachable from the test too (used by journey C).
it("sepolia fork is live", async () => expect(await sepPc.getChainId()).toBe(11155111));
void parseEther;
