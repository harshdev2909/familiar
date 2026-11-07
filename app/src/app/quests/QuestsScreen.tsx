"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Diya } from "@/components/art/Diwali";
import { EmberIcon, HeartIcon, MoonIcon, SealIcon } from "@/components/art/Icons";
import { Star } from "@/components/art/Doodles";
import { Bunting, GiftBox } from "@/components/art/Handmade";
import { SkyLantern } from "@/components/art/Lantern";
import Link from "next/link";
import { SignInDialog } from "@/components/SignIn";
import { EventStrip } from "@/components/events/Spotlight";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { QuestView } from "@/lib/api-types";
import { hms, useSecondsToUtcMidnight } from "@/lib/hooks";
import { useSession } from "@/lib/session";

const BADGE_ICON: Record<string, React.ReactNode> = {
  "first-night": <MoonIcon className="size-6" />,
  "week-of-nights": <HeartIcon className="size-6" />,
  sprite: <Star className="size-6" />,
  guardian: <SealIcon className="size-6" />,
  "diwali-2026": <Diya className="size-8" />,
  "lantern-night-2026": <SkyLantern className="h-10" />,
};

/** Limited badges get the night-sky treatment, earned or not: you can only get them once. */
const LIMITED: Record<string, string> = { "lantern-night-2026": "8 Nov only" };

/** Quests with somewhere to go, so the next step is one tap away. */
const QUEST_LINK: Record<string, { href: (label: string) => string; text: string }> = {
  "hackathon-meet": { href: (l) => `/f/${l}#meet`, text: "Show your meet code" },
  "daily-walk": { href: (l) => `/f/${l}#walks`, text: "Start a walk" },
  "lantern-night-visit": { href: (l) => `/f/${l}`, text: "Visit tonight" },
};

export function QuestsScreen() {
  const { session, familiar, loading, refresh } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const untilMidnight = useSecondsToUtcMidnight();
  const [signIn, setSignIn] = useState(false);
  const [prize, setPrize] = useState<{ sparks: number; item: { name: string; art: string } | null } | null>(null);
  const q = useQuery({ queryKey: ["quests"], queryFn: api.quests, enabled: Boolean(familiar) });

  const sync = () => Promise.all([qc.invalidateQueries({ queryKey: ["quests"] }), refresh(), qc.invalidateQueries({ queryKey: ["shop"] })]);
  const spin = useMutation({
    mutationFn: () => api.spin(familiar!.label),
    onSuccess: async (r) => {
      setPrize(r);
      await sync();
    },
    onError: (e) => toast(isApiError(e) ? e.message : "The lantern didn't turn", "error"),
  });
  const claim = useMutation({
    mutationFn: (quest: QuestView) => api.claim(quest.id),
    onSuccess: async (r) => {
      toast(`+${r.reward} Sparks`);
      await sync();
    },
    onError: (e) => toast(isApiError(e) ? e.message : "Couldn't claim that", "error"),
  });

  if (!loading && !session)
    return (
      <Empty title="Sign in to see your quests" body="Quests pay Sparks for caring for your Familiar.">
        <Button onClick={() => setSignIn(true)}>Sign in</Button>
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </Empty>
    );
  if (!loading && !familiar)
    return (
      <Empty title="Hatch a Familiar first" body="Quests, Sparks and the daily lantern start the night you meet.">
        <ButtonLink href="/hatch">Hatch yours</ButtonLink>
      </Empty>
    );

  const data = q.data;
  const groups: { kind: QuestView["kind"]; title: string }[] = [
    { kind: "daily", title: "Tonight" },
    { kind: "weekly", title: "This week" },
    { kind: "event", title: "Events & festivals" },
  ];
  const spun = familiar?.spunToday;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-24 pt-6 lg:grid-cols-[1fr_1.4fr]">
      <EventStrip className="min-w-0 lg:col-span-2" />
      <div className="flex flex-col gap-6">
        {/* Trainer card */}
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-soft" aria-label="Your level">
          {!data ? (
            <Skeleton className="h-28" />
          ) : (
            <div className="flex items-center gap-5">
              <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label={`Level ${data.level.level}`}>
                <span className="text-[10px] font-medium uppercase leading-none tracking-[0.12em] opacity-80">Level</span>
                <span className="mt-0.5 text-3xl font-semibold leading-none tabular-nums">{data.level.level}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="truncate text-lg font-semibold">{familiar?.label}&apos;s keeper</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border" role="progressbar" aria-valuemin={0} aria-valuemax={data.level.levelSize} aria-valuenow={data.level.intoLevel} aria-label="Experience">
                  <div className="h-full rounded-full bg-[image:var(--gradient-accent)] transition-[width] duration-700" style={{ width: `${(data.level.intoLevel / data.level.levelSize) * 100}%` }} />
                </div>
                <p className="flex justify-between font-mono text-xs text-muted-foreground">
                  <span>{data.level.toNext} XP to level {data.level.level + 1}</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <EmberIcon className="size-3.5" /> {data.sparks}
                  </span>
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Daily lantern */}
        <section className="relative overflow-hidden rounded-[2rem] bg-[#1d1a33] p-6 text-[#f6efe6]" aria-labelledby="lantern">
          <Image src="/art/diwali/fireworks.jpg" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover opacity-50" />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <h2 id="lantern" className="text-lg font-semibold">The daily lantern</h2>
            <button
              onClick={() => !spun && spin.mutate()}
              disabled={spun || spin.isPending || !familiar}
              aria-label={spun ? "Lantern already spun today" : "Spin the lantern"}
              className={cn("relative size-40 rounded-full transition-transform duration-500 ease-out-soft focus-visible:outline-offset-4", !spun && "hover:scale-105 active:scale-95", spin.isPending && "animate-[spin_0.9s_ease-in-out_infinite]")}
            >
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,oklch(0.85_0.14_75/0.55),transparent_65%)]" aria-hidden />
              <Image src="/art/items/kandil.jpg" alt="" fill sizes="160px" className={cn("rounded-full object-cover ring-4 ring-[#f6efe6]/20", spun && "opacity-50 grayscale")} />
            </button>
            {prize ? (
              <div className="flex animate-[pop_0.5s_ease-out_both] flex-col items-center gap-2" role="status">
                <p className="text-2xl font-semibold">+{prize.sparks} Sparks</p>
                {prize.item && (
                  <p className="inline-flex items-center gap-2 rounded-full bg-[#f6efe6]/15 px-3 py-1.5 text-sm">
                    <Image src={prize.item.art} alt="" width={24} height={24} className="rounded-full" /> and a {prize.item.name.toLowerCase()}!
                  </p>
                )}
              </div>
            ) : spun ? (
              <p className="text-sm text-[#f6efe6]/80">
                Resting until midnight UTC · <span className="font-mono tabular-nums">{untilMidnight === null ? "--:--:--" : hms(untilMidnight)}</span>
              </p>
            ) : (
              <p className="text-sm text-[#f6efe6]/80">Tap to spin. Sparks every day, sometimes a little gift.</p>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-8">
        {!data ? (
          <Skeleton className="h-96 rounded-[2rem]" />
        ) : (
          groups.map((g) => {
            const list = data.quests.filter((x) => x.kind === g.kind);
            if (!list.length) return null;
            return (
              <section key={g.kind} aria-labelledby={`q-${g.kind}`}>
                <h2 id={`q-${g.kind}`} className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                  {g.kind === "event" && <Diya className="size-6" />}
                  {g.title}
                </h2>
                <ul className="grid gap-3">
                  {list.map((quest) => {
                    const lantern = quest.id.startsWith("lantern-night");
                    const link = QUEST_LINK[quest.id];
                    return (
                    <li key={quest.id} className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft", lantern ? "border-butter-ink/40 ring-2 ring-butter" : "border-border")}>
                      {lantern && <SkyLantern className="h-11 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{quest.title}</p>
                        <p className="text-sm text-muted-foreground">{quest.description}</p>
                        {link && familiar && !quest.claimed && !quest.claimable && (
                          <Link href={link.href(familiar.label)} className="mt-1 inline-flex h-8 items-center text-sm text-primary underline-offset-4 hover:underline">
                            {link.text}
                          </Link>
                        )}
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(quest.progress / quest.goal) * 100}%` }} />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {quest.progress}/{quest.goal}
                          </span>
                        </div>
                      </div>
                      {quest.claimed ? (
                        <span className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-success">
                          <Check className="size-4" aria-hidden /> Done
                        </span>
                      ) : (
                        <Button size="sm" variant={quest.claimable ? "primary" : "outline"} disabled={!quest.claimable} loading={claim.isPending && claim.variables?.id === quest.id} onClick={() => claim.mutate(quest)}>
                          <EmberIcon className="size-4" /> {quest.reward}
                        </Button>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}

        {data && (
          <section aria-labelledby="badges">
            <h2 id="badges" className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <GiftBox className="size-7" /> Badges
            </h2>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {data.badges.map((b) =>
                LIMITED[b.id] ? (
                  <li key={b.id} className={cn("relative col-span-2 flex items-center gap-3 overflow-hidden rounded-2xl bg-[#141632] p-4 text-[#f6efe6]", b.earned && "ring-2 ring-[#f3c58a]")}>
                    <span className={cn("grid size-12 shrink-0 place-items-center", !b.earned && "opacity-60")}>
                      <SkyLantern className="h-11" lit={b.earned} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.name}</span>
                      <span className="block text-xs text-[#f6efe6]/70">{b.earned ? "Yours. Forever. Show-off." : `Limited · ${LIMITED[b.id]}`}</span>
                    </span>
                    {!b.earned && <Lock className="ml-auto size-4 shrink-0 text-[#f6efe6]/60" aria-label="Not earned yet" />}
                  </li>
                ) : (
                  <li key={b.id} className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 text-center", b.earned ? "border-primary/30 bg-wash text-primary" : "border-dashed border-border text-muted-foreground")}>
                    <span className="grid size-12 place-items-center">{b.earned ? BADGE_ICON[b.id] : <Lock className="size-5" aria-hidden />}</span>
                    <span className={cn("text-xs font-medium", b.earned ? "text-foreground" : "")}>{b.name}</span>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
      <Bunting count={9} className="max-w-xs" />
      <Diya className="size-16" />
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
