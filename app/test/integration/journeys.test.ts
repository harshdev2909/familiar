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
