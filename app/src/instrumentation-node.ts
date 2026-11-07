import { cp, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Long-running server (Railway) start-up, Node.js runtime only:
 * - seed the media volume with media shipped in `seed-media/` (files already on the volume are never overwritten);
 * - run the reconcile job in-process every 5 minutes instead of relying on platform crons (INTERNAL_CRON=true).
 */
export async function start() {
  if (process.env.MEDIA_DIR) await seedMedia(process.env.MEDIA_DIR).catch((e) => console.error("seed_media_failed", e));
  if (process.env.INTERNAL_CRON !== "true" || !process.env.CRON_SECRET) return;
  const port = process.env.PORT ?? "3000";
  const tick = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/reconcile`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => undefined);
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref();
}

async function seedMedia(target: string) {
  const source = join(process.cwd(), "seed-media");
  if (!(await stat(source).catch(() => null))?.isDirectory()) return;
  await cp(source, target, { recursive: true, force: false, errorOnExist: false });
}
