"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Diya, FairyLights } from "@/components/art/Diwali";
import { EmberIcon } from "@/components/art/Icons";
import { Bunting, GiftBox, WashiTape } from "@/components/art/Handmade";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { ShopItemView } from "@/lib/api-types";
import { useSession } from "@/lib/session";

const SLOT: Record<string, string> = { head: "Head", neck: "Neck", hand: "Paws", back: "Behind", ground: "Beside" };

function daysLeft(end: string) {
  const ms = Date.parse(`${end}T23:59:59Z`) - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function ShopScreen() {
  const { session, familiar, refresh } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [signIn, setSignIn] = useState(false);
  const q = useQuery({ queryKey: ["shop", session?.address ?? null], queryFn: api.shop });

  const after = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["shop"] }), refresh(), qc.invalidateQueries({ queryKey: ["familiar"] }), qc.invalidateQueries({ queryKey: ["quests"] })]);
  };
  const buy = useMutation({
    mutationFn: (item: ShopItemView) => api.buy(item.id),
    onSuccess: async (_r, item) => {
      toast(`${item.name} is ${familiar?.label ?? "your Familiar"}'s now`);
      await after();
    },
    onError: (e) => toast(isApiError(e) ? e.message : "Couldn't buy that", "error"),
  });
  const wear = useMutation({
    mutationFn: (v: { item: ShopItemView; on: boolean }) => api.equip(familiar!.label, v.item.slot, v.on ? v.item.id : null),
    onSuccess: async (_r, v) => {
      toast(v.on ? `${familiar!.label} will wear it in tonight's portrait` : `Taken off`);
      await after();
    },
    onError: (e) => toast(isApiError(e) ? e.message : "Couldn't change that", "error"),
  });

  const data = q.data;
  const festive = data?.items.filter((i) => i.festival) ?? [];
  const everyday = data?.items.filter((i) => !i.festival) ?? [];

  const card = (item: ShopItemView) => {
    const canAfford = (data?.sparks ?? 0) >= item.price;
    const busy = (buy.isPending && buy.variables?.id === item.id) || (wear.isPending && wear.variables?.item.id === item.id);
    return (
      <li key={item.id} className={cn("flex flex-col overflow-hidden rounded-3xl border bg-card shadow-soft", item.equipped ? "border-primary ring-2 ring-primary/30" : "border-border")}>
        <div className="relative aspect-square bg-paper">
          <Image src={item.art} alt={item.name} fill sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw" className="object-cover" />
          <span
            className={cn(
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium",
              item.rarity === "rare" ? "bg-foreground text-background" : item.rarity === "festive" ? "bg-primary text-primary-foreground" : "bg-card/90 text-muted-foreground",
            )}
          >
            {item.rarity === "festive" ? "Diwali" : item.rarity === "rare" ? "Rare" : "Everyday"}
          </span>
          {item.owned && (
            <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-success text-background" aria-label="Owned">
              <Check className="size-4" aria-hidden />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium">{item.name}</p>
            <span className="text-xs text-muted-foreground">{SLOT[item.slot]}</span>
          </div>
          <p className="text-sm leading-snug text-muted-foreground">{item.blurb}</p>
          <div className="mt-auto pt-3">
            {!session ? (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setSignIn(true)}>
                <EmberIcon className="size-4 text-primary" /> {item.price}
              </Button>
            ) : !familiar ? (
              <ButtonLink href="/hatch" variant="outline" size="sm" className="w-full">Hatch first</ButtonLink>
            ) : item.owned ? (
              <Button variant={item.equipped ? "secondary" : "primary"} size="sm" className="w-full" loading={busy} onClick={() => wear.mutate({ item, on: !item.equipped })}>
                {item.equipped ? "Take off" : "Wear tonight"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="w-full" loading={busy} disabled={!item.available || !canAfford} onClick={() => buy.mutate(item)}>
                <EmberIcon className="size-4 text-primary" /> {item.price}
                {!item.available ? " · ended" : !canAfford ? " · need more" : ""}
              </Button>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-6">
      <section className="relative grid items-center gap-6 overflow-hidden rounded-[2rem] bg-wash p-6 pt-10 sm:grid-cols-[1fr_auto] sm:p-10 sm:pt-14">
        <Bunting className="absolute inset-x-0 top-0" />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-primary">The bazaar</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Little things for your Familiar.</h1>
          <p className="max-w-md text-muted-foreground">Pay with Sparks you earn by visiting. Whatever it wears, it wears in tonight&apos;s portrait.</p>
          {data?.sparks != null && (
            <p className="mt-2 inline-flex items-center gap-2 self-start rounded-full bg-card px-4 py-2 text-sm shadow-soft">
              <EmberIcon className="size-4 text-primary" />
              <span className="font-semibold tabular-nums">{data.sparks}</span> Sparks
              <Link href="/quests" className="ml-2 text-primary underline-offset-4 hover:underline">Earn more</Link>
            </p>
          )}
        </div>
        <div className="relative mx-auto">
          <Image src="/art/diwali/shop.jpg" alt="Ember behind a little market stall" width={260} height={260} priority className="rounded-3xl ring-1 ring-border" />
          <WashiTape tone="blush" className="absolute -top-2 left-1/2 h-6 w-20 -translate-x-1/2 rotate-3" />
        </div>
      </section>

      {q.isPending ? (
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-3xl" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="mt-10 flex items-center justify-between rounded-2xl border border-border p-5">
          <span className="text-muted-foreground">The bazaar is closed for a moment.</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          {data!.festival && festive.length > 0 && (
            <section className="relative mt-12" aria-labelledby="festival">
              <FairyLights className="mb-2" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Diya className="size-10" />
                  <div>
                    <h2 id="festival" className="text-2xl font-semibold tracking-tight">Diwali collection</h2>
                    <p className="text-sm text-muted-foreground">Limited — on sale for {daysLeft(data!.festival.end)} more days. Yours forever.</p>
                  </div>
                </div>
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{festive.map(card)}</ul>
            </section>
          )}
          <section className="mt-14" aria-labelledby="everyday">
            <h2 id="everyday" className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <GiftBox className="size-9" /> Everyday
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{everyday.map(card)}</ul>
          </section>
        </>
      )}
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}
