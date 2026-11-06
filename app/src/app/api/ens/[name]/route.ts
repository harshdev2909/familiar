type P<T> = { params: Promise<T> };
import { normalizeLabel, resolveLive } from "@/server/chain/ens";
import { route } from "@/server/http";

/** Live ENSv2 resolution of <name>.familiar.eth via the UniversalResolverV2 on Sepolia. */
export const GET = route<P<{ name: string }>>(async (_req, { params }) => ({ ens: await resolveLive(normalizeLabel((await params).name)) }));
