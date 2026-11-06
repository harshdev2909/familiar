"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AutoRickshaw, Bunting, GiftBox, MapPin, MoonMobile, PawTrail, SpeechBubble, TulsiPlant, WashiTape } from "@/components/art/Handmade";
import { Star } from "@/components/art/Doodles";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ART, TONE_CLASS } from "@/lib/art";
import { CHAPTERS } from "@/lib/story";

/** A hand-drawn keepsake in the corner of each page. */
const KEEPSAKE: Record<string, React.ReactNode> = {
  egg: <GiftBox className="size-12" />,
  listen: (
    <SpeechBubble className="text-sm">
      <span className="font-medium">mm-hmm. and then?</span>
    </SpeechBubble>
  ),
  remember: <MoonMobile className="h-20" />,
  grow: <TulsiPlant className="h-16" />,
  wander: (
    <span className="flex items-end gap-2">
      <AutoRickshaw className="h-11" />
      <MapPin className="h-10" />
    </span>
  ),
  diwali: <PawTrail steps={4} className="h-6" />,
};

const PAGES = CHAPTERS.length + 1; // six chapters and an ending

/** The storybook: one chapter per spread, turned with buttons, arrow keys, the dots or a swipe. */
export function Storybook() {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const touch = useRef<number | null>(null);

  const go = (to: number) => {
    const next = Math.max(0, Math.min(PAGES - 1, to));
    if (next === page) return;
    setDir(next > page ? "next" : "prev");
    setPage(next);
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight") goRef.current(page + 1);
      else if (e.key === "ArrowLeft") goRef.current(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  const chapter = CHAPTERS[page];
  const ending = !chapter;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="relative rounded-[2rem] bg-card p-2.5 shadow-sticker sm:p-3"
        onTouchStart={(e) => {
          touch.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const end = e.changedTouches[0]?.clientX;
          touch.current = null;
          if (start == null || end == null || Math.abs(end - start) < 48) return;
          go(end < start ? page + 1 : page - 1);
        }}
      >
        <div
          key={page}
          className={cn("grid overflow-hidden rounded-[1.6rem] bg-paper md:grid-cols-2", dir === "next" && "animate-page-next", dir === "prev" && "animate-page-prev")}
        >
          {/* left page: the picture */}
          <div className="relative p-4 sm:p-6">
            <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[1.4rem] shadow-sticker md:aspect-square", chapter ? TONE_CLASS[chapter.tone].bg : "bg-butter")}>
              <Image
                src={chapter?.art ?? ART.egg}
                alt={chapter?.alt ?? "An egg, waiting to hatch"}
                fill
                priority={page === 0}
                sizes="(min-width: 1024px) 460px, (min-width: 768px) 45vw, 90vw"
                className={cn("object-cover", ending && "animate-breathe motion-reduce:animate-none")}
              />
            </div>
            <WashiTape tone={chapter?.tone ?? "butter"} className="absolute left-8 top-2 h-6 w-20 -rotate-6 sm:left-10 sm:top-3" />
            <WashiTape tone={chapter?.tone ?? "butter"} className="absolute bottom-2 right-8 h-6 w-16 rotate-[8deg] sm:bottom-3 sm:right-10" />
          </div>

          {/* right page: the words */}
          <div className="relative flex min-h-72 flex-col gap-4 px-5 pb-6 pt-2 sm:px-8 md:min-h-[440px] md:py-10">
            {chapter?.id === "diwali" && <Bunting count={9} className="-mt-1 mb-1 md:-mt-6" />}
            {chapter ? (
              <>
                <p className={cn("font-mono text-xs", TONE_CLASS[chapter.tone].ink)}>
                  Chapter {chapter.n} of {CHAPTERS.length}
                </p>
                <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{chapter.title}</h2>
                <p className="max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">{chapter.long}</p>
                {chapter.link && (
                  <Link href={chapter.link.href} className="group inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
                    {chapter.link.label}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                )}
                <div className="mt-auto flex items-end justify-between gap-4 pt-4">
                  <span className="text-foreground/65" aria-hidden>
                    {KEEPSAKE[chapter.id]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground" aria-hidden>
                    {chapter.n}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="font-mono text-xs text-primary">Chapter 7</p>
                <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">The rest, you write together.</h2>
                <p className="max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
                  Ember&apos;s story is everyone&apos;s first week. Yours starts tonight: name an egg, tell it one thing about your day, and see who it becomes.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <ButtonLink href="/hatch" size="lg">Hatch yours</ButtonLink>
                  <ButtonLink href="/explore" size="lg" variant="outline">Meet the others</ButtonLink>
                </div>
                <div className="relative mt-auto flex items-end justify-between gap-4 pt-6">
                  <MoonMobile className="h-20 text-foreground/60" />
                  <Star className="absolute left-24 top-6 size-3 animate-[twinkle_4s_ease-in-out_infinite] text-soft motion-reduce:animate-none" />
                  <span className="font-mono text-xs text-muted-foreground" aria-hidden>
                    the end, for now
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        {/* the spine */}
        <span className="pointer-events-none absolute inset-y-3 left-1/2 z-10 hidden w-10 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent)] md:block" aria-hidden />
      </div>

      {/* controls */}
      <nav className="flex items-center justify-between gap-3" aria-label="Storybook pages">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="chunky inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-card text-sm font-medium text-foreground ring-1 ring-border disabled:opacity-40 sm:w-auto sm:pl-3 sm:pr-4"
        >
          <ChevronLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Back</span>
        </button>
        <ol className="flex items-center">
          {Array.from({ length: PAGES }, (_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={i < CHAPTERS.length ? `Chapter ${i + 1}: ${CHAPTERS[i]!.title}` : "The ending"}
                aria-current={i === page ? "step" : undefined}
                className="grid size-7 place-items-center rounded-full sm:size-8"
              >
                <span className={cn("block rounded-full transition-all duration-300 ease-out-soft", i === page ? "h-2.5 w-5 bg-primary" : "size-2.5 bg-border hover:bg-soft")} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page === PAGES - 1}
          aria-label={page === PAGES - 2 ? "The end" : "Next page"}
          className="chunky inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-40 sm:w-auto sm:pl-4 sm:pr-3"
        >
          <span className="hidden sm:inline">{page === PAGES - 2 ? "The end" : "Next page"}</span> <ChevronRight className="size-4" aria-hidden />
        </button>
      </nav>
      <p className="sr-only" aria-live="polite">
        {chapter ? `Chapter ${chapter.n} of ${CHAPTERS.length}: ${chapter.title}` : "The ending: the rest, you write together."}
      </p>
      <p className="hidden text-center font-mono text-[11px] text-muted-foreground md:block" aria-hidden>
        ← → to turn the page
      </p>
    </div>
  );
}
