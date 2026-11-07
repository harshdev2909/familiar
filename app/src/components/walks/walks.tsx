"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Footprints } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/art/Mascot";
import { Avatar } from "@/components/explore/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { WalkView } from "@/lib/api-types";
import { ROUND4 } from "@/lib/art";

export const WALK_ART = ROUND4.walk;

/** Sassy, short copy for the ways a walk says no; the server's own words for the rest. */
export function walkError(e: unknown, fallback = "The walk tripped over its own feet. Try again?") {
  if (isApiError(e, "ALREADY_WALKED")) return "One walk a night. Little legs. Again after midnight UTC.";
  if (isApiError(e, "WALK_FULL")) return "Three's a walk. Four's a parade. This one's full.";
  if (isApiError(e, "UNAUTHENTICATED")) return "Sign in first. Walks need a keeper.";
  return isApiError(e) ? e.message : fallback;
}

/** Host a night walk, then head to its lobby. */
export function useStartWalk() {
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: api.startWalk,
    onSuccess: (r) => router.push(`/walk/${r.walk.id}`),
    onError: (e) => toast(walkError(e), "error"),
  });
}

/** Owner card: start a walk. */
export function WalkCard() {
  const start = useStartWalk();
  return (
    <div className="sticker flex items-center gap-4 p-4">
      <Mascot src={WALK_ART} size={64} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold tracking-tight">Night walk</p>
        <p className="text-sm text-muted-foreground">Three Familiars, one painting. +20 Sparks each.</p>
      </div>
      <Button variant="secondary" onClick={() => start.mutate()} loading={start.isPending} className="shrink-0">
        <Footprints className="size-4" aria-hidden /> Start
      </Button>
    </div>
  );
}

/** Overlapping member avatars. */
export function MemberStack({ walk, size = 32, className }: { walk: Pick<WalkView, "members">; size?: number; className?: string }) {
  return (
    <span className={cn("flex", className)}>
      {walk.members.map((m, i) => (
        <Avatar key={m.label} species={m.species} portraitUrl={m.portraitUrl} size={size} ringWidth={2} className={cn(i > 0 && "-ml-2.5")} />
      ))}
    </span>
  );
}

/** The paintings from walks this Familiar went on. Hidden for visitors when there are none. */
export function WalksStrip({ name, isOwner }: { name: string; isOwner: boolean }) {
  const q = useQuery({ queryKey: ["walks", name], queryFn: () => api.walks(name), retry: (n, e) => !isApiError(e, "NOT_FOUND") && n < 1 });
  const start = useStartWalk();
  const walks = q.data?.walks.filter((w) => w.status === "done" && w.imageUrl) ?? [];
  if (q.isError || (!isOwner && q.data && walks.length === 0)) return null;
  return (
    <section id="walks" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-12" aria-labelledby="walks-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="walks-title" className="flex items-center gap-2 text-sm font-medium text-primary">
          <Footprints className="size-4" aria-hidden /> Night walks
        </h2>
        {isOwner && walks.length > 0 && (
          <button onClick={() => start.mutate()} disabled={start.isPending} className="h-10 rounded-full px-2 text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50">
            {start.isPending ? "Gathering…" : "Start another"}
          </button>
        )}
      </div>
      {q.isPending ? (
        <div className="mt-3 flex gap-4 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-64 shrink-0 rounded-bubble" />
          ))}
        </div>
      ) : walks.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-4 rounded-blob border border-dashed border-border p-5 sm:flex-row sm:items-center">
          <span className="relative block aspect-[4/3] w-36 shrink-0 overflow-hidden rounded-2xl bg-paper">
            <Image src={WALK_ART} alt="" fill sizes="144px" className="object-cover" />
          </span>
          <div className="flex-1">
            <p className="font-medium">No walks yet.</p>
            <p className="text-sm text-muted-foreground">{name} would like friends. Two, ideally. Start a walk, send the link, and you all get painted together.</p>
          </div>
          <Button onClick={() => start.mutate()} loading={start.isPending}>
            <Footprints className="size-4" aria-hidden /> Start a night walk
          </Button>
        </div>
      ) : (
        <ul className="-mx-5 mt-3 flex snap-x gap-4 overflow-x-auto px-5 pb-2">
          {walks.map((w) => (
            <li key={w.id} className="w-64 shrink-0 snap-start sm:w-72">
              <Link href={`/walk/${w.id}`} className="sticker group flex flex-col overflow-hidden">
                <span className="relative block aspect-[4/3] bg-paper">
                  <Image src={w.imageUrl!} alt={`A night walk with ${w.members.map((m) => m.label).join(", ")}`} fill sizes="288px" unoptimized className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03]" />
                </span>
                <span className="flex items-center gap-2 px-3 py-2.5">
                  <MemberStack walk={w} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{w.members.map((m) => m.label).join(" · ")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
