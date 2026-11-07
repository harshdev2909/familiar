"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Footprints, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Sparkle } from "@/components/art/Charm";
import { EmberIcon } from "@/components/art/Icons";
import { LanternSky } from "@/components/art/Lantern";
import { PawTrail } from "@/components/art/Handmade";
import { Avatar } from "@/components/explore/Avatar";
import { ShareLink } from "@/components/ShareLink";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { WALK_ART, walkError } from "@/components/walks/walks";
import { api, isApiError } from "@/lib/api";
import type { WalkView } from "@/lib/api-types";
import { speciesName } from "@/lib/art";
import { useSession } from "@/lib/session";

const SLOTS = 3;
const SPARKS = [0, 60, 120, 180, 240, 300];

export function WalkScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session, familiar: mine, loading } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [signIn, setSignIn] = useState(false);
  const key = ["walk", id, session?.address ?? null] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.walk(id),
    enabled: !loading,
    retry: (n, e) => !isApiError(e, "NOT_FOUND") && n < 2,
    // Lobby: watch for friends arriving. Painting: check every 3 s. Done: stop.
    refetchInterval: (query) => {
      const s = query.state.data?.walk.status;
      return s === "painting" ? 3000 : s === "gathering" ? 5000 : false;
    },
  });
  const walk = q.data?.walk ?? null;

  const set = (r: { walk: WalkView }) => qc.setQueryData(key, r);
  const join = useMutation({
    mutationFn: () => api.joinWalk(id),
    onSuccess: (r) => {
      set(r);
      toast(r.walk.status === "painting" ? "That's three. Painting starts now." : "You're in. Shoes on.");
    },
    onError: (e) => {
      toast(walkError(e), "error");
      void q.refetch();
    },
  });
  const begin = useMutation({
    mutationFn: () => api.beginWalk(id),
    onSuccess: set,
    onError: (e) => {
      toast(walkError(e, "Couldn't get everyone moving. Try again?"), "error");
      void q.refetch();
    },
  });

  // When the painting lands, Sparks and quests have moved: refresh them once.
  const status = walk?.status;
  const was = useRef(status);
  useEffect(() => {
    if (was.current === "painting" && status === "done") {
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["quests"] });
      void qc.invalidateQueries({ queryKey: ["walks"] });
    }
    was.current = status;
  }, [status, qc]);

  if (q.isPending) return <Skeleton className="mx-auto mt-10 h-[32rem] w-full max-w-3xl rounded-blob" />;
  if (q.isError || !walk) {
    const missing = isApiError(q.error, "NOT_FOUND");
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
        <span className="relative block size-32 overflow-hidden rounded-full bg-paper shadow-sticker">
          <Image src={WALK_ART} alt="" fill sizes="128px" className="object-cover" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{missing ? "This walk wandered off." : "Couldn't find the walk."}</h1>
        <p className="text-muted-foreground">{missing ? "The link might be old, or someone typed it with their elbow." : "Check your connection and try again."}</p>
        {missing ? <ButtonLink href={mine ? `/f/${mine.label}#walks` : "/explore"}>Start your own</ButtonLink> : <Button onClick={() => q.refetch()}>Try again</Button>}
      </div>
    );
  }

  const slots = Array.from({ length: SLOTS }, (_, i) => walk.members[i] ?? null);
  const open = SLOTS - walk.members.length;
  const isHost = Boolean(mine && mine.label === walk.host);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-24 pt-6 md:pt-10">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <Footprints className="size-4" aria-hidden /> Night walk
        </p>
        <h1 className="mt-1 text-balance text-4xl font-semibold tracking-tight">
          {walk.status === "done"
            ? "Painted together."
            : walk.status === "painting"
              ? "Everyone hold still."
              : walk.status === "failed"
                ? "The paint ran."
                : `${walk.host}'s gathering a walk.`}
        </h1>
        <p className="mt-2 max-w-lg text-muted-foreground">
          {walk.status === "done"
            ? "One street, one night, one painting. Every walker got 20 Sparks and 20 XP."
            : walk.status === "painting"
              ? "Painting every Familiar on one lantern-lit street. Usually under a minute. Nobody blink."
              : walk.status === "failed"
                ? "The painting didn't make it. No Sparks lost — try another walk tomorrow."
                : "Three Familiars stroll a lantern-lit street and get painted together. Starts when there are three, or when the host says go."}
        </p>
      </div>

      {/* The stage: the painting, or a night street waiting for it. */}
      <div className="relative overflow-hidden rounded-blob bg-[#141632] shadow-sticker">
        {walk.status === "done" && walk.imageUrl ? (
          <div className="relative aspect-[4/3] animate-pop">
            <Image src={walk.imageUrl} alt={`${walk.members.map((m) => m.label).join(", ")} on a night walk together`} fill priority sizes="(min-width: 768px) 720px, 100vw" unoptimized className="object-cover" />
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {SPARKS.map((a, i) => (
                <Sparkle key={a} className={cn("absolute left-1/2 top-1/2 size-4 animate-burst", i % 2 ? "text-butter" : "text-blush")} style={{ ["--angle" as string]: `${a}deg`, animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative aspect-[4/3]">
            <Image src={WALK_ART} alt="" fill priority sizes="(min-width: 768px) 720px, 100vw" className={cn("object-cover", walk.status === "failed" ? "opacity-40 grayscale" : "opacity-70")} />
            {walk.status !== "failed" && <LanternSky />}
            {walk.status === "painting" && (
              <div className="absolute inset-0 grid place-items-center bg-[#141632]/40" role="status">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f6efe6] px-4 py-2 text-sm font-medium text-[#141632] shadow-sticker">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Painting {walk.members.length} Familiars…
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Who's walking */}
      <section aria-labelledby="walkers" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="walkers" className="text-sm font-medium text-primary">Walkers</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {walk.members.length}/{SLOTS}
          </span>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {slots.map((m, i) =>
            m ? (
              <li key={m.label} className="sticker flex animate-rise flex-col items-center gap-2 p-3 text-center sm:p-4">
                <Avatar species={m.species} portraitUrl={m.portraitUrl} size={64} alt="" />
                <Link href={`/f/${m.label}`} className="max-w-full truncate rounded-full px-1 text-sm font-medium hover:underline">
                  {m.label}
                </Link>
                <span className="-mt-1.5 truncate text-xs text-muted-foreground">
                  {m.label === walk.host ? "host" : speciesName(m.species).toLowerCase()}
                  {mine?.label === m.label && " · you"}
                </span>
              </li>
            ) : (
              <li key={`open${i}`} className="flex flex-col items-center justify-center gap-2 rounded-bubble border-2 border-dashed border-border p-3 text-center sm:p-4">
                <span className="grid size-16 place-items-center rounded-full bg-muted">
                  <PawTrail steps={2} className="h-5 opacity-60" />
                </span>
                <span className="text-sm text-muted-foreground">{walk.status === "gathering" ? "Spot saved" : "—"}</span>
              </li>
            ),
          )}
        </ul>
      </section>

      {/* What you can do */}
      {walk.status === "gathering" && (
        <section className="flex flex-col gap-4 rounded-blob border border-border bg-card p-5 shadow-soft sm:p-6" aria-label="Join or start">
          {!loading && !session ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-[15px]">Sign in to bring your Familiar along.</p>
              <Button size="lg" onClick={() => setSignIn(true)}>Sign in to join</Button>
            </div>
          ) : !loading && !mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-[15px]">Walks need a Familiar. Hatch one, then come back to this link.</p>
              <ButtonLink href="/hatch" size="lg">Hatch yours</ButtonLink>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[15px]">
                {walk.canJoin
                  ? `${mine?.label ?? "Your Familiar"} could use the fresh air.`
                  : walk.canStart
                    ? open
                      ? `${walk.members.length} of you is plenty. Or wait for a third.`
                      : "Everyone's here."
                    : walk.joined
                      ? isHost
                        ? "Send the link. You need at least one friend to start."
                        : `You're in. Waiting on ${walk.host} — or a third walker.`
                      : "This walk isn't taking new walkers."}
              </p>
              {walk.canJoin && (
                <Button size="lg" onClick={() => join.mutate()} loading={join.isPending}>
                  <Footprints className="size-4" aria-hidden /> Join the walk
                </Button>
              )}
              {walk.canStart && (
                <Button size="lg" onClick={() => begin.mutate()} loading={begin.isPending}>
                  Start walking
                </Button>
              )}
            </div>
          )}
          {open > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {open === 1 ? "One spot left." : `${open} spots left.`} Send this to a keeper you like. Or tolerate.
              </p>
              <ShareLink url={walk.inviteUrl} title="Come on a night walk" text={`${walk.host} is going on a night walk. Bring your Familiar.`} copyLabel="Copy invite" />
            </div>
          )}
        </section>
      )}

      {walk.status === "done" && (
        <div className="flex flex-wrap items-center gap-3">
          {walk.joined && (
            <Pill tone="butter" className="h-9 px-3 text-sm">
              <EmberIcon className="size-4" /> +20 Sparks · +20 XP
            </Pill>
          )}
          {walk.imageUrl && (
            <a href={walk.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full px-3 text-sm text-primary underline-offset-4 hover:underline">
              Open full size <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          {mine && (
            <ButtonLink href={`/f/${mine.label}#walks`} variant="outline" className="ml-auto">
              Back to {mine.label}
            </ButtonLink>
          )}
        </div>
      )}
      {walk.status === "failed" && mine && (
        <ButtonLink href={`/f/${mine.label}`} variant="outline" className="self-start">
          Back to {mine.label}
        </ButtonLink>
      )}

      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}
