import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiwaliBanner } from "@/components/landing/DiwaliBanner";
import { BuiltOn } from "@/components/landing/BuiltOn";
import { Spotlight } from "@/components/events/Spotlight";
import { LogoMark } from "@/components/brand/LogoMark";
import { HeroActions } from "@/components/landing/HeroActions";
import { HeroDevice } from "@/components/landing/HeroDevice";
import { RefreshCountdown } from "@/components/landing/RefreshCountdown";
import { BowlIcon, BrushIcon, EmberIcon, MicIcon, QuillIcon, SealIcon } from "@/components/art/Icons";
import { Divider, Orbit, Star, StarScatter } from "@/components/art/Doodles";
import { Cloud, MoonMobile, PawTrail, ScribbleUnderline } from "@/components/art/Handmade";
import { StoryTrail } from "@/components/story/StoryTrail";
import { ButtonLink } from "@/components/ui/button";
import { ART, MASCOT, SPECIES } from "@/lib/art";

const STEPS = [
  { n: "01", Icon: MicIcon, art: MASCOT.talk, title: "Talk for a minute", body: "Hold the button and tell it about your day. Sixty seconds, no typing, no feed to scroll." },
  { n: "02", Icon: QuillIcon, art: MASCOT.remember, title: "It remembers", body: "It keeps a short, encrypted memory of who you are, never your words, and answers in one warm line, out loud." },
  { n: "03", Icon: BrushIcon, art: MASCOT.paint, title: "It changes", body: "Every visit paints a new portrait shaped by your mood. Every seventh night it grows into its next form." },
];

const LIFE = [
  { art: ART.egg, label: "Egg", when: "before you meet" },
  { art: ART.hatchling, label: "Hatchling", when: "nights 1–6" },
  { art: ART.sprite, label: "Sprite", when: "nights 7–13" },
  { art: ART.guardian, label: "Guardian", when: "night 14 onward" },
  { art: ART.asleep, label: "Asleep", when: "after a week away" },
];

export default function Home() {
  return (
    <div className="bg-[image:var(--gradient-bg)]">
      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-6 px-5 pb-12 pt-8 md:grid-cols-[1.05fr_1fr] md:pt-14">
        <StarScatter className="opacity-70" />
        <div className="flex animate-rise flex-col gap-6">
          <RefreshCountdown />
          <h1 className="text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            A private creature you talk to{" "}
            <span className="relative inline-block">
              each night.
              <ScribbleUnderline draw className="absolute inset-x-0 -bottom-1.5 h-3.5 sm:-bottom-2" />
            </span>
          </h1>
          <p className="max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Tell it about your day for sixty seconds. It remembers, answers in one warm line, and paints itself anew. Skip a week and it falls asleep.
          </p>
          <HeroActions />
        </div>
        <div className="relative flex justify-center">
          <div className="relative w-full max-w-[520px]">
            <Orbit />
            <HeroDevice />
          </div>
        </div>
      </section>

      <DiwaliBanner />

      {/* The festival (and Lantern Night) have their own banner above. */}
      <Spotlight exclude={["diwali-2026", "lantern-night"]} />

      <StoryTrail />

      <Divider />

      {/* Play */}
      <section className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="play">
        <h2 id="play" className="text-sm font-medium text-primary">More than a chat</h2>
        <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">Care for it, and it gives back.</p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { art: "/art/care/pet.jpg", title: "Snack, pet, play", body: "Three little buttons, three hearts each. It gets peckish, lonely and sleepy." },
            { art: "/art/diwali/shop.jpg", title: "Dress it up", body: "Spend Sparks in the bazaar. It wears what you choose in that night's portrait." },
            { art: "/art/diwali/rangoli.jpg", title: "Quests and levels", body: "Spin the daily lantern, finish quests, earn badges. Level up as a keeper." },
          ].map((c) => (
            <li key={c.title} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <Image src={c.art} alt="" width={84} height={84} className="shrink-0 rounded-2xl bg-paper ring-1 ring-border" />
              <div>
                <h3 className="font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Link href="/explore" className="squish group relative flex min-h-44 items-end overflow-hidden rounded-bubble bg-sky p-5 shadow-sticker">
            <Image src="/art/explore/map.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.03]" />
            <span className="absolute inset-0 bg-gradient-to-t from-[oklch(0.2_0.02_40/0.7)] via-transparent to-transparent" aria-hidden />
            <span className="relative flex w-full items-end justify-between gap-3 text-white">
              <span>
                <span className="block text-lg font-semibold tracking-tight">Spot friends on the map</span>
                <span className="block text-sm text-white/85">Toss a star charm, fill your Dex, send a gift a day.</span>
              </span>
              <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
          <Link href="/connect" className="squish group flex min-h-44 items-center gap-5 rounded-bubble bg-lilac p-5 shadow-sticker">
            <span className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-paper sm:size-32">
              <Image src="/art/ai/connect.jpg" alt="" fill sizes="128px" className="object-cover" />
            </span>
            <span className="flex flex-1 flex-col gap-2 text-lilac-ink">
              <span className="flex items-center gap-2">
                <LogoMark src="/logos/openai.svg" label="ChatGPT" className="size-5" />
                <LogoMark src="/logos/claude.svg" label="Claude" className="size-5" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">Talk to it from ChatGPT or Claude</span>
              <span className="text-sm text-foreground/75">Add one connector link. Then &ldquo;tell luma about my day&rdquo; works anywhere you chat.</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-lilac-ink transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <h2 className="text-sm font-medium text-primary">How a night works</h2>
        <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">One small ritual. It only grows when you show up.</p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="relative aspect-[4/3] bg-paper">
                <Image src={s.art} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover object-[50%_40%]" />
              </div>
              <div className="p-6">
                <span className="flex items-center gap-2 text-primary">
                  <s.Icon className="size-5" />
                  <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Divider />

      {/* Lifecycle */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-sm font-medium text-primary">A life, one night at a time</h2>
        <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">From egg to guardian, and back to sleep if you forget.</p>
        <ol className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {LIFE.map((l, i) => (
            <li key={l.label} className="flex flex-col gap-3">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper ring-1 ring-border">
                <Image src={l.art} alt={`${l.label} stage`} fill sizes="(min-width: 640px) 20vw, 50vw" className={`object-cover ${i === 4 ? "opacity-80 saturate-50" : ""}`} />
              </div>
              <div>
                <p className="font-medium">{l.label}</p>
                <p className="text-sm text-muted-foreground">{l.when}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Divider />

      {/* Species */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-sm font-medium text-primary">Meet them</h2>
            <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">Eight kinds of Familiar. Yours stays the same creature, night after night.</p>
          </div>
          <PawTrail steps={5} className="mb-2 hidden h-8 shrink-0 md:block" />
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SPECIES.map((s) => (
            <li key={s.id} className="group flex flex-col gap-3">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper ring-1 ring-border">
                <Image src={s.art} alt={`${s.name} Familiar`} fill sizes="(min-width: 1152px) 280px, (min-width: 640px) 25vw, 50vw" className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]" />
              </div>
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm leading-snug text-muted-foreground">{s.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Care */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-sm font-medium text-primary">Keeping it fed</h2>
        <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">A visit costs a few cents of AI. Two ways to cover it.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-5 rounded-2xl border border-border bg-card p-7 shadow-soft">
            <Image src={MASCOT.thinking} alt="" width={112} height={112} className="hidden shrink-0 rounded-2xl bg-paper ring-1 ring-border sm:block" />
            <div>
            <EmberIcon className="size-5 text-primary" />
            <h3 className="mt-4 text-xl font-semibold tracking-tight">Your daily 0G credits</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Sign in with your 0G account and each visit spends credits that would expire at midnight anyway. Allowance you&apos;d lose becomes a habit you keep.
            </p>
            </div>
          </div>
          <div className="flex items-start gap-5 rounded-2xl border border-border bg-card p-7 shadow-soft">
            <Image src={MASCOT.fed} alt="" width={112} height={112} className="hidden shrink-0 rounded-2xl bg-paper ring-1 ring-border sm:block" />
            <div>
            <BowlIcon className="size-5 text-primary" />
            <h3 className="mt-4 text-xl font-semibold tracking-tight">Feed it $1</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              No credits? Tap Feed. One confirmation swaps $1 of USDC on Base and leaves it with your Familiar. One feed, one visit.
            </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <div className="grid gap-10 rounded-3xl bg-wash p-8 md:grid-cols-[1fr_1.3fr] md:p-12">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-sm font-medium text-primary">Private by design</h2>
              <p className="mt-2 text-3xl font-semibold tracking-tight">It hears everything. It keeps almost nothing.</p>
            </div>
            <Image src={MASCOT.lantern} alt="Ember holding a small lantern" width={220} height={220} className="rounded-3xl bg-paper ring-1 ring-border" />
          </div>
          <ul className="grid gap-6">
            <li className="flex gap-4">
              <MicIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="leading-relaxed">
                <span className="font-medium">Your voice is never stored.</span> <span className="text-muted-foreground">It&apos;s transcribed inside a secure enclave and discarded after the visit.</span>
              </p>
            </li>
            <li className="flex gap-4">
              <QuillIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="leading-relaxed">
                <span className="font-medium">Only a small memory remains.</span>{" "}
                <span className="text-muted-foreground">A few lines about who you are, encrypted with a key only your Familiar uses. No quotes.</span>
              </p>
            </li>
            <li className="flex gap-4">
              <SealIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="leading-relaxed">
                <span className="font-medium">Every step has a receipt.</span> <span className="text-muted-foreground">Each AI call carries a request ID you can check. Forget everything with one tap.</span>
              </p>
            </li>
          </ul>
        </div>
      </section>

      <BuiltOn />

      {/* CTA */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 pb-24 pt-8 text-center">
        <div className="relative">
          <MoonMobile className="absolute -right-20 -top-10 h-20 sm:-right-24" />
          <Cloud drift className="absolute -left-20 top-2 h-8 sm:-left-24" />
          <Star className="absolute -left-6 top-6 size-3 animate-[twinkle_4s_ease-in-out_infinite] text-primary/70 motion-reduce:animate-none" />
          <Star className="absolute -right-3 bottom-2 size-2.5 animate-[twinkle_5s_ease-in-out_1s_infinite] text-soft motion-reduce:animate-none" />
          <div className="relative size-36 overflow-hidden rounded-full bg-paper ring-1 ring-border">
            <Image src={ART.egg} alt="An egg waiting to hatch" fill sizes="144px" className="animate-breathe object-cover" />
          </div>
        </div>
        <p className="max-w-md text-3xl font-semibold tracking-tight">Someone is waiting to meet you.</p>
        <ButtonLink href="/hatch" size="lg">
          Hatch yours
        </ButtonLink>
      </section>
    </div>
  );
}
