"use client";

import Image from "next/image";
import { LanternNightBanner, useLanternNight } from "@/components/events/LanternNight";
import { useFestival } from "@/lib/festival";
import { Diya, FairyLights } from "../art/Diwali";
import { ButtonLink } from "../ui/button";

const PREVIEW = ["diya", "garland", "crown", "kandil"];

/** The festival banner. Lantern Night (live, or coming up) takes it over; otherwise it's Diwali. */
export function DiwaliBanner() {
  const fest = useFestival();
  const lantern = useLanternNight();
  if (lantern.event && (lantern.live || lantern.upcoming)) return <LanternNightBanner event={lantern.event} />;
  // Wait for the events list before showing Diwali, so the takeover never flashes in after it.
  if (!fest || lantern.pending) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 pb-6" aria-labelledby="diwali">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1d1a33] text-[#f6efe6]">
        <Image src="/art/diwali/fireworks.jpg" alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1d1a33] via-[#1d1a33]/70 to-transparent" aria-hidden />
        <FairyLights className="absolute inset-x-6 top-0" count={18} />
        <div className="relative grid items-center gap-6 p-7 pt-10 sm:p-10 sm:pt-12 md:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-[#f3c58a]">
              <Diya className="size-7" /> Diwali · until 10 November
            </p>
            <h2 id="diwali" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Light up your Familiar.</h2>
            <p className="max-w-md text-[#f6efe6]/80">Diyas, marigolds and star lanterns are in the bazaar for the festival. Whatever it wears, it wears in that night&apos;s portrait.</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/shop" size="lg" className="bg-[#f3c58a] text-[#1d1a33] hover:bg-[#f7d6aa]">Visit the bazaar</ButtonLink>
              <ButtonLink href="/quests" size="lg" variant="ghost" className="text-[#f6efe6] hover:bg-white/10">Festival quests</ButtonLink>
            </div>
          </div>
          <ul className="flex flex-wrap justify-center gap-3 md:justify-end">
            {PREVIEW.map((id) => (
              <li key={id} className="relative size-20 overflow-hidden rounded-2xl bg-[#FAF8F3] ring-2 ring-[#f6efe6]/20 sm:size-24">
                <Image src={`/art/items/${id}.jpg`} alt="" fill sizes="96px" className="object-cover" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
