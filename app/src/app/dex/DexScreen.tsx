"use client";

import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { StarCharm } from "@/components/art/Charm";
import { Cloud, PawTrail } from "@/components/art/Handmade";
import { Avatar } from "@/components/explore/Avatar";
import { useGift } from "@/components/explore/social";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { api } from "@/lib/api";
import { TONE_CLASS, speciesName, toneOf } from "@/lib/art";
import { useNow } from "@/lib/browser";
import { useSession } from "@/lib/session";

function ago(iso: string, now: number | null) {
  if (now === null) return "";
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export function DexScreen() {
  const { session, familiar, loading } = useSession();
  const now = useNow();
  const gift = useGift();
  const [signIn, setSignIn] = useState(false);
  const q = useQuery({ queryKey: ["dex", session?.address ?? null], queryFn: api.dex, enabled: Boolean(session) });

  if (!loading && !session)
    return (
      <Empty title="Your Dex lives here" body="Sign in, then spot Familiars on the map to fill it, one kind at a time.">
        <Button onClick={() => setSignIn(true)}>Sign in</Button>
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </Empty>
    );
  if (!loading && !familiar)
    return (
      <Empty title="Hatch a Familiar first" body="Spotting starts once you have a little one of your own.">
        <ButtonLink href="/hatch">Hatch yours</ButtonLink>
      </Empty>
    );
  if (q.isError)
    return (
      <Empty title="The Dex didn't open." body="Check your connection and try again.">
        <Button onClick={() => q.refetch()}>Try again</Button>
      </Empty>
    );

  const data = q.data;
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-6 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-primary">Dex</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Every kind you&apos;ve met.</h1>
          <p className="mt-2 max-w-md text-muted-foreground">Spot Familiars on the map to fill it in. A new kind earns 10 extra Sparks.</p>
        </div>
        {data ? <ProgressRing caught={data.caught} total={data.total} /> : <Skeleton className="size-28 rounded-full" />}
      </div>

      <section className="mt-10" aria-labelledby="kinds">
        <h2 id="kinds" className="sr-only">Kinds</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {!data
            ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-bubble" />)
            : data.species.map((s) => {
                const tone = TONE_CLASS[toneOf(s.id)];
                return (
                  <li key={s.id} className={cn("sticker flex flex-col overflow-hidden", !s.caught && "bg-muted")}>
                    <div className={cn("relative aspect-square", s.caught ? tone.bg : "bg-muted")}>
                      <Image
                        src={s.art}
                        alt={s.caught ? `${s.name}` : "An unknown kind, not spotted yet"}
                        fill
                        sizes="(min-width: 1152px) 280px, (min-width: 640px) 25vw, 50vw"
                        className={cn(
                          "object-cover",
                          // Silhouette: crush the paper to white and the creature to a dark shape, then multiply it onto the card.
                          !s.caught && "opacity-35 mix-blend-multiply [filter:brightness(0.75)_contrast(6)_grayscale(1)] dark:mix-blend-screen dark:[filter:brightness(0.75)_contrast(6)_grayscale(1)_invert(1)]",
                        )}
                      />
                      {!s.caught && <span className="absolute inset-0 grid place-items-center text-4xl font-semibold text-muted-foreground" aria-hidden>?</span>}
                      {s.caught && s.count > 1 && (
                        <span className={cn("absolute right-2 top-2 rounded-full bg-card px-2 py-0.5 font-mono text-[11px] font-medium shadow-sticker", tone.ink)}>×{s.count}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className={cn("text-sm font-medium", !s.caught && "text-muted-foreground")}>{s.caught ? s.name : "???"}</span>
                      {s.caught && <span className={cn("size-2 rounded-full", tone.solid)} aria-hidden />}
                    </div>
                  </li>
                );
              })}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="friends">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="friends" className="text-sm font-medium text-primary">Friends you&apos;ve spotted</h2>
          <Link href="/explore" className="text-sm text-primary underline-offset-4 hover:underline">Find more</Link>
        </div>
        {!data ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 rounded-bubble" />
            <Skeleton className="h-20 rounded-bubble" />
          </div>
        ) : data.spotted.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-blob border border-dashed border-border p-8 text-center">
            <StarCharm className="animate-bob motion-reduce:animate-none" />
            <p className="font-medium">No one yet.</p>
            <p className="max-w-xs text-sm text-muted-foreground">Open the map, tap a Familiar and toss a star charm.</p>
            <PawTrail steps={4} className="h-6" />
            <ButtonLink href="/explore" variant="outline">Open the map</ButtonLink>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.spotted.map((f) => (
              <li key={f.label} className="flex items-center gap-3 rounded-bubble border border-border bg-card p-3 shadow-soft">
                <Link href={`/f/${f.label}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-bubble">
                  <Avatar species={f.species} portraitUrl={f.portraitUrl} size={48} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.label}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {speciesName(f.species)} · spotted {ago(f.spottedAt, now)}
                    </span>
                  </span>
                </Link>
                <Button
                  size="sm"
                  variant={f.giftedToday ? "ghost" : "secondary"}
                  disabled={f.giftedToday || (gift.isPending && gift.variables === f.label)}
                  loading={gift.isPending && gift.variables === f.label}
                  onClick={() => gift.mutate(f.label)}
                  aria-label={f.giftedToday ? `Gift sent to ${f.label} today` : `Send ${f.label} a gift`}
                  className="h-10"
                >
                  <Gift className="size-4" aria-hidden /> {f.giftedToday ? "Sent" : "Gift"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProgressRing({ caught, total }: { caught: number; total: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const p = total ? caught / total : 0;
  return (
    <div className="relative size-28" role="img" aria-label={`${caught} of ${total} kinds found`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--mint-ink)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} className="transition-[stroke-dashoffset] duration-700 ease-out-soft" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none tabular-nums">{caught}</span>
        <span className="mt-1 font-mono text-[11px] text-muted-foreground">of {total}</span>
      </span>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
      <span className="relative">
        <Cloud drift className="absolute -left-16 top-2 h-8" />
        <Cloud className="absolute -right-14 bottom-4 h-6 opacity-70" />
        <span className="relative block size-32 overflow-hidden rounded-full bg-paper shadow-sticker">
          <Image src="/art/explore/catch.jpg" alt="" fill sizes="128px" className="object-cover" />
        </span>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
