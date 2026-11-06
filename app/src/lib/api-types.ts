/**
 * Response types for the Familiar API, for the frontend. Type-only re-exports: importing this file
 * from a Client Component pulls in no server code.
 */
export type { FamiliarView, VisitView, ReceiptView } from "@/server/familiar/views";
export type { FeedQuoteView, FeedBuild, WalletCall } from "@/server/feed/service";
export type { LiveEns } from "@/server/chain/ens";
export type { ErrorCode } from "@/server/errors";
export type { ShopItemView, QuestView } from "@/server/game/service";
export type { Slot } from "@/server/game/catalog";

import type { FamiliarView, VisitView } from "@/server/familiar/views";
import type { ErrorCode } from "@/server/errors";

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}

export interface SessionInfo {
  address: `0x${string}`;
  method: "wallet" | "iai";
}

export interface VisitResult {
  familiar: FamiliarView;
  visit: VisitView;
  memory: { root: `0x${string}`; onZeroGStorage: boolean };
  reward?: { sparks: number; xp: number; leveledUp: boolean; level: number };
}

export interface ShopResult {
  festival: { id: string; name: string; start: string; end: string } | null;
  sparks: number | null;
  familiar: string | null;
  items: import("@/server/game/service").ShopItemView[];
}

export interface QuestsResult {
  quests: import("@/server/game/service").QuestView[];
  badges: { id: string; name: string; earned: boolean }[];
  festival: { id: string; name: string; start: string; end: string } | null;
  sparks: number;
  level: { level: number; xp: number; intoLevel: number; levelSize: number; toNext: number };
}

export interface HatchResult extends VisitResult {
  hatchTx: `0x${string}` | null;
}

export interface FeedConfirmResult {
  status: "pending" | "confirmed";
  txHash: `0x${string}`;
  credited?: { label: string; visits: number; amountW0g: string; logIndex: number }[];
  feedCredits?: number;
  basescan?: string;
}

export interface CreditsResult {
  method: "wallet" | "iai";
  iai: null | { credit: string; deposit: string; total: string; pending: string; currency: string; refreshAt: string };
  feedCredits: number;
  refreshAt?: string;
}

export interface AgentOverreachResult {
  resolver: `0x${string}`;
  agent: `0x${string}`;
  attempts: { call: string; reverted: boolean; error?: string }[];
}

/* ——— Round 3: care, explore, dex, events, connectors (see CONTRACT.md) ——— */

export type CareAction = "pet" | "snack" | "play";
export type CareNeed = "hungry" | "lonely" | "sleepy";

/** `FamiliarView.care` — Tamagotchi meters derived from time. */
export interface CareView {
  fullness: number;
  joy: number;
  energy: number;
  hearts: { fullness: number; joy: number; energy: number };
  need: CareNeed | null;
  /** null = can do it now, else the ISO time it's ready. */
  ready: { pet: string | null; snack: string | null; play: string | null };
}

export interface CareResult {
  action: CareAction;
  reward: { sparks: number; xp: number };
  familiar: FamiliarView;
}

export interface ExploreFamiliar {
  label: string;
  name: string;
  species: string;
  color: string;
  stage: string;
  level: number;
  mood: string | null;
  portraitUrl: string | null;
  spotted: boolean;
  mine: boolean;
  giftedToday: boolean;
  /** 0.08–0.92 of the map's width/height. */
  pin: { x: number; y: number };
}

export interface ExploreResult {
  familiars: ExploreFamiliar[];
}

export interface SpotResult {
  spotted: string;
  reward: { sparks: number; xp: number };
  newSpecies: boolean;
}

export interface GiftResult {
  gifted: string;
  reward: { sparks: number; xp: number };
}

export interface DexResult {
  species: { id: string; name: string; art: string; caught: boolean; count: number }[];
  spotted: { label: string; name: string; species: string; portraitUrl: string | null; spottedAt: string; giftedToday: boolean }[];
  caught: number;
  total: number;
}

export interface EventView {
  id: string;
  name: string;
  place: string;
  /** YYYY-MM-DD, inclusive, UTC. */
  start: string;
  end: string;
  logo: string | null;
  art: string;
  url: string | null;
  blurb: string;
  bonus: string;
  status: "live" | "upcoming" | "ended";
}

export interface ApiKeyView {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedApiKey {
  id: string;
  label: string;
  prefix: string;
  /** Shown once. */
  key: string;
  connectorUrl: string;
}
