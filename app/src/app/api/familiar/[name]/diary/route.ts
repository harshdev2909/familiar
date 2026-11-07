type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getDiary, writeDiary } from "@/server/familiar/diary";
import { json, query, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 120;

const Week = z.string().regex(/^\d{4}-W\d{2}$/, "expected YYYY-Www");

/** Owner only: the diary for `?week=YYYY-Www` (default: this ISO week) and whether it can be (re)written. */
export const GET = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  const { week } = query(req, z.object({ week: Week.optional() }));
  return getDiary(s, (await params).name, week);
});

const Body = z.object({ week: Week.optional() });

/**
 * Owner only: write the week's diary with 0GM (team-paid). Needs ≥1 visit that week (400
 * NOTHING_TO_WRITE). The current week can be rewritten once per 24 h (429 COOLDOWN); past weeks once (409).
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`diary:${s.address}`, 6, 3600);
  const { week } = req.headers.get("content-type")?.includes("application/json") ? await json(req, Body) : { week: undefined };
  return writeDiary(s, (await params).name, week);
});
