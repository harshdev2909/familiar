type P<T> = { params: Promise<T> };
import { familiarState } from "@/server/familiar/service";
import { route } from "@/server/http";

/** Public state of a Familiar (no memory, no replies). */
export const GET = route<P<{ name: string }>>(async (_req, { params }) => ({ familiar: await familiarState((await params).name) }));
