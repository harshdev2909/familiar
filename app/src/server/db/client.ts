import "server-only";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Driver-agnostic handle (postgres-js in production, PGlite in dev/tests). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = join(process.cwd(), "drizzle");

let dbPromise: Promise<DB> | undefined;

/**
 * Postgres when DATABASE_URL is a postgres URL (production; migrate with `pnpm db:migrate`).
 * Otherwise an embedded PGlite (dev: `.data/pglite`, tests: in-memory) that migrates itself.
 */
export function db(): Promise<DB> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<DB> {
  const url = env().DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
    return drizzlePg(client, { schema }) as unknown as DB;
  }
  const dataDir = url === "pglite:memory" ? undefined : (url?.replace(/^pglite:/, "") ?? join(process.cwd(), ".data/pglite"));
  const client = new PGlite(dataDir);
  const d = drizzlePglite(client, { schema });
  await migratePglite(d, { migrationsFolder: MIGRATIONS });
  return d as unknown as DB;
}

/** Test hook: use a fresh in-memory database. */
export function resetDbForTests() {
  dbPromise = undefined;
}

export { schema };
