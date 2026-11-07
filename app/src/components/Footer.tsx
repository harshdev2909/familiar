"use client";

import Link from "next/link";
import { useFestival } from "@/lib/festival";
import { AutoRickshaw, MumbaiSkyline } from "./art/Handmade";
import { EggMark } from "./brand/Logo";

export function Footer() {
  const festive = Boolean(useFestival());
  return (
    <footer className="pb-24 md:pb-0">
      {/* Mumbai by the sea, and an auto puttering home along the edge of the page. */}
      <div className="mx-auto flex max-w-6xl items-end justify-between gap-6 px-5 pt-8 opacity-80" aria-hidden>
        <AutoRickshaw className="mb-0.5 h-8 text-foreground/40 sm:h-10" />
        <MumbaiSkyline className="h-14 text-foreground/35 sm:h-20" />
      </div>
      <div className="border-t border-border/70" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <EggMark className="h-4" />© 2026 Familiar{festive && <span className="text-primary">· Shubh Deepavali</span>}
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link href="/#how" className="hover:text-foreground">How it works</Link>
          <Link href="/story" className="hover:text-foreground">Ember&apos;s story</Link>
          <Link href="/explore" className="hover:text-foreground">Explore</Link>
          <Link href="/connect" className="hover:text-foreground">ChatGPT &amp; Claude</Link>
          <Link href="/shop" className="hover:text-foreground">Shop</Link>
          <Link href="/trades" className="hover:text-foreground">Swaps</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
