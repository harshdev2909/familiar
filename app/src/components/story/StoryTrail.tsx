import { ArrowRight, BookOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Cloud, GiftBox, PaperKite, PawTrail, ScribbleUnderline, TrailPath, TulsiPlant, WashiTape } from "@/components/art/Handmade";
import { cn } from "@/components/ui/cn";
import { TONE_CLASS } from "@/lib/art";
import { CHAPTERS } from "@/lib/story";
import { Reveal } from "./Reveal";

/** A small doodle on each stretch of the trail between chapters. */
const BETWEEN = [
  <PawTrail key="paws" steps={4} className="h-6 md:h-7" />,
  <Cloud key="cloud" drift className="h-8 md:h-10" />,
  <TulsiPlant key="tulsi" className="h-11 md:h-14" />,
  <PaperKite key="kite" sway className="h-12 md:h-16" />,
  <GiftBox key="gift" className="size-9 md:size-11" />,
];

/** Ember's story on the home page: six chapters along a hand-drawn dotted trail, revealed on scroll. */
export function StoryTrail() {
  const last = CHAPTERS.length - 1;
  return (
    <section aria-labelledby="story" className="mx-auto max-w-6xl px-5 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="story" className="text-sm font-medium text-primary">Ember&apos;s story</h2>
          <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">
            Every Familiar starts{" "}
            <span className="relative inline-block">
              the same way.
              <ScribbleUnderline draw className="absolute inset-x-0 -bottom-2" />
            </span>
          </p>
        </div>
        <Link href="/story" className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-primary shadow-sticker hover:bg-accent">
          <BookOpen className="size-4" aria-hidden /> Read it as a storybook
        </Link>
      </div>

      <Reveal className="mt-12">
        <ol>
          {CHAPTERS.map((c, i) => {
            const flip = i % 2 === 1;
            const tone = TONE_CLASS[c.tone];
            return (
              <li key={c.id}>
                <article data-reveal className="grid grid-cols-[76px_1fr] items-center gap-4 sm:grid-cols-[124px_1fr] sm:gap-6 md:grid-cols-2 md:gap-14">
                  <div className={cn("relative md:w-[min(100%,380px)] md:justify-self-center", flip && "md:order-2")}>
                    <div className={cn("relative aspect-square overflow-hidden rounded-[1.4rem] shadow-sticker md:aspect-[4/3] md:rounded-blob", tone.bg)}>
                      <Image src={c.art} alt={c.alt} fill sizes="(min-width: 768px) 380px, 124px" className="object-cover" />
                    </div>
                    <WashiTape tone={c.tone} className={cn("absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 md:-top-3 md:h-6 md:w-20", flip ? "rotate-[5deg]" : "-rotate-[4deg]")} />
                  </div>
                  <div className={cn("min-w-0", flip && "md:order-1 md:justify-self-end md:text-right")}>
                    <p className={cn("font-mono text-xs", tone.ink)}>Chapter {c.n}</p>
                    <h3 className="mt-1 text-balance text-lg font-semibold leading-snug tracking-tight sm:text-2xl">{c.title}</h3>
                    <p className={cn("mt-1.5 max-w-sm text-pretty text-[15px] leading-relaxed text-muted-foreground sm:mt-2", flip && "md:ml-auto")}>{c.short}</p>
                    {c.link && (
                      <Link href={c.link.href} className="group mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {c.link.label}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    )}
                  </div>
                </article>
                {i < last && (
                  <div data-reveal>
                    <TrailPath flip={flip}>{BETWEEN[i]}</TrailPath>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Reveal>
    </section>
  );
}
