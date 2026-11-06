type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { equip } from "@/server/game/service";
import { json, route } from "@/server/http";

const Body = z.object({ slot: z.enum(["head", "neck", "hand", "back", "ground"]), itemId: z.string().min(1).max(40).nullable() });

/** Wear an owned accessory in a slot (or clear the slot). It shows up in the next portrait. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  const { slot, itemId } = await json(req, Body);
  return equip(s, (await params).name, slot, itemId);
});
