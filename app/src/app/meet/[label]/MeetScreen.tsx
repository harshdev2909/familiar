"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { Sparkle, StarCharm } from "@/components/art/Charm";
import { EmberIcon } from "@/components/art/Icons";
import { Avatar } from "@/components/explore/Avatar";
import { MEET_ART } from "@/components/familiar/MeetCard";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { api, isApiError } from "@/lib/api";
import type { MeetResult } from "@/lib/api-types";
import { RING_BORDER, speciesName, toneOf } from "@/lib/art";
import { useReducedMotion } from "@/lib/browser";
import { useSession } from "@/lib/session";

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

type Outcome = { kind: "met"; result: MeetResult } | { kind: "already" } | { kind: "stale" } | { kind: "error"; message: string };

/** `/meet/[label]?c=…` — the page a meet-code QR opens. */
export function MeetScreen({ params }: { params: Promise<{ label: string }> }) {
  const { label } = use(params);
  const code = useSearchParams().get("c")?.trim() ?? "";
  const { session, familiar: mine, loading } = useSession();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const [signIn, setSignIn] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const fq = useQuery({ queryKey: ["familiar", label], queryFn: () => api.familiar(label), retry: (n, e) => !isApiError(e, "NOT_FOUND") && n < 2 });
  const them = fq.data?.familiar ?? null;

  const meet = useMutation({
    mutationFn: async () => {
      const [r] = await Promise.all([api.meet(label, code), new Promise((ok) => setTimeout(ok, reduced ? 0 : 700))]);
      return r;
    },
    onSuccess: (result) => {
      setOutcome({ kind: "met", result });
      void Promise.all(["me", "dex", "explore", "quests"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
    onError: (e) => {
      if (isApiError(e, "ALREADY_MET")) setOutcome({ kind: "already" });
      else if (isApiError(e, "INVALID_CODE")) setOutcome({ kind: "stale" });
      else setOutcome({ kind: "error", message: isApiError(e) ? e.message : "The handshake slipped. Try again?" });
    },
  });

  if (fq.isPending || loading) return <Skeleton className="mx-auto mt-10 h-[30rem] w-full max-w-md rounded-blob" />;
  if (fq.isError || !them) {
    return (
      <Shell>
        <Image src={MEET_ART} alt="" width={128} height={128} className="rounded-full bg-paper shadow-sticker" />
        <h1 className="text-2xl font-semibold tracking-tight">{isApiError(fq.error, "NOT_FOUND") ? `No one called ${label} lives here.` : "Couldn't load this Familiar."}</h1>
        <p className="text-muted-foreground">{isApiError(fq.error, "NOT_FOUND") ? "Check the QR again. Squinting helps." : "Check your connection and try again."}</p>
        {!isApiError(fq.error, "NOT_FOUND") && <Button onClick={() => fq.refetch()}>Try again</Button>}
      </Shell>
    );
  }

  const tone = toneOf(them.species);
  const isMine = mine?.label === them.label;
  const met = outcome?.kind === "met";

  return (
    <Shell>
      {/* Their card */}
      <div className="relative grid size-56 place-items-center">
        <Avatar species={them.species} portraitUrl={them.portraitUrl} alt={`${them.label}'s portrait`} size={176} ringWidth={6} className={cn(met && "animate-bounce-soft", outcome?.kind === "stale" && "animate-wobble")} />
        {meet.isPending && <StarCharm className="pointer-events-none absolute left-1/2 top-1/2 -ml-7 -mt-8 animate-toss [--from-x:-70px] [--from-y:200px]" />}
        {met && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <span className={cn("absolute inset-2 animate-ring rounded-full border-4", RING_BORDER[tone])} />
            <span className="absolute inset-8 animate-ring rounded-full border-2 border-butter-ink [animation-delay:120ms]" />
            {SPARKS.map((a, i) => (
              <Sparkle key={a} className={cn("absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 animate-burst", i % 2 ? "text-butter-ink" : "text-blush-ink", i % 3 === 0 ? "size-4" : "size-3")} style={{ ["--angle" as string]: `${a}deg`, animationDelay: `${(i % 3) * 60}ms` }} />
            ))}
            <StarCharm className="absolute -right-2 bottom-2 h-14 w-12 animate-pop" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{them.label}</h1>
        <div className="flex flex-wrap justify-center gap-2">
          <Pill tone={tone}>{speciesName(them.species)}</Pill>
          <Pill>{them.stage}</Pill>
          <Pill>Level {them.level.level}</Pill>
        </div>
      </div>

      {/* What happens */}
      <div className="flex min-h-28 w-full flex-col items-center gap-3" aria-live="polite">
        {met ? (
          <>
            <p className="text-xl font-semibold tracking-tight">Met in person. Officially iconic.</p>
            <p className="inline-flex animate-pop items-center gap-1.5 rounded-full bg-butter px-3 py-1.5 text-sm font-semibold text-butter-ink">
              <EmberIcon className="size-4" /> +{outcome.result.reward.sparks} Sparks · +{outcome.result.reward.xp} XP · 3×{outcome.result.newSpecies && " · new kind!"}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <ButtonLink href="/dex">See your Dex</ButtonLink>
              {mine && (
                <ButtonLink href={`/f/${mine.label}`} variant="outline">
                  Back to {mine.label}
                </ButtonLink>
              )}
            </div>
          </>
        ) : outcome?.kind === "already" ? (
          <>
            <p className="text-xl font-semibold tracking-tight">You two already met.</p>
            <p className="max-w-xs text-sm text-muted-foreground">{them.label} never forgets a face. Triple Sparks only happen once per friend.</p>
            <ButtonLink href="/dex" variant="outline">Open your Dex</ButtonLink>
          </>
        ) : outcome?.kind === "stale" ? (
          <>
            <p className="text-xl font-semibold tracking-tight">That code has gone stale.</p>
            <p className="max-w-xs text-sm text-muted-foreground">Codes refresh at midnight UTC. Ask {them.label}&apos;s keeper to show today&apos;s QR.</p>
          </>
        ) : !code ? (
          <>
            <p className="text-xl font-semibold tracking-tight">This link lost its code.</p>
            <p className="max-w-xs text-sm text-muted-foreground">Scan the QR again, straight from {them.label}&apos;s page.</p>
          </>
        ) : !session ? (
          <>
            <p className="max-w-xs text-[15px] text-muted-foreground">Sign in to say you met. In person counts triple.</p>
            <Button size="lg" onClick={() => setSignIn(true)}>Sign in to say hi</Button>
          </>
        ) : !mine ? (
          <>
            <p className="max-w-xs text-[15px] text-muted-foreground">You&apos;ll need a Familiar of your own first. Then come back to this page.</p>
            <ButtonLink href="/hatch" size="lg">Hatch yours</ButtonLink>
          </>
        ) : isMine ? (
          <>
            <p className="text-xl font-semibold tracking-tight">That&apos;s you. Nice try.</p>
            <p className="max-w-xs text-sm text-muted-foreground">Show this QR to someone else. Meeting yourself doesn&apos;t count, however charming.</p>
          </>
        ) : (
          <>
            <p className="max-w-xs text-[15px] text-muted-foreground">
              Standing next to {them.label}&apos;s keeper right now? Tap it. {mine.label} gets triple Sparks for the real thing.
            </p>
            <Button size="lg" onClick={() => meet.mutate()} loading={meet.isPending} className="min-w-48">
              <Handshake className="size-5" aria-hidden /> We met!
            </Button>
            {outcome?.kind === "error" && (
              <p className="text-sm text-destructive" role="alert">
                {outcome.message}
              </p>
            )}
          </>
        )}
      </div>

      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[image:var(--gradient-bg)]">
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 pb-24 pt-10 text-center md:pt-14">{children}</div>
    </div>
  );
}
