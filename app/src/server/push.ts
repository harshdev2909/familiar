import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { WebPushError, sendNotification } from "web-push";
import type { Session } from "./auth/session";
import { db, schema } from "./db/client";
import { env } from "./env";
import { utcDate } from "./familiar/rules";
import { type Need, careView } from "./game/meters";
import { log } from "./log";

/**
 * Web Push (VAPID). Off unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set: every entry point
 * then no-ops. The reconcile cron nudges owners whose Familiar needs them (at most every 12 h).
 */
export const PUSH = {
  needEveryMs: 12 * 3600_000,
  /** After this UTC hour, a Familiar not visited today asks for its visit. */
  eveningHourUtc: 18,
  maxSubscriptionsPerOwner: 10,
  concurrency: 10,
  batch: 500,
  ttlSec: 12 * 3600,
} as const;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Delivers one encrypted push; resolves with the push service's HTTP status. */
export type PushSender = (sub: PushTarget, payload: string) => Promise<{ statusCode: number }>;

export const pushConfigured = () => Boolean(env().VAPID_PUBLIC_KEY && env().VAPID_PRIVATE_KEY);
export const pushPublicKey = () => (pushConfigured() ? env().VAPID_PUBLIC_KEY! : null);

/** Push services require an https: or mailto: contact; a plain-http APP_URL (dev) falls back to mailto. */
function vapidSubject() {
  const s = env().VAPID_SUBJECT ?? env().APP_URL;
  return s.startsWith("https:") || s.startsWith("mailto:") ? s : "mailto:push@familiar.invalid";
}

const webPushSender: PushSender = async (sub, payload) => {
  try {
    const res = await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      vapidDetails: { subject: vapidSubject(), publicKey: env().VAPID_PUBLIC_KEY!, privateKey: env().VAPID_PRIVATE_KEY! },
      TTL: PUSH.ttlSec,
      timeout: 10_000,
    });
    return { statusCode: res.statusCode };
  } catch (e) {
    if (e instanceof WebPushError) return { statusCode: e.statusCode };
    throw e;
  }
};

let sender: PushSender = webPushSender;

/** Test hook: replace the network sender (null restores web-push). */
export function setPushSenderForTests(s: PushSender | null) {
  sender = s ?? webPushSender;
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i]!);
      }
    }),
  );
  return out;
}

type SubRow = typeof schema.pushSubscriptions.$inferSelect;

/** Send one payload to many subscriptions; drop the ones the push service says are gone (404/410). */
async function deliver(jobs: { sub: SubRow; payload: PushPayload }[]) {
  if (!jobs.length) return { sent: 0, dropped: 0 };
  const results = await mapLimit(jobs, PUSH.concurrency, async ({ sub, payload }) => {
    try {
      return { sub, code: (await sender(sub, JSON.stringify(payload))).statusCode };
    } catch (e) {
      log.warn("push_failed", { error: e instanceof Error ? e.message : String(e) });
      return { sub, code: 0 };
    }
  });
  const d = await db();
  const t = schema.pushSubscriptions;
  const gone = results.filter((r) => r.code === 404 || r.code === 410).map((r) => r.sub.id);
  const ok = results.filter((r) => r.code >= 200 && r.code < 300).map((r) => r.sub.id);
  if (gone.length) await d.delete(t).where(inArray(t.id, gone));
  if (ok.length) await d.update(t).set({ lastSentAt: new Date() }).where(inArray(t.id, ok));
  return { sent: ok.length, dropped: gone.length };
}

/** Save (or move to this owner) a browser's push subscription. Keeps the newest 10 per owner. */
export async function subscribe(session: Session, input: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const owner = session.address.toLowerCase();
  const d = await db();
  const t = schema.pushSubscriptions;
  await d
    .insert(t)
    .values({ owner, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth })
    .onConflictDoUpdate({ target: t.endpoint, set: { owner, p256dh: input.keys.p256dh, auth: input.keys.auth, createdAt: new Date() } });
  const keep = d.select({ id: t.id }).from(t).where(eq(t.owner, owner)).orderBy(desc(t.createdAt)).limit(PUSH.maxSubscriptionsPerOwner);
  await d.delete(t).where(and(eq(t.owner, owner), notInArray(t.id, keep)));
  return { ok: true as const };
}

export async function unsubscribe(session: Session, endpoint: string) {
  const d = await db();
  const t = schema.pushSubscriptions;
  await d.delete(t).where(and(eq(t.endpoint, endpoint), eq(t.owner, session.address.toLowerCase())));
  return { ok: true as const };
}

/** Send a test notification to every subscription of the caller. */
export async function sendTest(session: Session) {
  if (!pushConfigured()) return { sent: 0 };
  const owner = session.address.toLowerCase();
  const d = await db();
  const [subs, fam] = await Promise.all([
    d.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.owner, owner)),
    d.query.familiars.findFirst({ where: eq(schema.familiars.owner, owner), columns: { label: true } }),
  ]);
  const label = fam?.label ?? "your familiar";
  const payload: PushPayload = { title: "Familiar", body: `${label}: testing, testing… can you hear me purr?`, url: fam ? `/f/${fam.label}` : "/" };
  const { sent } = await deliver(subs.map((sub) => ({ sub, payload })));
  return { sent };
}

export type PushReason = Need | "visit";

/** The sassy line for each need. */
export function needCopy(label: string, reason: PushReason): PushPayload {
  const body = {
    hungry: `${label}: I'm starving. Dramatically.`,
    lonely: `${label}: nobody has petted me in hours. I'm fine. I'm not fine.`,
    sleepy: `${label}: I waited up for you and now I can barely keep my eyes open.`,
    visit: `${label}: it's night and you haven't told me about your day. Rude.`,
  }[reason];
  return { title: "Familiar", body, url: `/f/${label}` };
}

/** Why this Familiar should nudge its owner right now, if at all. */
export function pushReason(f: Parameters<typeof careView>[0], now = new Date()): PushReason | null {
  const need = careView(f, now).need;
  if (need) return need;
  if (f.lastVisitDate !== utcDate(now) && now.getUTCHours() >= PUSH.eveningHourUtc) return "visit";
  return null;
}

/**
 * Cron: one "I need you" push per Familiar per 12 h, to owners with a subscription, when it is
 * hungry/lonely/sleepy or hasn't been visited today after 18:00 UTC. Claims each Familiar
 * (last_need_push_at) before sending so overlapping cron runs never double-send.
 */
export async function sendNeedPushes(now = new Date()) {
  if (!pushConfigured()) return { familiars: 0, sent: 0, dropped: 0 };
  const d = await db();
  const f = schema.familiars;
  const t = schema.pushSubscriptions;
  const cutoff = new Date(now.getTime() - PUSH.needEveryMs);
  const notRecently = or(isNull(f.lastNeedPushAt), lt(f.lastNeedPushAt, cutoff));
  const candidates = await d
    .select({
      id: f.id,
      label: f.label,
      owner: f.owner,
      lastPetAt: f.lastPetAt,
      lastSnackAt: f.lastSnackAt,
      lastPlayAt: f.lastPlayAt,
      lastVisitAt: f.lastVisitAt,
      lastVisitDate: f.lastVisitDate,
      createdAt: f.createdAt,
    })
    .from(f)
    .where(and(notRecently, gt(f.expiresAt, now), sql`${f.owner} in (select ${t.owner} from ${t})`))
    .limit(PUSH.batch);
  const due = candidates.flatMap((c) => {
    const reason = pushReason(c, now);
    return reason ? [{ ...c, reason }] : [];
  });
  if (!due.length) return { familiars: 0, sent: 0, dropped: 0 };
  const claimed = await d
    .update(f)
    .set({ lastNeedPushAt: now })
    .where(and(inArray(f.id, due.map((x) => x.id)), notRecently))
    .returning({ id: f.id });
  const claimedIds = new Set(claimed.map((x) => x.id));
  const mine = due.filter((x) => claimedIds.has(x.id));
  if (!mine.length) return { familiars: 0, sent: 0, dropped: 0 };
  const subs = await d.select().from(t).where(inArray(t.owner, [...new Set(mine.map((x) => x.owner))]));
  const jobs = mine.flatMap((x) => {
    const payload = needCopy(x.label, x.reason);
    return subs.filter((s) => s.owner === x.owner).map((sub) => ({ sub, payload }));
  });
  const res = await deliver(jobs);
  log.info("need_pushes", { familiars: mine.length, ...res });
  return { familiars: mine.length, ...res };
}
