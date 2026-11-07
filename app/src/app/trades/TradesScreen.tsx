"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PawTrail } from "@/components/art/Handmade";
import { Avatar } from "@/components/explore/Avatar";
import { SignInDialog } from "@/components/SignIn";
import { tradeError } from "@/components/trades/ProposeSwap";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill, type PillTone, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { TradeItem, TradeStatus, TradeView, TradesResult } from "@/lib/api-types";
import { ROUND4 } from "@/lib/art";
import { humanDuration, useCountdown } from "@/lib/hooks";
import { useSession } from "@/lib/session";

const STATUS: Record<TradeStatus, { label: string; tone: PillTone }> = {
  pending: { label: "waiting", tone: "sky" },
  accepted: { label: "swapped", tone: "mint" },
  declined: { label: "declined", tone: "peach" },
  cancelled: { label: "cancelled", tone: "muted" },
  expired: { label: "expired", tone: "muted" },
};

type Action = "accept" | "decline" | "cancel";

export function TradesScreen() {
  const { session, familiar, loading, refresh } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [signIn, setSignIn] = useState(false);
  const q = useQuery({ queryKey: ["trades"], queryFn: api.trades, enabled: Boolean(familiar), refetchInterval: 60_000 });

  const act = useMutation({
    mutationFn: ({ trade, action }: { trade: TradeView; action: Action }) =>
      action === "accept" ? api.acceptTrade(trade.id) : action === "decline" ? api.declineTrade(trade.id) : api.cancelTrade(trade.id),
    onSuccess: async ({ trade }, { action }) => {
      // Move it to history straight away; the refetch settles the rest.
      qc.setQueryData<TradesResult>(["trades"], (d) =>
        d ? { incoming: d.incoming.filter((t) => t.id !== trade.id), outgoing: d.outgoing.filter((t) => t.id !== trade.id), history: [trade, ...d.history] } : d,
      );
      toast(
        action === "accept"
          ? `Done. The ${trade.give.name.toLowerCase()} is yours. Wear it with attitude.`
          : action === "decline"
            ? "Declined. Politely, of course."
            : "Offer withdrawn. Mysterious.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["trades"] }),
        qc.invalidateQueries({ queryKey: ["shop"] }),
        qc.invalidateQueries({ queryKey: ["familiar"] }),
        action === "accept" ? refresh() : null,
      ]);
    },
    onError: (e) => {
      toast(tradeError(e), "error");
      void q.refetch();
    },
  });

  if (!loading && !session)
    return (
      <Empty title="Swaps live here" body="Sign in to trade accessories with Familiars you've spotted.">
        <Button onClick={() => setSignIn(true)}>Sign in</Button>
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </Empty>
    );
  if (!loading && !familiar)
    return (
      <Empty title="Hatch a Familiar first" body="It's hard to swap outfits without someone to wear them.">
        <ButtonLink href="/hatch">Hatch yours</ButtonLink>
      </Empty>
    );

  const data = q.data;
  const busy = (t: TradeView, a: Action) => act.isPending && act.variables?.trade.id === t.id && act.variables.action === a;
  const nothing = data && !data.incoming.length && !data.outgoing.length && !data.history.length;

  return (
    <div className="mx-auto max-w-4xl px-5 pb-24 pt-6 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="max-w-md">
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <ArrowLeftRight className="size-4" aria-hidden /> Swaps
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Fair trades. Mostly.</h1>
          <p className="mt-2 text-muted-foreground">Swap accessories with Familiars you&apos;ve spotted or met. Offers wait 72 hours, then quietly give up.</p>
        </div>
        <span className="relative block aspect-[4/3] w-40 shrink-0 overflow-hidden rounded-bubble bg-paper shadow-sticker sm:w-48">
          <Image src={ROUND4.swap} alt="" fill priority sizes="192px" className="object-cover" />
        </span>
      </div>

      {q.isError ? (
        <div className="mt-10 flex flex-col items-start gap-3 rounded-blob border border-dashed border-border p-6">
          <p className="font-medium">Couldn&apos;t open the swap table.</p>
          <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
        </div>
      ) : !data ? (
        <div className="mt-10 grid gap-3">
          <Skeleton className="h-28 rounded-bubble" />
          <Skeleton className="h-28 rounded-bubble" />
        </div>
      ) : nothing ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-blob border border-dashed border-border p-8 text-center">
          <PawTrail steps={4} className="h-6" />
          <p className="font-medium">Nothing on the table.</p>
          <p className="max-w-xs text-sm text-muted-foreground">Open a friend from your Dex or the map and make an offer they can&apos;t refuse.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/dex">Open your Dex</ButtonLink>
            <ButtonLink href="/explore" variant="outline">Explore</ButtonLink>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-10">
          <Group title="For you" empty="No offers for you right now. Your wardrobe is clearly intimidating." count={data.incoming.length}>
            {data.incoming.map((t) => (
              <TradeRow key={t.id} trade={t} side="incoming" past={t.status !== "pending"}>
                {t.status === "pending" && (
                  <>
                <Button size="sm" onClick={() => act.mutate({ trade: t, action: "accept" })} loading={busy(t, "accept")} disabled={act.isPending} className="h-10">
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ trade: t, action: "decline" })} loading={busy(t, "decline")} disabled={act.isPending} className="h-10">
                  Decline
                </Button>
                  </>
                )}
              </TradeRow>
            ))}
          </Group>
          <Group title="You offered" empty="No offers out. Go on, be bold." count={data.outgoing.length}>
            {data.outgoing.map((t) => (
              <TradeRow key={t.id} trade={t} side="outgoing" past={t.status !== "pending"}>
                {t.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ trade: t, action: "cancel" })} loading={busy(t, "cancel")} disabled={act.isPending} className="h-10">
                    Cancel
                  </Button>
                )}
              </TradeRow>
            ))}
          </Group>
          {data.history.length > 0 && (
            <Group title="Lately" count={data.history.length}>
              {data.history.map((t) => (
                <TradeRow key={t.id} trade={t} side={t.to.label === familiar?.label ? "incoming" : "outgoing"} past />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, empty, count, children }: { title: string; empty?: string; count: number; children: React.ReactNode }) {
  const id = `trades-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
        {title}
        {count > 0 && <span className="font-mono text-xs text-muted-foreground">{count}</span>}
      </h2>
      {count ? <ul className="grid gap-3">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function ItemChip({ item, label }: { item: TradeItem; label: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl bg-paper ring-1 ring-border">
        {item.art && <Image src={item.art} alt="" fill sizes="48px" className="object-cover" />}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[11px] text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">{item.name}</span>
      </span>
    </span>
  );
}

function Expiry({ at }: { at: string }) {
  const left = useCountdown(at);
  if (left === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs", left < 6 * 3600 ? "text-peach-ink" : "text-muted-foreground")}>
      <Clock className="size-3.5" aria-hidden />
      {left === 0 ? "expiring" : `${humanDuration(left)} left`}
    </span>
  );
}

/**
 * One offer, always from the viewer's side: "you get" on the left, "you give" on the right.
 * Incoming: they give `give`, want your `want`. Outgoing: the reverse.
 */
function TradeRow({ trade, side, past, children }: { trade: TradeView; side: "incoming" | "outgoing"; past?: boolean; children?: React.ReactNode }) {
  const other = side === "incoming" ? trade.from : trade.to;
  const youGet = side === "incoming" ? trade.give : trade.want;
  const youGive = side === "incoming" ? trade.want : trade.give;
  const s = STATUS[trade.status];
  return (
    <li className={cn("flex flex-col gap-4 rounded-bubble border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center", past && "opacity-80")}>
      <Link href={`/f/${other.label}`} className="flex min-w-0 items-center gap-3 rounded-bubble sm:w-44">
        <Avatar species={other.species} portraitUrl={other.portraitUrl} size={44} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{other.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{side === "incoming" ? "offers you" : "you asked"}</span>
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ItemChip item={youGet} label="you get" />
        <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-label="for" />
        <ItemChip item={youGive} label="you give" />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {past ? <Pill tone={s.tone}>{s.label}</Pill> : <Expiry at={trade.expiresAt} />}
        {children}
      </div>
    </li>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
      <span className="relative block aspect-[4/3] w-48 overflow-hidden rounded-bubble bg-paper shadow-sticker">
        <Image src={ROUND4.swap} alt="" fill sizes="192px" className="object-cover" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
