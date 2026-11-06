import type { schema } from "../db/client";
import { explorer } from "../chain/clients";
import { demoLabels } from "../env";
import { fullName } from "../chain/ens";
import { type Stage, isEvolutionDay, nextRefresh, stageFor, utcDate } from "./rules";
import { activeFestival, itemById } from "../game/catalog";
import { levelFor } from "../game/progress";
import { type CareView, careView } from "../game/meters";
import { env } from "../env";

type FamiliarRow = typeof schema.familiars.$inferSelect;
type VisitRow = typeof schema.visits.$inferSelect;
type ReceiptRow = typeof schema.receipts.$inferSelect;

export interface FamiliarView {
  label: string;
  name: string;
  node: string;
  owner: string;
  species: string;
  color: string;
  stage: Stage;
  day: number;
  streak: number;
  generation: number;
  mood: string | null;
  portraitUrl: string | null;
  resolver: string;
  expiresAt: string;
  dormant: boolean;
  /** Seconds until the name expires (0 when dormant). */
  expiresInSec: number;
  visitedToday: boolean;
  nextVisitIsEvolution: boolean;
  /** Next 00:00 UTC — the iAI credit refresh the countdown shows. */
  creditsRefreshAt: string;
  /** Prepaid visits from Uniswap feeds that are not used yet. */
  feedCredits: number;
  /** Demo Familiar: visits are free and not limited to one per night. */
  demo: boolean;
  sparks: number;
  level: { level: number; xp: number; intoLevel: number; levelSize: number; toNext: number };
  equipped: { slot: string; id: string; name: string; art: string }[];
  spunToday: boolean;
  festival: { id: string; name: string; end: string } | null;
  /** Tamagotchi meters, derived from the last care actions. */
  care: CareView;
  links: { ens: string; resolver: string };
}

export function familiarView(f: FamiliarRow, opts: { feedCredits: number; now?: Date; demo?: boolean }): FamiliarView {
  const now = opts.now ?? new Date();
  const dormant = f.expiresAt.getTime() <= now.getTime();
  return {
    label: f.label,
    name: fullName(f.label),
    node: f.ensNode,
    owner: f.owner,
    species: f.species,
    color: f.color,
    stage: stageFor(f.day),
    day: f.day,
    streak: f.streak,
    generation: f.generation,
    mood: f.mood,
    portraitUrl: dormant ? null : f.portraitUrl,
    resolver: f.resolver,
    expiresAt: f.expiresAt.toISOString(),
    dormant,
    expiresInSec: Math.max(0, Math.floor((f.expiresAt.getTime() - now.getTime()) / 1000)),
    visitedToday: f.lastVisitDate === utcDate(now),
    nextVisitIsEvolution: isEvolutionDay(f.day + 1),
    creditsRefreshAt: nextRefresh(now).toISOString(),
    feedCredits: opts.feedCredits,
    demo: opts.demo ?? demoLabels().has(f.label),
    sparks: f.sparks,
    level: levelFor(f.xp),
    equipped: Object.entries(f.equipped ?? {}).flatMap(([slot, id]) => {
      const item = itemById(id);
      return item ? [{ slot, id, name: item.name, art: item.art }] : [];
    }),
    spunToday: f.lastSpinDate === utcDate(now),
    festival: (() => {
      const fest = activeFestival(utcDate(now), env().FESTIVAL);
      return fest ? { id: fest.id, name: fest.name, end: fest.end } : null;
    })(),
    care: careView(f, now),
    links: { ens: `/api/ens/${f.label}`, resolver: explorer.sepoliaAddress(f.resolver) },
  };
}

export interface ReceiptView {
  step: string;
  model: string;
  requestId: string;
  latencyMs: number;
  /** Raw billed cost in `costCurrency` units (micro-USD for "usd", neuron for "0g"). */
  cost: string | null;
  costCurrency: string | null;
  /** Cost in USD, when the account is USD-settled. */
  costUsd: number | null;
  provider: string | null;
  /** true when the router verified the provider's TEE signature; null for non-TEE providers. */
  teeVerified: boolean | null;
}

export const receiptView = (r: ReceiptRow): ReceiptView => ({
  step: r.step,
  model: r.model,
  requestId: r.requestId,
  latencyMs: r.latencyMs,
  cost: r.cost,
  costCurrency: r.costCurrency,
  costUsd: r.cost && r.costCurrency === "usd" ? Number(r.cost) / 1e6 : null,
  provider: r.provider,
  teeVerified: r.teeVerified,
});

export interface VisitView {
  id: string;
  day: number;
  date: string;
  kind: VisitRow["kind"];
  paidBy: VisitRow["paidBy"];
  status: VisitRow["status"];
  mood: string | null;
  reply: string | null;
  imageUrl: string | null;
  /** MP3 of the reply spoken in the Familiar's voice. */
  replyAudioUrl: string | null;
  video: { status: VisitRow["videoStatus"]; url: string | null };
  receipts: ReceiptView[];
  /** keccak256(requestIds.join(",")) — matches the Day event on 0G Chain. */
  requestIdsHash: string | null;
  chain: {
    renewTx: string | null;
    recordsTx: string | null;
    logTx: string | null;
    links: { renew: string | null; records: string | null; log: string | null };
    lastError: string | null;
  };
  createdAt: string;
}

export function visitView(v: VisitRow, receipts: ReceiptRow[]): VisitView {
  return {
    id: v.id,
    day: v.day,
    date: v.utcDate,
    kind: v.kind,
    paidBy: v.paidBy,
    status: v.status,
    mood: v.mood,
    reply: v.reply,
    imageUrl: v.imageUrl,
    replyAudioUrl: v.replyAudioUrl,
    video: { status: v.videoStatus, url: v.videoUrl },
    receipts: receipts.map(receiptView),
    requestIdsHash: v.requestIdsHash,
    chain: {
      renewTx: v.renewTx,
      recordsTx: v.recordsTx,
      logTx: v.logTx,
      links: {
        renew: v.renewTx ? explorer.sepoliaTx(v.renewTx) : null,
        records: v.recordsTx ? explorer.sepoliaTx(v.recordsTx) : null,
        log: v.logTx ? explorer.zgTx(v.logTx) : null,
      },
      lastError: v.status === "complete" ? null : v.lastError,
    },
    createdAt: v.createdAt.toISOString(),
  };
}

/** Public gallery entry (no reply text: it references what the human said). */
export const galleryView = (v: VisitRow) => ({ day: v.day, date: v.utcDate, mood: v.mood, imageUrl: v.imageUrl, videoUrl: v.videoUrl });
