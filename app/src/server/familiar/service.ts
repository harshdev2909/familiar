import "server-only";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { type Address, type Hex, getAddress } from "viem";
import type { Session } from "../auth/session";
import { requestIdsHash, logDayOnchain } from "../chain/dayLog";
import { hatchOnchain, nodeOf, normalizeLabel, readFamiliar, recordVisitOnchain, wakeOnchain, writeAgentRecords } from "../chain/ens";
import { type DB, db, schema } from "../db/client";
import { demoLabels, env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";
import { imageType, storeMedia } from "../media";
import { decryptMemory, encryptMemory, persistMemory } from "../zerog/memory";
import { type Receipt, ZeroGRouter } from "../zerog/router";
import { type VisitKind, runPipeline } from "./pipeline";
import { COLORS, SPECIES, defaultLook, isEvolutionDay, nextStreak, stageFor, styleSeed, utcDate } from "./rules";
import { familiarView, galleryView, visitView } from "./views";

type FamiliarRow = typeof schema.familiars.$inferSelect;
type VisitRow = typeof schema.visits.$inferSelect;

export interface AudioInput {
  blob: Blob;
  filename: string;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export async function getFamiliarRow(label: string): Promise<FamiliarRow | undefined> {
  const d = await db();
  return d.query.familiars.findFirst({ where: eq(schema.familiars.label, label) });
}

async function requireFamiliar(label: string): Promise<FamiliarRow> {
  const f = await getFamiliarRow(normalizeLabel(label));
  if (!f) throw new AppError("NOT_FOUND", "No Familiar with that name");
  return f;
}

export async function feedCredits(familiarId: string, d?: DB): Promise<number> {
  const conn = d ?? (await db());
  const [row] = await conn
    .select({ n: sql<number>`coalesce(sum(${schema.feeds.visitsCredited} - ${schema.feeds.visitsUsed}), 0)::int` })
    .from(schema.feeds)
    .where(eq(schema.feeds.familiarId, familiarId));
  return Number(row?.n ?? 0);
}

export async function familiarState(label: string) {
  const f = await requireFamiliar(label);
  return familiarView(f, { feedCredits: await feedCredits(f.id) });
}

export async function familiarOf(owner: Address) {
  const d = await db();
  const f = await d.query.familiars.findFirst({ where: eq(schema.familiars.owner, owner.toLowerCase()) });
  return f ? familiarView(f, { feedCredits: await feedCredits(f.id) }) : null;
}

export async function history(label: string, viewer: Address | null, limit = 30) {
  const f = await requireFamiliar(label);
  const d = await db();
  const rows = await d.query.visits.findMany({
    where: and(eq(schema.visits.familiarId, f.id), inArray(schema.visits.status, ["chain_pending", "complete"])),
    orderBy: desc(schema.visits.day),
    limit: Math.min(Math.max(limit, 1), 100),
  });
  const isOwner = viewer?.toLowerCase() === f.owner;
  if (!isOwner) return { owner: false as const, visits: rows.map(galleryView) };
  const receipts = rows.length
    ? await d.query.receipts.findMany({ where: inArray(schema.receipts.visitId, rows.map((r) => r.id)), orderBy: asc(schema.receipts.createdAt) })
    : [];
  return { owner: true as const, visits: rows.map((v) => visitView(v, receipts.filter((r) => r.visitId === v.id))) };
}

export async function getVisit(id: string, viewer: Address) {
  const d = await db();
  const v = await d.query.visits.findFirst({ where: eq(schema.visits.id, id) });
  if (!v) throw new AppError("NOT_FOUND", "Visit not found");
  const f = await d.query.familiars.findFirst({ where: eq(schema.familiars.id, v.familiarId) });
  if (f?.owner !== viewer.toLowerCase()) throw new AppError("NOT_FOUND", "Visit not found");
  const receipts = await d.query.receipts.findMany({ where: eq(schema.receipts.visitId, id), orderBy: asc(schema.receipts.createdAt) });
  return { visit: visitView(v, receipts), familiar: familiarView(f, { feedCredits: await feedCredits(f.id) }) };
}

export async function checkName(raw: string) {
  const label = normalizeLabel(raw);
  const [row, onchain] = await Promise.all([getFamiliarRow(label), readFamiliar(label)]);
  return { label, available: !row && !onchain.exists };
}

// ---------------------------------------------------------------------------------------------
// Hatch
// ---------------------------------------------------------------------------------------------

export async function hatch(session: Session, input: { name: string; species?: string; color?: string; audio: AudioInput }) {
  const label = normalizeLabel(input.name);
  const owner = getAddress(session.address);
  const d = await db();

  const mine = await d.query.familiars.findFirst({ where: eq(schema.familiars.owner, owner.toLowerCase()) });
  if (mine) throw new AppError("ALREADY_HAS_FAMILIAR", `You already have ${mine.label}.familiar.eth`, { label: mine.label });
  if (await getFamiliarRow(label)) throw new AppError("NAME_TAKEN", "That name is taken");

  const look = defaultLook(label);
  const species = input.species ?? look.species;
  const color = input.color ?? look.color;
  if (!(SPECIES as readonly string[]).includes(species)) throw new AppError("BAD_REQUEST", `species must be one of ${SPECIES.join(", ")}`);
  if (!(COLORS as readonly string[]).includes(color)) throw new AppError("BAD_REQUEST", `color must be one of ${COLORS.join(", ")}`);

  // Idempotent onchain step: adopt a hatch that landed onchain but never reached the DB.
  const onchain = await readFamiliar(label);
  let hatched: { resolver: Address; generation: number; expiresAt: Date; txHash: Hex | null };
  if (onchain.exists) {
    if (onchain.bondedOwner.toLowerCase() !== owner.toLowerCase() || onchain.dormant || onchain.day > 0) {
      throw new AppError("NAME_TAKEN", "That name is taken");
    }
    hatched = { resolver: onchain.resolver, generation: onchain.generation, expiresAt: onchain.expiresAt, txHash: null };
    log.warn("hatch_adopted", { label });
  } else {
    hatched = await hatchOnchain(label, owner);
  }

  await d.insert(schema.users).values({ address: owner.toLowerCase(), privyUserId: session.privyUserId }).onConflictDoNothing();
  let familiar: FamiliarRow;
  try {
    [familiar] = (await d
      .insert(schema.familiars)
      .values({
        label,
        ensNode: nodeOf(label),
        owner: owner.toLowerCase(),
        species,
        color,
        styleSeed: styleSeed(species, color),
        resolver: hatched.resolver,
        generation: hatched.generation,
        expiresAt: hatched.expiresAt,
        hatchTx: hatched.txHash,
      })
      .returning()) as [FamiliarRow];
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "That name or owner was just taken");
    throw e;
  }

  const result = await runVisit({ session, familiar, kind: "hatch", audio: input.audio, payment: "free-or-iai" });
  return { ...result, hatchTx: hatched.txHash };
}

// ---------------------------------------------------------------------------------------------
// Visit / wake
// ---------------------------------------------------------------------------------------------

export async function visit(session: Session, rawLabel: string, audio: AudioInput) {
  const familiar = await requireOwned(session, rawLabel);
  if (familiar.expiresAt.getTime() <= Date.now()) {
    throw new AppError("DORMANT", `${familiar.label} is asleep — wake it up first`, { label: familiar.label });
  }
  enforceDaily(familiar);
  return runVisit({ session, familiar, kind: "visit", audio, payment: "required" });
}

export async function wake(session: Session, rawLabel: string, audio?: AudioInput) {
  let familiar = await requireOwned(session, rawLabel);
  const onchain = await readFamiliar(familiar.label);
  if (!onchain.dormant) throw new AppError("NOT_DORMANT", `${familiar.label} is awake`);
  // Reserve payment before the onchain re-hatch, so a wake is never free.
  const payment = await reservePayment(session, familiar);
  try {
    const woke = await wakeOnchain(familiar.label);
    const d = await db();
    [familiar] = (await d
      .update(schema.familiars)
      .set({ resolver: woke.resolver, generation: woke.generation, expiresAt: woke.expiresAt, streak: 0, updatedAt: new Date() })
      .where(eq(schema.familiars.id, familiar.id))
      .returning()) as [FamiliarRow];
  } catch (e) {
    await releasePayment(payment);
    throw e;
  }
  return runVisit({ session, familiar, kind: "wake", audio, payment: "reserved", reserved: payment });
}

async function requireOwned(session: Session, rawLabel: string) {
  const f = await requireFamiliar(rawLabel);
  if (f.owner !== session.address.toLowerCase()) throw new AppError("FORBIDDEN", "This Familiar is bonded to someone else");
  return f;
}

function enforceDaily(f: FamiliarRow) {
  if (demoLabels().has(f.label)) return;
  if (env().VISITS_PER_DAY <= 1 && f.lastVisitDate === utcDate()) {
    throw new AppError("ALREADY_VISITED_TODAY", `${f.label} already heard from you today — come back after 00:00 UTC`);
  }
}

type Payment = { kind: "iai" } | { kind: "feed"; feedId: string } | { kind: "free" };

async function reservePayment(session: Session, f: FamiliarRow): Promise<Payment> {
  if (session.method === "iai") {
    if (!session.zgUserToken) throw new AppError("UNAUTHENTICATED", "0G session missing — sign in with 0G again");
    return { kind: "iai" };
  }
  const d = await db();
  const t = schema.feeds;
  const [row] = await d
    .update(t)
    .set({ visitsUsed: sql`${t.visitsUsed} + 1` })
    .where(
      and(
        sql`${t.id} = (select id from feeds where familiar_id = ${f.id} and visits_used < visits_credited order by created_at limit 1 for update skip locked)`,
        lt(t.visitsUsed, t.visitsCredited),
      ),
    )
    .returning({ id: t.id });
  if (!row) {
    throw new AppError("PAYMENT_REQUIRED", `${f.label} is hungry — feed it to visit`, { label: f.label, howToPay: ["iai", "feed"] });
  }
  return { kind: "feed", feedId: row.id };
}

async function releasePayment(p: Payment) {
  if (p.kind !== "feed") return;
  const d = await db();
  await d
    .update(schema.feeds)
    .set({ visitsUsed: sql`greatest(${schema.feeds.visitsUsed} - 1, 0)` })
    .where(eq(schema.feeds.id, p.feedId));
}

function routerFor(session: Session, payment: Payment, clientRequestId: string) {
  if (payment.kind === "iai") return new ZeroGRouter({ token: session.zgUserToken!, clientRequestId });
  return ZeroGRouter.team(clientRequestId);
}

interface RunVisit {
  session: Session;
  familiar: FamiliarRow;
  kind: VisitKind;
  audio?: AudioInput;
  /** hatch: free (team covers it) unless signed in with 0G; visit: must pay; wake: already reserved. */
  payment: "free-or-iai" | "required" | "reserved";
  reserved?: Payment;
}

/**
 * The nightly visit. AI runs synchronously (the response carries the new portrait and reply);
 * onchain writes run afterwards via `finalizeChain` and are retried by the reconcile cron.
 */
async function runVisit(r: RunVisit) {
  const d = await db();
  const f = r.familiar;
  const payment: Payment =
    r.reserved ??
    (r.payment === "free-or-iai"
      ? r.session.method === "iai" && r.session.zgUserToken
        ? { kind: "iai" }
        : { kind: "free" }
      : await reservePayment(r.session, f));

  const day = f.day + 1;
  let visitRow: VisitRow;
  try {
    [visitRow] = (await d
      .insert(schema.visits)
      .values({
        familiarId: f.id,
        day,
        utcDate: utcDate(),
        kind: r.kind,
        paidBy: payment.kind,
        feedId: payment.kind === "feed" ? payment.feedId : null,
        status: "running",
      })
      .returning()) as [VisitRow];
  } catch (e) {
    await releasePayment(payment);
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "A visit is already in progress");
    throw e;
  }

  const receipts: Receipt[] = [];
  try {
    const router = routerFor(r.session, payment, visitRow.id);
    const memory = await decryptMemory(f.ensNode as Hex, f.memoryCiphertext);
    const out = await runPipeline({
      router,
      name: f.label,
      kind: r.kind,
      day,
      stage: stageFor(day),
      styleSeed: f.styleSeed,
      memory,
      audio: r.audio,
      previousPortrait: f.portraitUrl,
      onReceipt: async (rc) => {
        receipts.push(rc);
        await d.insert(schema.receipts).values({ visitId: visitRow.id, ...rc });
      },
    });

    const { contentType, ext } = imageType(out.image);
    const portrait = await storeMedia(`portraits/${f.label}/day-${day}-g${f.generation}.${ext}`, out.image, contentType);
    const sealed = await encryptMemory(f.ensNode as Hex, out.thought.memory_update);
    const mem = await persistMemory(sealed);
    const reqHash = requestIdsHash(out.receipts.map((x) => x.requestId));
    const today = utcDate();

    [visitRow] = (await d
      .update(schema.visits)
      .set({
        status: "chain_pending",
        transcriptHash: out.transcriptHash,
        mood: out.thought.mood,
        reply: out.thought.reply,
        imageUrl: portrait.url,
        imageHash: portrait.hash,
        memoryRoot: mem.root,
        requestIdsHash: reqHash,
        videoStatus: isEvolutionDay(day) ? "pending" : "none",
      })
      .where(eq(schema.visits.id, visitRow.id))
      .returning()) as [VisitRow];

    const [updated] = (await d
      .update(schema.familiars)
      .set({
        day,
        streak: nextStreak(f.lastVisitDate, f.streak, today),
        lastVisitDate: today,
        mood: out.thought.mood,
        portraitUrl: portrait.url,
        memoryCiphertext: sealed,
        memoryRoot: mem.root,
        updatedAt: new Date(),
      })
      .where(eq(schema.familiars.id, f.id))
      .returning()) as [FamiliarRow];

    const savedReceipts = await d.query.receipts.findMany({ where: eq(schema.receipts.visitId, visitRow.id), orderBy: asc(schema.receipts.createdAt) });
    return {
      visit: visitView(visitRow, savedReceipts),
      familiar: familiarView(updated, { feedCredits: await feedCredits(f.id) }),
      memory: { root: mem.root, onZeroGStorage: mem.onZeroGStorage },
      evolve: isEvolutionDay(day) ? { visitId: visitRow.id, portraitUrl: portrait.url, prompt: out.imagePrompt, iai: payment.kind === "iai" } : null,
    };
  } catch (e) {
    // AI step failed: refund the visit and free the day number. Receipts are logged for audit
    // (0G may have billed completed steps) before the row is removed.
    log.error("visit_failed", { visitId: visitRow.id, label: f.label, receipts, error: e instanceof Error ? e.message : String(e) });
    await d.delete(schema.receipts).where(eq(schema.receipts.visitId, visitRow.id));
    await d.delete(schema.visits).where(eq(schema.visits.id, visitRow.id));
    await releasePayment(payment);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Onchain finalization (idempotent; safe to retry from the cron)
// ---------------------------------------------------------------------------------------------

export async function finalizeChain(visitId: string): Promise<VisitRow> {
  const d = await db();
  let v = await d.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
  if (!v) throw new AppError("NOT_FOUND", "Visit not found");
  if (v.status !== "chain_pending") return v;
  const f = (await d.query.familiars.findFirst({ where: eq(schema.familiars.id, v.familiarId) }))!;
  await d.update(schema.visits).set({ chainAttempts: sql`${schema.visits.chainAttempts} + 1` }).where(eq(schema.visits.id, v.id));

  const patch: Partial<VisitRow> = {};
  try {
    const onchain = await readFamiliar(f.label);
    if (onchain.day < v.day) {
      const renewed = await recordVisitOnchain(f.label);
      patch.renewTx = renewed.txHash;
      await d.update(schema.familiars).set({ expiresAt: renewed.expiresAt }).where(eq(schema.familiars.id, f.id));
    }
    if (!v.recordsTx) {
      patch.recordsTx = (await writeAgentRecords(f.label, f.resolver as Address, { avatar: v.imageUrl ?? undefined, mood: v.mood ?? undefined, day: String(v.day) })) ?? null;
    }
    if (!v.logTx) {
      patch.logTx =
        (await logDayOnchain({
          node: f.ensNode as Hex,
          day: v.day,
          reqHash: v.requestIdsHash as Hex,
          imageHash: v.imageHash as Hex,
          memoryRoot: v.memoryRoot as Hex,
        })) ?? null;
    }
    [v] = (await d
      .update(schema.visits)
      .set({ ...patch, status: "complete", completedAt: new Date(), lastError: null })
      .where(eq(schema.visits.id, v.id))
      .returning()) as [VisitRow];
    log.info("visit_finalized", { visitId: v.id, label: f.label, day: v.day });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    [v] = (await d.update(schema.visits).set({ ...patch, lastError: message.slice(0, 500) }).where(eq(schema.visits.id, v.id)).returning()) as [VisitRow];
    log.error("visit_finalize_failed", { visitId: v.id, label: f.label, error: message });
  }
  return v;
}

/** Submit the Seedance evolution clip for a 7th-day visit. */
export async function startEvolution(e: { visitId: string; portraitUrl: string; prompt: string }, router: ZeroGRouter) {
  const d = await db();
  try {
    const { jobId, receipt } = await router.submitVideo(`${e.prompt}. The creature grows into its next form, gentle magical transformation, slow camera push-in.`, e.portraitUrl);
    await d.insert(schema.receipts).values({ visitId: e.visitId, ...receipt });
    await d.update(schema.visits).set({ videoJobId: jobId, videoStatus: "pending" }).where(eq(schema.visits.id, e.visitId));
  } catch (err) {
    log.error("evolution_submit_failed", { visitId: e.visitId, error: err instanceof Error ? err.message : String(err) });
    await d.update(schema.visits).set({ videoStatus: "failed" }).where(eq(schema.visits.id, e.visitId));
  }
}

/** Poll a pending evolution clip; on completion, store it and return the updated visit. */
export async function pollEvolution(visitId: string) {
  const d = await db();
  const v = await d.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
  if (!v?.videoJobId || v.videoStatus !== "pending") return v;
  const f = (await d.query.familiars.findFirst({ where: eq(schema.familiars.id, v.familiarId) }))!;
  const res = await ZeroGRouter.team(v.id).pollVideo(v.videoJobId);
  if (res.status === "pending") return v;
  if (res.status === "failed") {
    const [u] = await d.update(schema.visits).set({ videoStatus: "failed" }).where(eq(schema.visits.id, v.id)).returning();
    return u;
  }
  const clip = await storeMedia(`clips/${f.label}/day-${v.day}.mp4`, res.bytes, "video/mp4");
  const [u] = await d.update(schema.visits).set({ videoStatus: "done", videoUrl: clip.url }).where(eq(schema.visits.id, v.id)).returning();
  return u;
}

export function isUniqueViolation(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    if ((x as { code?: string }).code === "23505") return true;
  }
  return false;
}
