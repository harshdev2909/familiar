"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Zzz } from "@/components/art/Doodles";
import { EmberIcon } from "@/components/art/Icons";
import { SoftHeart } from "@/components/art/Charm";
import { Crumbs, PlayBall } from "@/components/art/Handmade";
import { PixelBolt, PixelBowl, PixelHearts, PixelSmile } from "@/components/art/Pixel";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, careOf, isApiError } from "@/lib/api";
import type { CareAction, CareView, FamiliarView } from "@/lib/api-types";
import { CARE_ART, speciesArt } from "@/lib/art";
import { useNow } from "@/lib/browser";

const SNACK_COST = 5;

const NEED_LINE: Record<NonNullable<CareView["need"]>, string> = {
  hungry: "I'm hungry!",
  lonely: "Pet me?",
  sleepy: "So sleepy…",
};

const BUTTONS: { action: CareAction; key: "A" | "B" | "C"; label: string; note?: string }[] = [
  { action: "snack", key: "A", label: "Snack", note: `${SNACK_COST} Sparks` },
  { action: "pet", key: "B", label: "Pet" },
  { action: "play", key: "C", label: "Play" },
];

const LEAD: Record<CareAction, string> = { snack: "Munch munch.", pet: "Happy wiggle.", play: "Again, again!" };
const MOTION: Record<CareAction, string> = { snack: "animate-munch", pet: "animate-wobble", play: "animate-bounce-soft" };
// Where each floating heart drifts (px) and when it starts (s).
const HEARTS = [
  { dx: -26, delay: 0, left: "30%" },
  { dx: 14, delay: 0.15, left: "52%" },
  { dx: -8, delay: 0.32, left: "44%" },
  { dx: 30, delay: 0.46, left: "62%" },
  { dx: -18, delay: 0.6, left: "36%" },
];

function shortWait(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function rewardLine(action: CareAction, r: { sparks: number; xp: number }) {
  const bits = [r.sparks ? `${r.sparks > 0 ? "+" : "−"}${Math.abs(r.sparks)} Spark${Math.abs(r.sparks) === 1 ? "" : "s"}` : null, r.xp ? `+${r.xp} XP` : null].filter(Boolean);
  return `${LEAD[action]} ${bits.join(" · ")}`.trim();
}

/**
 * The Tamagotchi corner: an egg-shaped device with an LCD (pixel hearts for Fullness / Joy / Energy and
 * a need bubble) and three chunky buttons — A Snack, B Pet, C Play — with real server cooldowns.
 */
export function CarePanel({ familiar, onFamiliar }: { familiar: FamiliarView; onFamiliar: (f: FamiliarView) => void }) {
  const care = careOf(familiar);
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const [flash, setFlash] = useState<{ action: CareAction; id: number } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const act = useMutation({
    mutationFn: (action: CareAction) => api.care(familiar.label, action),
    onSuccess: (r) => {
      onFamiliar(r.familiar);
      setFlash({ action: r.action, id: Date.now() });
      toast(rewardLine(r.action, r.reward));
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["quests"] });
    },
    onError: (e, action) => {
      if (isApiError(e, "COOLDOWN")) {
        const readyAt = (e.details as { readyAt?: string } | undefined)?.readyAt;
        const sec = readyAt && now ? Math.max(1, Math.floor((Date.parse(readyAt) - now) / 1000)) : null;
        toast(sec ? `Not yet — ${action} is ready in ${shortWait(sec)}` : "Not yet — give it a moment", "error");
        void qc.invalidateQueries({ queryKey: ["familiar", familiar.label] });
      } else if (isApiError(e, "INSUFFICIENT_SPARKS")) {
        toast(`A snack costs ${SNACK_COST} Sparks. Spin the lantern for more.`, "error");
      } else {
        toast(isApiError(e) ? e.message : "That didn't land — try again", "error");
      }
    },
  });

  if (!care) return null; // older backend: no care meters yet

  const wait = (a: CareAction) => {
    const at = care.ready[a];
    if (!at || now === null) return 0;
    return Math.max(0, Math.floor((Date.parse(at) - now) / 1000));
  };
  const sleepy = care.need === "sleepy" || care.energy < 25;
  // The care illustrations are of Ember, a fox — other kinds act it out with their own portrait.
  const fox = familiar.species === "fox";
  const own = familiar.portraitUrl ?? speciesArt(familiar.species);
  const art = fox && flash ? CARE_ART[flash.action] : fox && sleepy ? CARE_ART.sleepy : own;
  const bubble = familiar.dormant ? "Zzz…" : flash ? (flash.action === "snack" ? "Yum!" : flash.action === "pet" ? "Hehe" : "Wheee!") : care.need ? NEED_LINE[care.need] : "Feeling cozy";

  const meters = [
    { key: "fullness", label: "Full", name: "Fullness", Icon: PixelBowl },
    { key: "joy", label: "Joy", name: "Joy", Icon: PixelSmile },
    { key: "energy", label: "Energy", name: "Energy", Icon: PixelBolt },
  ] as const;

  return (
    <section aria-labelledby="care-title" className="sticker flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="care-title" className="text-lg font-semibold tracking-tight">Little things</h2>
        <p className="text-xs text-muted-foreground">Snack, pet, play. It notices.</p>
      </div>

      {/* The egg shell */}
      <div className="rounded-[2.5rem_2.5rem_2rem_2rem] bg-blush p-3 pb-4 sm:p-4">
        {/* LCD */}
        <div className="lcd-grain relative grid grid-cols-[1fr_auto] items-center gap-3 rounded-[1.25rem] bg-lcd p-3.5 font-mono text-lcd-ink shadow-[inset_0_2px_6px_oklch(0.2_0.05_140/0.25)] sm:gap-4 sm:p-4">
          <ul className="flex flex-col gap-2.5 text-[11px] uppercase tracking-[0.12em]">
            {meters.map(({ key, label, name, Icon }) => (
              <li key={key} className="flex items-center gap-2">
                <Icon className="size-3.5 shrink-0" />
                <span className="w-12 shrink-0">{label}</span>
                <PixelHearts value={care.hearts[key]} label={name} className="text-[15px]" />
              </li>
            ))}
          </ul>

          <div className="relative flex flex-col items-center gap-1.5">
            <p
              key={bubble}
              className="relative animate-pop whitespace-nowrap rounded-xl bg-[oklch(0.97_0.02_120)] px-2 py-0.5 text-[11px] font-medium text-lcd-ink shadow-[0_1px_0_oklch(0.2_0.05_140/0.3)] after:absolute after:left-1/2 after:top-full after:-ml-1 after:border-4 after:border-transparent after:border-t-[oklch(0.97_0.02_120)] after:content-['']"
              aria-live="polite"
            >
              {bubble}
            </p>
            <div className="relative size-20 overflow-hidden rounded-2xl bg-[oklch(0.93_0.03_110)] ring-2 ring-lcd-ink/30 sm:size-24">
              <Image
                key={art}
                src={art}
                alt={flash ? `${familiar.label} enjoying a ${flash.action}` : sleepy ? `${familiar.label}, sleepy` : familiar.label}
                fill
                sizes="96px"
                className={cn("object-cover", flash ? MOTION[flash.action] : "animate-breathe motion-reduce:animate-none", familiar.dormant && "opacity-60 grayscale")}
              />
              {sleepy && !flash && <Zzz className="absolute right-0.5 top-0.5 h-5 w-6 text-lcd-ink" />}
              {flash && !fox && flash.action === "snack" && (
                <span key={flash.id} className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center" aria-hidden>
                  <Crumbs className="h-4 w-10 animate-crumb text-lcd-ink" />
                </span>
              )}
              {flash && !fox && flash.action === "play" && (
                <span key={flash.id} className="pointer-events-none absolute bottom-1 right-1" aria-hidden>
                  <PlayBall className="size-5 animate-hop text-lcd-ink" />
                </span>
              )}
            </div>
            {flash && (
              <div key={flash.id} className="pointer-events-none absolute inset-0" aria-hidden>
                {HEARTS.map((h, i) => (
                  <SoftHeart
                    key={i}
                    className="absolute bottom-3 size-4 animate-float-heart text-blush-ink"
                    style={{ left: h.left, animationDelay: `${h.delay}s`, ["--dx" as string]: `${h.dx}px` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* A · B · C */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {BUTTONS.map((b) => {
            const w = wait(b.action);
            const broke = b.action === "snack" && familiar.sparks < SNACK_COST;
            const busy = act.isPending && act.variables === b.action;
            const disabled = familiar.dormant || w > 0 || act.isPending || broke;
            const status = familiar.dormant ? "asleep" : w > 0 ? `ready in ${shortWait(w)}` : broke ? `needs ${SNACK_COST} Sparks` : b.note ?? "ready";
            return (
              <div key={b.action} className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => act.mutate(b.action)}
                  disabled={disabled}
                  aria-label={`${b.key}: ${b.label}${b.note ? `, costs ${b.note}` : ""} — ${status}`}
                  className={cn(
                    "chunky grid size-14 place-items-center rounded-full bg-card text-lg font-semibold text-blush-ink ring-2 ring-blush-ink/25 disabled:cursor-not-allowed disabled:opacity-55",
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                    busy && "animate-pulse",
                  )}
                >
                  {b.key}
                </button>
                <span className="text-sm font-medium leading-none">{b.label}</span>
                <span className={cn("flex h-4 items-center gap-1 font-mono text-[11px] tabular-nums", w > 0 || broke ? "text-blush-ink" : "text-muted-foreground")}>
                  {w > 0 ? (
                    shortWait(w)
                  ) : b.note ? (
                    <>
                      <EmberIcon className="size-3" /> {SNACK_COST}
                    </>
                  ) : (
                    "free"
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {familiar.dormant && <p className="text-sm text-muted-foreground">It&apos;s asleep. Wake it first, then it&apos;s all yours.</p>}
    </section>
  );
}
