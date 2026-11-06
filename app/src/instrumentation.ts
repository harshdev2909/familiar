/**
 * On a long-running server (Railway), run the reconcile job in-process every 5 minutes instead of
 * relying on platform crons. Enabled with INTERNAL_CRON=true; reuses the authenticated cron route.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.INTERNAL_CRON !== "true" || !process.env.CRON_SECRET) return;
  const port = process.env.PORT ?? "3000";
  const tick = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/reconcile`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => undefined);
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref();
}
