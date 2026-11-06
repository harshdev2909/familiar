import type { FamiliarView } from "@/lib/api-types";
import { humanDuration } from "@/lib/hooks";
import { BowlIcon, HeartIcon, MoonIcon } from "../art/Icons";
import { Meter } from "../ui/meter";

const WEEK = 7 * 86400;

/** The Familiar's needs, Tamagotchi-style, all derived from real state. */
export function Meters({ familiar, method }: { familiar: FamiliarView; method: "wallet" | "iai" | null }) {
  const fed = method === "iai" || familiar.demo ? 1 : Math.min(1, familiar.feedCredits / 3);
  const fedHint = familiar.demo ? "on the house" : method === "iai" ? "daily 0G credits" : familiar.feedCredits > 0 ? `${familiar.feedCredits} visit${familiar.feedCredits === 1 ? "" : "s"} saved` : "hungry";
  return (
    <div className="grid grid-cols-3 gap-4">
      <Meter label="Fed" icon={<BowlIcon className="size-3.5" />} value={fed} hint={fedHint} />
      <Meter label="Awake" icon={<MoonIcon className="size-3.5" />} value={familiar.dormant ? 0 : familiar.expiresInSec / WEEK} pips={7} hint={familiar.dormant ? "asleep" : humanDuration(familiar.expiresInSec)} />
      <Meter label="Bond" icon={<HeartIcon className="size-3.5" />} value={Math.min(1, familiar.streak / 7)} pips={7} hint={`${familiar.streak} night${familiar.streak === 1 ? "" : "s"}`} />
    </div>
  );
}
