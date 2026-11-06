import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Retries onchain writes left pending by a failed/crashed request and polls evolution clips.
  // Sub-daily schedules need a Pro plan; on Hobby use "0 0 * * *".
  crons: [{ path: "/api/cron/reconcile", schedule: "*/5 * * * *" }],
};
