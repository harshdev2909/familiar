type P<T> = { params: Promise<T> };
import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { history } from "@/server/familiar/service";
import { query, route } from "@/server/http";

const Q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

/** Owner: full visits with replies, receipts and tx links. Others: portrait gallery only. */
export const GET = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await getSession(req);
  const { limit } = query(req, Q);
  return history((await params).name, s?.address ?? null, limit);
});
