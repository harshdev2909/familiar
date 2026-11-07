import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { runPipeline } from "@/server/familiar/pipeline";
import type { Receipt, ZeroGRouter as Router } from "@/server/zerog/router";

// Round 4 units: Lantern Night, meet codes, walk prompt, diary weeks, push. DB-backed parts run on
// the in-memory PGlite (migrations included).

const setEnv = async (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  (await import("@/server/env")).resetEnvForTests();
};

const rc = (step: Receipt["step"]): Receipt => ({ step, model: step, requestId: `${step}-1`, latencyMs: 1, cost: null, costCurrency: null, provider: null, teeVerified: true });

let seq = 0;
/** A Familiar row (and its owner) straight in the DB. */
async function seedFamiliar(over: Record<string, unknown> = {}) {
  const { db, schema } = await import("@/server/db/client");
  const d = await db();
  const owner = privateKeyToAccount(generatePrivateKey()).address;
  const label = `u4${Date.now().toString(36)}${seq++}`;
  await d.insert(schema.users).values({ address: owner.toLowerCase() });
  const [f] = await d
    .insert(schema.familiars)
    .values({
      label,
      ensNode: `0x${(BigInt(Date.now()) * 1000n + BigInt(seq)).toString(16).padStart(64, "0")}`,
      owner: owner.toLowerCase(),
      species: "fox",
      color: "ember orange",
      styleSeed: "seed",
      resolver: "0x0000000000000000000000000000000000000001",
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      ...over,
    })
    .returning();
  return { f: f!, session: { address: owner, method: "wallet" as const } };
}

describe("Lantern Night", () => {
  afterAll(() => setEnv({ EVENTS_TODAY: undefined }));

  it("adds fireworks and sky lanterns to the visit prompt only on 2026-11-08", async () => {
    const { LANTERN_NIGHT_SKY, eventImagePromptSuffix, eventViews } = await import("@/server/game/events");
    expect(LANTERN_NIGHT_SKY).toBe(", the night sky behind it full of Diwali fireworks and floating paper sky lanterns");
    expect(eventImagePromptSuffix("2026-11-07")).toBe("");
    expect(eventImagePromptSuffix("2026-11-08")).toBe(LANTERN_NIGHT_SKY);
    expect(eventImagePromptSuffix("2026-11-09")).toBe("");
    expect(eventViews("2026-11-08").find((e) => e.id === "lantern-night")).toEqual({
      id: "lantern-night",
      name: "Lantern Night",
      place: "Everywhere",
      start: "2026-11-08",
      end: "2026-11-08",
      logo: null,
      art: "/art/events/lantern-night.jpg",
      url: null,
      blurb: expect.any(String),
      bonus: "Every portrait gets fireworks · limited badge",
      status: "live",
    });
  });

  it("the pipeline appends the suffix to the Seedream prompt", async () => {
    const prompts: string[] = [];
    const router = {
      chatJson: async () => ({ content: JSON.stringify({ mood: "joyful", reply: "Look at the sky!", memory_update: "m", image_prompt: "watching the sky" }), receipt: rc("think") }),
      image: async (p: string) => {
        prompts.push(p);
        return { bytes: new Uint8Array([0x89, 0x50]), receipt: rc("draw") };
      },
    } as unknown as Router;
    const out = await runPipeline({ router, name: "luma", kind: "visit", day: 2, stage: "hatchling", styleSeed: "cute round fox", memory: "", text: "hi", promptSuffix: ", the night sky behind it full of Diwali fireworks and floating paper sky lanterns" });
    expect(prompts[0]).toBe(out.imagePrompt);
    expect(out.imagePrompt.endsWith("watching the sky, the night sky behind it full of Diwali fireworks and floating paper sky lanterns")).toBe(true);
  });

  it("the lantern-night-visit quest is live on the night and the limited badge sticks to any visit on it", async () => {
    const { db, schema } = await import("@/server/db/client");
    const { utcDate } = await import("@/server/familiar/rules");
    const { claimQuest, quests } = await import("@/server/game/service");
    const { f, session } = await seedFamiliar();
    await setEnv({ EVENTS_TODAY: "2026-11-08" }); // pretend today is Lantern Night
    const before = await quests(session);
    expect(before.quests.find((q) => q.id === "lantern-night-visit")).toMatchObject({ kind: "event", progress: 0, goal: 1, reward: 50, period: "lantern-night", claimable: false });
    expect(before.badges.find((b) => b.id === "lantern-night-2026")).toEqual({ id: "lantern-night-2026", name: "Lantern Night 2026", earned: false, limited: true });

    const d = await db();
    await d.insert(schema.visits).values({ familiarId: f.id, day: 1, utcDate: utcDate(), kind: "visit", paidBy: "free", status: "complete", mood: "joyful" });
    const after = await quests(session);
    expect(after.quests.find((q) => q.id === "lantern-night-visit")).toMatchObject({ progress: 1, claimable: true });
    expect(after.badges.find((b) => b.id === "lantern-night-2026")?.earned).toBe(true);
    const claimed = await claimQuest(session, "lantern-night-visit");
    expect(claimed).toMatchObject({ claimed: "lantern-night-visit", reward: 50 });

    // The day before: no quest, and today's visit isn't on the night.
    await setEnv({ EVENTS_TODAY: "2026-11-07" });
    const eve = await quests(session);
    expect(eve.quests.map((q) => q.id)).not.toContain("lantern-night-visit");
    expect(eve.badges.find((b) => b.id === "lantern-night-2026")?.earned).toBe(false);
    // Other badges carry the new `limited` flag too.
    expect(eve.badges.find((b) => b.id === "first-night")).toMatchObject({ limited: false });
  });
});

describe("meet codes", () => {
  afterAll(() => setEnv({ SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789" }));

  it("are 16 base64url chars of an HMAC over label and UTC date", async () => {
    const { meetCode } = await import("@/server/game/meet");
    const a = meetCode("luma", "2026-11-07");
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(meetCode("luma", "2026-11-07")).toBe(a);
    expect(meetCode("LUMA", "2026-11-07")).toBe(a);
    expect(meetCode("ember", "2026-11-07")).not.toBe(a);
    expect(meetCode("luma", "2026-11-08")).not.toBe(a);
  });

  it("rotate at 00:00 UTC: only today's code verifies", async () => {
    const { meetCode, verifyMeetCode } = await import("@/server/game/meet");
    const late = new Date("2026-11-07T23:59:59.999Z");
    const midnight = new Date("2026-11-08T00:00:00.000Z");
    const today = meetCode("luma", "2026-11-07");
    expect(verifyMeetCode("luma", today, late)).toBe(true);
    expect(verifyMeetCode("luma", today, midnight)).toBe(false);
    expect(verifyMeetCode("luma", meetCode("luma", "2026-11-08"), midnight)).toBe(true);
    expect(verifyMeetCode("ember", today, late)).toBe(false);
    expect(verifyMeetCode("luma", today.slice(0, 15), late)).toBe(false);
    expect(verifyMeetCode("luma", `${today.slice(0, 15)}${today.at(-1) === "A" ? "B" : "A"}`, late)).toBe(false);
    expect(verifyMeetCode("luma", "", late)).toBe(false);
  });

  it("the view carries the meet URL and the next rotation; another secret gives another code", async () => {
    const { meetCode, meetCodeView } = await import("@/server/game/meet");
    const now = new Date("2026-11-07T10:00:00Z");
    const v = meetCodeView("luma", now);
    expect(v).toEqual({ code: meetCode("luma", "2026-11-07"), url: `http://localhost:3000/meet/luma?c=${v.code}`, expiresAt: "2026-11-08T00:00:00.000Z" });
    await setEnv({ SESSION_SECRET: "another-session-secret-0123456789abcdef0123" });
    expect(meetCode("luma", "2026-11-07")).not.toBe(v.code);
  });
});

describe("walk prompt, diary weeks", () => {
  it("describes every walker the way its portrait does", async () => {
    const { walkPrompt } = await import("@/server/game/walks");
    const p = walkPrompt([
      { color: "ember orange", species: "fox", day: 2, equipped: { neck: "scarf" } },
      { color: "tide blue", species: "otter", day: 8, equipped: {} },
      { color: "ink black", species: "cat", day: 15, equipped: {} },
    ]);
    expect(p).toContain("a small ember orange fox hatchling, wearing a cozy hand-knitted cream and terracotta striped scarf");
    expect(p).toContain("a small tide blue otter sprite");
    expect(p).toContain("a small ink black cat guardian");
    expect(p).toContain("walking together through a lantern-lit night street");
    expect(p).toContain("storybook watercolor");
  });

  it("Seedream gets every reference portrait", async () => {
    const { ZeroGRouter } = await import("@/server/zerog/router");
    let body: { image?: string[] } = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgo=" }], x_0g_trace: { request_id: "r1" } }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const r = new ZeroGRouter({ token: "sk", baseUrl: "http://zg.test/v1", fetch: fetchImpl });
    await r.image("p", ["data:image/png;base64,AA", "data:image/png;base64,BB", "data:image/png;base64,CC"]);
    expect(body.image).toEqual(["data:image/png;base64,AA", "data:image/png;base64,BB", "data:image/png;base64,CC"]);
    await r.image("p", "data:image/png;base64,AA");
    expect(body.image).toEqual(["data:image/png;base64,AA"]);
    await r.image("p", []);
    expect(body.image).toBeUndefined();
  });

  it("ISO weeks map to Monday–Sunday and invalid weeks are refused", async () => {
    const { weekRange } = await import("@/server/familiar/diary");
    expect(weekRange("2026-W45")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekRange("2026-W01")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
    expect(weekRange("2026-W53")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(weekRange("2025-W53")).toBeNull(); // 2025 has 52 weeks
    expect(weekRange("2026-W00")).toBeNull();
    expect(weekRange("2026-45")).toBeNull();
  });
});

describe("push notifications", () => {
  type Mod = Record<string, (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>>;
  const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
  const gone = new Set<string>();

  beforeEach(async () => {
    sent.length = 0;
    const { setPushSenderForTests } = await import("@/server/push");
    setPushSenderForTests(async (sub, payload) => {
      if (gone.has(sub.endpoint)) return { statusCode: 410 };
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    });
  });
  afterAll(async () => {
    (await import("@/server/push")).setPushSenderForTests(null);
    await setEnv({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined });
  });

  const call = async (mod: Mod, method: string, cookie: string | null, json?: unknown) => {
    const headers: Record<string, string> = { "x-forwarded-for": "10.0.0.4" };
    if (cookie) headers.cookie = cookie;
    if (json !== undefined) headers["content-type"] = "application/json";
    const res = await mod[method]!(new Request("http://localhost:3000/api/push", { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }), { params: Promise.resolve({}) });
    return { status: res.status, body: await res.json() };
  };
  const cookieFor = async (session: { address: `0x${string}`; method: "wallet" }) => `familiar_session=${await (await import("@/server/auth/session")).issueSession(session)}`;
  const sub = (n: string) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

  it("is off without VAPID keys: no key, test sends nothing, the cron no-ops", async () => {
    await setEnv({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined });
    const keyRoute = (await import("@/app/api/push/key/route")) as unknown as Mod;
    expect((await call(keyRoute, "GET", null)).body).toEqual({ key: null });
    const { sendNeedPushes } = await import("@/server/push");
    expect(await sendNeedPushes()).toEqual({ familiars: 0, sent: 0, dropped: 0 });
    const { session } = await seedFamiliar();
    const testRoute = (await import("@/app/api/push/test/route")) as unknown as Mod;
    expect((await call(testRoute, "POST", await cookieFor(session))).body).toEqual({ sent: 0 });
  });

  it("subscribe / unsubscribe need a session and are idempotent; test push reaches every browser", async () => {
    await setEnv({ VAPID_PUBLIC_KEY: "BPublicKeyForTests", VAPID_PRIVATE_KEY: "private-key-for-tests" });
    const keyRoute = (await import("@/app/api/push/key/route")) as unknown as Mod;
    expect((await call(keyRoute, "GET", null)).body).toEqual({ key: "BPublicKeyForTests" });
    const subRoute = (await import("@/app/api/push/subscribe/route")) as unknown as Mod;
    const testRoute = (await import("@/app/api/push/test/route")) as unknown as Mod;
    const { f, session } = await seedFamiliar();
    const cookie = await cookieFor(session);
    expect((await call(subRoute, "POST", null, sub("x"))).status).toBe(401);
    expect((await call(subRoute, "POST", cookie, { endpoint: "http://insecure.example/x", keys: sub("x").keys })).status).toBe(400);
    expect((await call(subRoute, "POST", cookie, sub(`${f.label}-1`))).body).toEqual({ ok: true });
    expect((await call(subRoute, "POST", cookie, sub(`${f.label}-1`))).body).toEqual({ ok: true }); // same endpoint: upsert
    expect((await call(subRoute, "POST", cookie, sub(`${f.label}-2`))).body).toEqual({ ok: true });
    expect((await call(testRoute, "POST", cookie)).body).toEqual({ sent: 2 });
    expect(sent.map((s) => s.endpoint).sort()).toEqual([`https://push.example/${f.label}-1`, `https://push.example/${f.label}-2`]);
    expect(sent[0]!.payload).toMatchObject({ title: "Familiar", url: `/f/${f.label}` });
    expect((await call(subRoute, "DELETE", cookie, { endpoint: `https://push.example/${f.label}-2` })).body).toEqual({ ok: true });
    expect((await call(subRoute, "DELETE", cookie, { endpoint: `https://push.example/${f.label}-2` })).body).toEqual({ ok: true });
    sent.length = 0;
    expect((await call(testRoute, "POST", cookie)).body).toEqual({ sent: 1 });
  });

  it("the cron nudges a hungry Familiar's owner once per 12 h and drops dead subscriptions", async () => {
    await setEnv({ VAPID_PUBLIC_KEY: "BPublicKeyForTests", VAPID_PRIVATE_KEY: "private-key-for-tests" });
    const { sendNeedPushes, subscribe } = await import("@/server/push");
    const now = new Date();
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
    // Hungry: no snack for 20 h (petted and visited recently so hunger is the need).
    const hungry = await seedFamiliar({ createdAt: ago(48), lastSnackAt: ago(20), lastPetAt: ago(0.1), lastVisitAt: ago(1), lastVisitDate: now.toISOString().slice(0, 10) });
    // Content and recently visited: nothing to say.
    const happy = await seedFamiliar({ createdAt: ago(1), lastVisitAt: ago(0.5), lastVisitDate: now.toISOString().slice(0, 10) });
    // Hungry but nudged 2 h ago.
    const nudged = await seedFamiliar({ createdAt: ago(48), lastSnackAt: ago(20), lastNeedPushAt: ago(2) });
    // Hungry, but its only browser unsubscribed at the push service.
    const deadSub = await seedFamiliar({ createdAt: ago(48), lastSnackAt: ago(20), lastPetAt: ago(0.1), lastVisitAt: ago(1), lastVisitDate: now.toISOString().slice(0, 10) });
    const { db: openDb, schema: sch } = await import("@/server/db/client");
    await (await openDb()).delete(sch.pushSubscriptions); // only this test's browsers
    for (const x of [hungry, happy, nudged, deadSub]) await subscribe(x.session, sub(`cron-${x.f.label}`));
    gone.add(`https://push.example/cron-${deadSub.f.label}`);

    const first = await sendNeedPushes(now);
    expect(first).toMatchObject({ familiars: 2, sent: 1, dropped: 1 });
    expect(sent).toEqual([{ endpoint: `https://push.example/cron-${hungry.f.label}`, payload: { title: "Familiar", body: `${hungry.f.label}: I'm starving. Dramatically.`, url: `/f/${hungry.f.label}` } }]);

    const { db, schema } = await import("@/server/db/client");
    const { eq } = await import("drizzle-orm");
    const d = await db();
    expect(await d.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, `https://push.example/cron-${deadSub.f.label}`))).toEqual([]);
    const [row] = await d.select().from(schema.familiars).where(eq(schema.familiars.id, hungry.f.id));
    expect(row!.lastNeedPushAt?.getTime()).toBe(now.getTime());

    sent.length = 0;
    expect(await sendNeedPushes(new Date(now.getTime() + 3600_000))).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it("an unvisited Familiar asks for its visit after 18:00 UTC", async () => {
    const { needCopy, pushReason } = await import("@/server/push");
    // Hatched an hour ago, never visited: meters are full, so only the evening rule can fire.
    const fresh = { lastPetAt: null, lastSnackAt: null, lastPlayAt: null, lastVisitAt: null, lastVisitDate: null, createdAt: new Date("2026-11-07T17:00:00Z") };
    expect(pushReason(fresh, new Date("2026-11-07T17:59:00Z"))).toBeNull();
    expect(pushReason({ ...fresh, createdAt: new Date("2026-11-07T18:00:00Z") }, new Date("2026-11-07T19:00:00Z"))).toBe("visit");
    expect(pushReason({ ...fresh, createdAt: new Date("2026-11-07T18:00:00Z"), lastVisitAt: new Date("2026-11-07T18:30:00Z"), lastVisitDate: "2026-11-07" }, new Date("2026-11-07T19:00:00Z"))).toBeNull();
    // Long unvisited: energy runs out first.
    expect(pushReason({ ...fresh, lastVisitDate: "2026-11-05", lastVisitAt: new Date("2026-11-05T20:00:00Z"), lastSnackAt: new Date("2026-11-07T10:00:00Z"), lastPetAt: new Date("2026-11-07T10:00:00Z") }, new Date("2026-11-07T12:00:00Z"))).toBe("sleepy");
    expect(needCopy("luma", "hungry")).toEqual({ title: "Familiar", body: "luma: I'm starving. Dramatically.", url: "/f/luma" });
  });
});
