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
    expect(body.visit.receipts.map((r: { step: string }) => r.step)).toEqual(["transcribe", "think", "draw"]);
    expect(body.visit.receipts.every((r: { requestId: string; teeVerified: boolean }) => r.requestId.startsWith("0g-req-") && r.teeVerified)).toBe(true);
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

describe("journey B: nightly visit, paid with a Uniswap feed", () => {
  it("one visit per UTC day", async () => {
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label } });
    expect(status).toBe(409);
    expect(body.error.code).toBe("ALREADY_VISITED_TODAY");
  });

  it("a hungry Familiar asks to be fed (402)", async () => {
    process.env.DEMO_LABELS = label; // lift the daily limit for the rest of the suite
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
    const first = await call("confirm", "POST", { json: { txHash: feedTx } });
    expect(first.status).toBe(200);
    expect(first.body.credited).toEqual([expect.objectContaining({ label, visits: 1 })]);
    expect(first.body.feedCredits).toBe(1);
    const again = await call("confirm", "POST", { json: { txHash: feedTx } });
    expect(again.body.credited).toEqual([]);
    expect(again.body.feedCredits).toBe(1);
  });

  it("rejects transactions without a Fed event from our Feeder", async () => {
    const w = createWalletClient({ account: user, chain: base, transport: http(rpcs.BASE_RPC) });
    const tx = await w.sendTransaction({ to: user.address, value: 1n });
    expect((await basePc.waitForTransactionReceipt({ hash: tx, pollingInterval: 200 })).status).toBe("success");
    await rpc(rpcs.BASE_RPC, "evm_mine");
    const { status, body } = await call("confirm", "POST", { json: { txHash: tx } });
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
    const { status, body } = await call("confirm", "POST", { json: { txHash: tx } });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/No Fed event from FamiliarFeeder/);
    expect((await call("familiar", "GET", { params: { name: label } })).body.familiar.feedCredits).toBe(1);
  });

  it("visits using the feed credit; the day counter advances everywhere", async () => {
    const { status, body } = await call("visit", "POST", { form: voice(), params: { name: label } });
    expect(status).toBe(200);
    expect(body.visit).toMatchObject({ day: 2, paidBy: "feed", kind: "visit" });
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
    expect((await call("confirm", "POST", { json: { txHash: tx } })).body.feedCredits).toBe(1);
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
    expect(inference.length).toBe(3);
    expect(inference.every((c) => c.auth === "Bearer zg-user-session-jwt")).toBe(true);
    await flushAfter();
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
    const [v] = await d.select().from(schema.visits).where(eq(schema.visits.id, hatchVisitId));
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
