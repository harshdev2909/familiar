type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { familiarState, forget } from "@/server/familiar/service";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Public state of a Familiar (no memory, no replies). */
export const GET = route<P<{ name: string }>>(async (_req, { params }) => ({ familiar: await familiarState((await params).name) }));

const Forget = z.object({ confirm: z.string() });

/**
 * "Forget me" (owner only): deletes the encrypted memory, replies, receipts, portraits, voice,
 * clips and unused feed credits. Body `{ "confirm": "<name>" }` guards against accidents.
 * The onchain name and its public records stay with the owner.
 */
export const DELETE = route<P<{ name: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  await rateLimit(`forget:${session.address}`, 5, 3600);
  const name = (await params).name;
  const { confirm } = await json(req, Forget);
  if (confirm.trim().toLowerCase() !== name.trim().toLowerCase()) throw new AppError("BAD_REQUEST", "Type the Familiar's name to confirm");
  return forget(session, name);
});
