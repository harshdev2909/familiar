type P<T> = { params: Promise<T> };
import { checkName } from "@/server/familiar/service";
import { clientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Is `<name>.familiar.eth` available? (validates the label too) */
export const GET = route<P<{ name: string }>>(async (req, { params }) => {
  await rateLimit(`names:${clientIp(req)}`, 60, 60);
  return checkName((await params).name);
});
