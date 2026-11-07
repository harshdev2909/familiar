"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/explore/Avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { ShopItemView, TradeParty } from "@/lib/api-types";
import { useSession } from "@/lib/session";

/** Sassy copy where it helps; the server's own (specific) words otherwise. */
export function tradeError(e: unknown, fallback = "The swap fell through. Try again?") {
  if (isApiError(e, "NOT_FRIENDS")) return "Spot them first. Strangers don't swap.";
  return isApiError(e) ? e.message : fallback;
}

/** Item tiles as a radio group: big, tappable, keyboard-friendly. */
function ItemPicker({ legend, hint, name, items, value, onChange }: { legend: string; hint: string; name: string; items: ShopItemView[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      {items.length === 0 && <p className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">You already own everything. Show-off.</p>}
      <div className="-mx-1 grid max-h-56 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
        {items.map((i) => (
          <label
            key={i.id}
            className={cn(
              "relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border p-1.5 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === i.id ? "border-primary bg-wash" : "border-border bg-card hover:bg-accent",
            )}
          >
            <input type="radio" name={name} value={i.id} checked={value === i.id} onChange={() => onChange(i.id)} className="sr-only" />
            <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-paper">
              <Image src={i.art} alt="" fill sizes="96px" className="object-cover" />
            </span>
            <span className="line-clamp-2 min-h-8 text-[11px] leading-4">{i.name}</span>
            {value === i.id && (
              <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Propose a swap": pick one of yours, pick one you'd like back. The server checks their wardrobe. */
export function ProposeSwapDialog({ to, open, onClose }: { to: TradeParty | null; open: boolean; onClose: () => void }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [give, setGive] = useState<string | null>(null);
  const [want, setWant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shop = useQuery({ queryKey: ["shop", session?.address ?? null], queryFn: api.shop, enabled: open });
  const mine = shop.data?.items.filter((i) => i.owned) ?? [];
  const theirs = shop.data?.items.filter((i) => !i.owned) ?? [];

  const close = () => {
    setGive(null);
    setWant(null);
    setError(null);
    onClose();
  };
  const send = useMutation({
    mutationFn: () => api.proposeTrade(to!.label, give!, want!),
    onSuccess: () => {
      toast(`Offer sent to ${to!.label}. Now we wait. Dramatically.`);
      void qc.invalidateQueries({ queryKey: ["trades"] });
      close();
    },
    onError: (e) => setError(tradeError(e)),
  });

  if (!to) return null;
  return (
    <Dialog open={open} onClose={close} title={`Swap with ${to.label}`} description="One of yours for one of theirs. They have 72 hours to decide.">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-center gap-3" aria-hidden>
          <Avatar species={to.species} portraitUrl={to.portraitUrl} size={44} />
          <ArrowLeftRight className="size-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">you</span>
        </div>
        {shop.isPending ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : shop.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Couldn&apos;t open your wardrobe.</p>
            <Button variant="outline" onClick={() => shop.refetch()}>Try again</Button>
          </div>
        ) : mine.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-butter p-4 text-butter-ink">
            <p className="text-sm">Your wardrobe&apos;s empty. Hard to haggle with nothing.</p>
            <ButtonLink href="/shop" size="sm" onClick={close} className="bg-card text-foreground hover:bg-accent">Visit the shop</ButtonLink>
          </div>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (give && want) send.mutate();
            }}
          >
            <ItemPicker legend="You give" hint="From your wardrobe. Worn items come off if they say yes." name="give" items={mine} value={give} onChange={setGive} />
            <ItemPicker legend="You'd like" hint={`I can't peek in ${to.label}'s closet. Pick something and I'll ask.`} name="want" items={theirs} value={want} onChange={setWant} />
            {error && (
              <p className="rounded-2xl bg-peach px-3 py-2 text-sm text-peach-ink" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/trades" onClick={close} className="inline-flex h-10 items-center rounded-full text-sm text-primary underline-offset-4 hover:underline">
                Your swaps
              </Link>
              <Button type="submit" size="lg" disabled={!give || !want} loading={send.isPending}>
                <ArrowLeftRight className="size-4" aria-hidden /> Send offer
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
