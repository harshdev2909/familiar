import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A human, identified by their (lowercased) EVM address. */
export const users = pgTable("users", {
  address: text("address").primaryKey(),
  privyUserId: text("privy_user_id").unique(),
  createdAt: createdAt(),
});

/** One-time SIWE nonces. */
export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const familiars = pgTable(
  "familiars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull().unique(),
    ensNode: text("ens_node").notNull().unique(),
    owner: text("owner")
      .notNull()
      .references(() => users.address),
    species: text("species").notNull(),
    color: text("color").notNull(),
    styleSeed: text("style_seed").notNull(),
    /** Total visits (mirrors the onchain day counter). */
    day: integer("day").notNull().default(0),
    /** Consecutive-day streak. */
    streak: integer("streak").notNull().default(0),
    generation: integer("generation").notNull().default(1),
    resolver: text("resolver").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    mood: text("mood"),
    portraitUrl: text("portrait_url"),
    lastVisitDate: text("last_visit_date"), // YYYY-MM-DD (UTC)
    /** AES-256-GCM ciphertext of the memory summary (base64). Plaintext is never stored. */
    memoryCiphertext: text("memory_ciphertext"),
    /** 0G Storage root hash of the same ciphertext, when 0G Storage is enabled. */
    memoryRoot: text("memory_root"),
    hatchTx: text("hatch_tx"),
    /** In-app currency earned by caring for the Familiar. */
    sparks: integer("sparks").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    /** slot → item id */
    equipped: jsonb("equipped").$type<Record<string, string>>().notNull().default({}),
    lastSpinDate: text("last_spin_date"),
    /** When the last completed visit finished its AI step (care meters fall back to it). */
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    /** Tamagotchi care: the latest time each action was done (meters are derived, no cron). */
    lastPetAt: timestamp("last_pet_at", { withTimezone: true }),
    lastSnackAt: timestamp("last_snack_at", { withTimezone: true }),
    lastPlayAt: timestamp("last_play_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("familiars_owner_uq").on(t.owner), index("familiars_last_visit_idx").on(t.lastVisitAt)],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familiarId: uuid("familiar_id")
      .notNull()
      .references(() => familiars.id),
    day: integer("day").notNull(),
    utcDate: text("utc_date").notNull(),
    kind: text("kind", { enum: ["hatch", "visit", "wake"] }).notNull(),
    paidBy: text("paid_by", { enum: ["iai", "feed", "free"] }).notNull(),
    feedId: uuid("feed_id"),
    status: text("status", { enum: ["running", "ai_failed", "chain_pending", "complete"] }).notNull(),
    transcriptHash: text("transcript_hash"),
    mood: text("mood"),
    reply: text("reply"),
    imageUrl: text("image_url"),
    imageHash: text("image_hash"),
    /** Spoken reply (mp3). */
    replyAudioUrl: text("reply_audio_url"),
    videoUrl: text("video_url"),
    /** Seedance job id for the evolution clip (every 7th visit). */
    videoJobId: text("video_job_id"),
    videoStatus: text("video_status", { enum: ["none", "pending", "done", "failed"] }).notNull().default("none"),
    /** Memory commitment logged with this day (0G Storage root, or keccak of the ciphertext). */
    memoryRoot: text("memory_root"),
    requestIdsHash: text("request_ids_hash"),
    renewTx: text("renew_tx"),
    recordsTx: text("records_tx"),
    logTx: text("log_tx"),
    chainAttempts: integer("chain_attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("visits_familiar_day_uq").on(t.familiarId, t.day),
    index("visits_status_idx").on(t.status),
  ],
);

/** One row per 0G Private Computer call. */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),
    step: text("step", { enum: ["transcribe", "think", "draw", "speak", "evolve"] }).notNull(),
    model: text("model").notNull(),
    requestId: text("request_id").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    cost: text("cost"),
    costCurrency: text("cost_currency"),
    provider: text("provider"),
    teeVerified: boolean("tee_verified"),
    createdAt: createdAt(),
  },
  (t) => [index("receipts_visit_idx").on(t.visitId)],
);

/** Verified `Fed` events from FamiliarFeeder on Base. Each grants `visitsCredited` visits. */
export const feeds = pgTable(
  "feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familiarId: uuid("familiar_id")
      .notNull()
      .references(() => familiars.id),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    feeder: text("feeder").notNull(),
    amount: text("amount").notNull(), // W0G wei, decimal string
    visitsCredited: integer("visits_credited").notNull(),
    visitsUsed: integer("visits_used").notNull().default(0),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("feeds_tx_log_uq").on(t.txHash, t.logIndex), index("feeds_familiar_idx").on(t.familiarId)],
);

/** Server-held Uniswap quotes, so /feed/build only ever uses a quote we fetched. */
export const feedQuotes = pgTable("feed_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  familiarId: uuid("familiar_id")
    .notNull()
    .references(() => familiars.id),
  swapper: text("swapper").notNull(),
  quote: jsonb("quote").notNull(),
  feedAmount: text("feed_amount").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumed: boolean("consumed").notNull().default(false),
  createdAt: createdAt(),
});

/** Accessories a Familiar owns. */
export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familiarId: uuid("familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    source: text("source", { enum: ["shop", "spin", "quest"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inventory_familiar_item_uq").on(t.familiarId, t.itemId)],
);

/** Every Sparks movement. `ref` is unique, so a reward can never be granted twice. */
export const sparkLedger = pgTable(
  "spark_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familiarId: uuid("familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index("spark_ledger_familiar_idx").on(t.familiarId)],
);

/** Claimed quests, one per quest per period (day, ISO week or festival). */
export const questClaims = pgTable(
  "quest_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familiarId: uuid("familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    period: text("period").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quest_claims_uq").on(t.familiarId, t.questId, t.period)],
);

/** Explore: a Familiar spotted by another (once per pair). */
export const sightings = pgTable(
  "sightings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spotterFamiliarId: uuid("spotter_familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    spottedFamiliarId: uuid("spotted_familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sightings_pair_uq").on(t.spotterFamiliarId, t.spottedFamiliarId), index("sightings_spotted_idx").on(t.spottedFamiliarId)],
);

/** Gifts between Familiars: once per pair per UTC day. */
export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromFamiliarId: uuid("from_familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    toFamiliarId: uuid("to_familiar_id")
      .notNull()
      .references(() => familiars.id, { onDelete: "cascade" }),
    utcDate: text("utc_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("gifts_pair_day_uq").on(t.fromFamiliarId, t.toFamiliarId, t.utcDate), index("gifts_to_idx").on(t.toFamiliarId)],
);

/** Personal API keys (`fam_…`) for ChatGPT / Claude connectors. Only the SHA-256 is stored. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercased owner address. */
    owner: text("owner").notNull(),
    label: text("label").notNull(),
    /** First characters of the key, shown so the owner can tell keys apart. */
    prefix: text("prefix").notNull(),
    /** sha256(key), hex. */
    hash: text("hash").notNull().unique(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_owner_idx").on(t.owner)],
);

/** Last nonce handed out per (chain, account), written under an advisory lock. */
export const txNonces = pgTable("tx_nonces", {
  key: text("key").primaryKey(),
  nonce: integer("nonce").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fixed-window rate limiting. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export const nowSql = sql`now()`;
