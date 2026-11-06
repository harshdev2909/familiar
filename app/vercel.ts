import type { VercelConfig } from "@vercel/config/v1";

/**
 * Frontend on Vercel. When BACKEND_URL is set (next.config.ts), every /api/* request is proxied to
 * the API server on Railway, which also runs the reconcile job in-process (INTERNAL_CRON).
 */
export const config: VercelConfig = {
  framework: "nextjs",
};
