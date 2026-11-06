import { iaiBalance } from "@/server/auth/iai";
import { requireSession } from "@/server/auth/session";
import { nextRefresh } from "@/server/familiar/rules";
import { familiarOf } from "@/server/familiar/service";
import { route } from "@/server/http";

/** iAI sessions: the user's live 0G credit balance. Wallet sessions: prepaid feed visits. */
export const GET = route(async (req) => {
  const s = await requireSession(req);
  const familiar = await familiarOf(s.address);
  if (s.method === "iai") return { method: "iai", iai: await iaiBalance(s), feedCredits: familiar?.feedCredits ?? 0 };
  return { method: "wallet", iai: null, feedCredits: familiar?.feedCredits ?? 0, refreshAt: nextRefresh().toISOString() };
});
