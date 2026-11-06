import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { log } from "./log";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Public origin of the app, used as the SIWE domain/uri and for absolute media URLs. */
  APP_URL: z.url().default("http://localhost:3000"),
  /** HMAC secret for session JWTs. */
  SESSION_SECRET: z.string().min(32),
  /** Postgres URL. Unset (dev/test only) = embedded PGlite. "pglite:memory" = in-memory PGlite. */
  DATABASE_URL: z.string().optional(),

  // Chains
  SEPOLIA_RPC: z.url().default("https://ethereum-sepolia-rpc.publicnode.com"),
  BASE_RPC: z.url().default("https://base-rpc.publicnode.com"),
  ZG_RPC: z.url().default("https://evmrpc.0g.ai"),
  /** Agent key: writes scoped ENS text records and logs days on 0G Chain. */
  AGENT_PRIVATE_KEY: hex32,
  /** Operator key: hatches/renews Familiars. Defaults to the agent key. */
  OPERATOR_PRIVATE_KEY: hex32.optional(),
  /** How long to wait for a transaction receipt before failing (the cron retries later). */
  TX_RECEIPT_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(180_000),
  /** Optional overrides of the deployed addresses in contracts/deployments. */
  FAMILIAR_REGISTRY_ADDRESS: z.string().optional(),
  FAMILIAR_FEEDER_ADDRESS: z.string().optional(),
  FAMILIAR_LOG_ADDRESS: z.string().optional(),

  // 0G Private Computer
  ZG_ROUTER_URL: z.url().default("https://router-api.0g.ai/v1"),
  ZG_API_KEY: z.string().min(1).optional(),
  ZG_MODEL_STT: z.string().default("whisper-large-v3"),
  ZG_MODEL_CHAT: z.string().default("0gm-1.0-35b-a3b"),
  ZG_MODEL_IMAGE: z.string().default("bytedance/seedream-5.0-flash"),
  ZG_MODEL_VIDEO: z.string().default("bytedance/seedance-2.0-fast"),
  /** Ask the router to verify the provider TEE signature on every call. */
  ZG_VERIFY_TEE: z.stringbool().default(true),
  ZG_IMAGE_SIZE: z.string().default("1024x1024"),

  // 0G Storage (encrypted memory). Disabled = memory blob kept only in the DB (still encrypted).
  ZG_STORAGE_ENABLED: z.stringbool().default(false),
  ZG_STORAGE_INDEXER: z.url().default("https://indexer-storage-turbo.0g.ai"),
  /** AES-256 master key for memory encryption (per-Familiar keys are derived with HKDF). */
  MEMORY_MASTER_KEY: hex32,

  // iAI sign-in (Privy with 0G's app ID)
  PRIVY_APP_ID: z.string().optional(),

  // Uniswap Trading API
  UNISWAP_API_URL: z.url().default("https://trade-api.gateway.uniswap.org/v1"),
  UNISWAP_API_KEY: z.string().optional(),
  /** Default slippage for feeds, percent. */
  FEED_SLIPPAGE_PCT: z.coerce.number().min(0.05).max(5).default(1),

  // Media
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Product rules
  /** Max visits per Familiar per UTC day. */
  VISITS_PER_DAY: z.coerce.number().int().min(1).default(1),
  /** Comma-separated labels exempt from the daily limit (seeded demo Familiar). */
  DEMO_LABELS: z.string().default(""),

  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Throws once, with every problem listed, if configuration is invalid. */
export function env(): Env {
  if (cached) return cached;
  // `KEY=` in an env file means "unset", not "empty string".
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    log.error("env_invalid", { issues: parsed.error.issues.map((i) => ({ variable: i.path.join("."), problem: i.message })) });
    throw new AppError("NOT_CONFIGURED", "Server is misconfigured", undefined, { cause: new Error(`Invalid environment configuration:\n${issues}`) });
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.DATABASE_URL) {
    log.error("env_invalid", { issues: [{ variable: "DATABASE_URL", problem: "required in production" }] });
    throw new AppError("NOT_CONFIGURED", "Server is misconfigured");
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: drop the cached env so a test can change process.env. */
export function resetEnvForTests() {
  cached = undefined;
}

export const demoLabels = () =>
  new Set(
    env()
      .DEMO_LABELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
