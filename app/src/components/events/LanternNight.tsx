"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { SkyLantern, LanternSky } from "@/components/art/Lantern";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { api } from "@/lib/api";
import type { EventView } from "@/lib/api-types";
import { ROUND4 } from "@/lib/art";
import { useNow } from "@/lib/browser";
import { hms } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export const LANTERN_NIGHT = "lantern-night";
export const LANTERN_ART = ROUND4.lanternNight;
const DAY = 86_400_000;

/** Lantern Night from `GET /api/events` (shared cache with the Spotlight), or null. */
export function useLanternNight() {
  const q = useQuery({ queryKey: ["events"], queryFn: api.events, staleTime: 5 * 60_000 });
  const event = q.data?.events.find((e) => e.id === LANTERN_NIGHT) ?? null;
  return { event, pending: q.isPending, live: event?.status === "live", upcoming: event?.status === "upcoming" };
}

/** Seconds until the event starts (00:00 UTC on its first day) and whole days to go. */
function useUntilStart(event: EventView | null) {
  const now = useNow();
  if (!event || now === null) return { seconds: null, days: null };
  const start = Date.parse(`${event.start}T00:00:00Z`);
  const seconds = Math.max(0, Math.floor((start - now) / 1000));
  return { seconds, days: Math.max(1, Math.ceil((start - now) / DAY)) };
}

/** Seconds left of the event (until 00:00 UTC after its last day). */
function useUntilEnd(event: EventView | null) {
  const now = useNow();
  if (!event || now === null) return null;
  return Math.max(0, Math.floor((Date.parse(`${event.end}T00:00:00Z`) + DAY - now) / 1000));
}

/**
 * The home-page takeover: a night-sky card with lanterns drifting up. Live: "it's tonight". Upcoming:
 * a countdown. Renders nothing otherwise, so callers can fall back to the Diwali banner.
 */
export function LanternNightBanner({ event }: { event: EventView }) {
  const { familiar } = useSession();
  const live = event.status === "live";
  const until = useUntilStart(event);
  const left = useUntilEnd(event);
  const soon = until.days === 1 ? "Tomorrow night. Dress up." : until.days ? `In ${until.days} nights. Start planning outfits.` : "Coming up. Dress up.";
  return (
    <section className="mx-auto max-w-6xl px-5 pb-6" aria-labelledby="lantern-night">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#141632] text-[#f6efe6]">
        <Image src={LANTERN_ART} alt="" fill priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141632] via-[#141632]/75 to-[#141632]/10" aria-hidden />
        <LanternSky className="left-1/3" />
        <div className="relative grid items-center gap-6 p-7 sm:p-10 md:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-[#f3c58a]">
              <SkyLantern className="h-7" /> Lantern Night · {live ? "tonight only" : "8 November"}
            </p>
            <h2 id="lantern-night" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {live ? "The sky's on. So is your Familiar." : soon}
            </h2>
            <p className="max-w-md text-[#f6efe6]/80">
              {live
                ? "Every portrait tonight gets fireworks and floating lanterns. Visit before midnight UTC for a badge that never comes back."
                : "One night, one limited badge. Every portrait gets fireworks and paper lanterns. It's already practising its best side."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {familiar ? (
                <ButtonLink href={`/f/${familiar.label}`} size="lg" className="bg-[#f3c58a] text-[#141632] hover:bg-[#f7d6aa]">
                  {live ? `Visit ${familiar.label} tonight` : `Get ${familiar.label} ready`}
                </ButtonLink>
              ) : (
                <ButtonLink href="/hatch" size="lg" className="bg-[#f3c58a] text-[#141632] hover:bg-[#f7d6aa]">
                  Hatch one in time
                </ButtonLink>
              )}
              <ButtonLink href="/shop" size="lg" variant="ghost" className="text-[#f6efe6] hover:bg-white/10">
                Diwali bazaar
              </ButtonLink>
            </div>
          </div>
          <div className="flex justify-start md:justify-end">
            <div className="rounded-3xl bg-[#f6efe6]/10 px-5 py-4 ring-1 ring-[#f6efe6]/15 backdrop-blur-sm" aria-live="off">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#f6efe6]/70">{live ? "Lanterns down in" : "Lanterns up in"}</p>
              <p className="mt-1 font-mono text-3xl tabular-nums sm:text-4xl">{(live ? left : until.seconds) === null ? "--:--:--" : hms((live ? left : until.seconds)!)}</p>
              <p className="mt-1 text-xs text-[#f6efe6]/70">{live ? "until midnight UTC" : "starts 00:00 UTC"}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A slim "Lantern Night is on" note with a small lantern sky, for the Familiar page. */
export function LanternNightNote({ className }: { className?: string }) {
  const { event, live } = useLanternNight();
  if (!event || !live) return null;
  return (
    <p className={cn("relative flex items-center gap-2 overflow-hidden rounded-full bg-[#141632] px-4 py-2 text-sm text-[#f6efe6]", className)}>
      <SkyLantern className="h-6 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Lantern Night. Tonight&apos;s portrait comes with fireworks.</span>
    </p>
  );
}
