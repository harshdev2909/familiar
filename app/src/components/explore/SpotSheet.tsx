"use client";

import { ArrowLeftRight, Check, Gift, Handshake } from "lucide-react";
import { useState } from "react";
import { Sparkle, StarCharm } from "@/components/art/Charm";
import { EmberIcon } from "@/components/art/Icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { ExploreFamiliar, SpotResult } from "@/lib/api-types";
import { speciesName, toneOf } from "@/lib/art";
import { useReducedMotion } from "@/lib/browser";
import { Avatar } from "./Avatar";
import { useAfterSocial, useGift, usePatchExplore } from "./social";

type Phase = "idle" | "tossing" | "caught" | "missed";
const TOSS_MS = 900;
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];
const RING: Record<string, string> = {
  blush: "border-blush-ink",
  mint: "border-mint-ink",
  butter: "border-butter-ink",
  lilac: "border-lilac-ink",
  sky: "border-sky-ink",
  peach: "border-peach-ink",
};

/**
 * Bottom sheet for a Familiar on the map. "Spot it" tosses a star charm in an arc; it lands, a sparkle
 * ring bursts, and the Sparks pop. `canAct` is false when signed out or without a Familiar. Key it by
 * label so each Familiar gets a fresh sheet.
 */
export function SpotSheet({
  familiar,
  open,
  onClose,
  canAct,
  onNeedAccount,
  onSwap,
}: {
  familiar: ExploreFamiliar;
  open: boolean;
  onClose: () => void;
  canAct: boolean;
  onNeedAccount: () => void;
  /** Open "Propose a swap" for this friend (shown once spotted). */
  onSwap?: () => void;
}) {
  const toast = useToast();
  const reduced = useReducedMotion();
  const patch = usePatchExplore();
  const after = useAfterSocial();
  const gift = useGift();
  const [phase, setPhase] = useState<Phase>("idle");
  const [reward, setReward] = useState<SpotResult | null>(null);

  const spot = async () => {
    if (!canAct) return onNeedAccount();
    setPhase("tossing");
    setReward(null);
    const wait = new Promise((r) => setTimeout(r, reduced ? 0 : TOSS_MS));
    try {
      const [r] = await Promise.all([api.spot(familiar.label), wait]);
      setReward(r);
      setPhase("caught");
      patch(familiar.label, { spotted: true });
      void after();
    } catch (e) {
      await wait;
      if (isApiError(e, "ALREADY_SPOTTED")) {
        setPhase("caught");
        patch(familiar.label, { spotted: true });
        return;
      }
      setPhase("missed");
      toast(isApiError(e) ? e.message : "The charm slipped — try again", "error");
    }
  };

  const tone = toneOf(familiar.species);
  const spotted = familiar.spotted || phase === "caught";

  return (
    <Dialog open={open} onClose={onClose} title={familiar.label} description={`${speciesName(familiar.species)} · ${familiar.stage}`}>
      <div className="flex flex-col items-center gap-5">
        {/* Stage: portrait + the catch */}
        <div className="relative grid size-48 place-items-center">
          <Avatar
            species={familiar.species}
            portraitUrl={familiar.portraitUrl}
            alt={`${familiar.label}'s portrait`}
            size={152}
            ringWidth={5}
            className={cn(phase === "caught" && "animate-bounce-soft", phase === "missed" && "animate-wobble")}
          />
          {phase === "tossing" && (
            <StarCharm className="pointer-events-none absolute left-1/2 top-1/2 -ml-7 -mt-8 animate-toss [--from-x:-60px] [--from-y:190px]" />
          )}
          {phase === "caught" && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <span className={cn("absolute inset-2 animate-ring rounded-full border-4", RING[tone])} />
              <span className="absolute inset-6 animate-ring rounded-full border-2 border-butter-ink [animation-delay:120ms]" />
              {SPARKS.map((a, i) => (
                <Sparkle
                  key={a}
                  className={cn("absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 animate-burst", i % 2 ? "text-butter-ink" : "text-blush-ink", i % 3 === 0 ? "size-4" : "size-3")}
                  style={{ ["--angle" as string]: `${a}deg`, animationDelay: `${(i % 3) * 60}ms` }}
                />
              ))}
              <StarCharm className="absolute -right-1 bottom-1 h-12 w-10 animate-pop" />
            </div>
          )}
          {spotted && phase !== "caught" && (
            <span className="absolute bottom-3 right-5 grid size-9 place-items-center rounded-full bg-mint text-mint-ink shadow-sticker" aria-hidden>
              <Check className="size-5" />
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Pill tone={tone}>Level {familiar.level}</Pill>
          {familiar.mood && <Pill tone="muted">feeling {familiar.mood}</Pill>}
          {familiar.mine && <Pill tone="primary">yours</Pill>}
          {familiar.metInPerson && !familiar.mine && (
            <Pill tone="butter">
              <Handshake className="size-3.5" aria-hidden /> met in person
            </Pill>
          )}
        </div>

        <div className="h-8" aria-live="polite">
          {phase === "caught" && reward && (
            <p className="inline-flex animate-pop items-center gap-1.5 rounded-full bg-butter px-3 py-1 text-sm font-semibold text-butter-ink">
              <EmberIcon className="size-4" /> +{reward.reward.sparks} Sparks · +{reward.reward.xp} XP{reward.newSpecies && " · new kind!"}
            </p>
          )}
          {phase === "caught" && !reward && <p className="text-sm text-muted-foreground">Already in your Dex.</p>}
          {phase === "tossing" && <p className="text-sm text-muted-foreground">Here it goes…</p>}
          {phase === "missed" && <p className="text-sm text-muted-foreground">So close. Try once more?</p>}
          {phase === "idle" && !familiar.mine && !spotted && <p className="text-sm text-muted-foreground">Toss a star charm to add {familiar.label} to your Dex.</p>}
          {phase === "idle" && familiar.mine && <p className="text-sm text-muted-foreground">That&apos;s you! Others can spot you here.</p>}
          {phase === "idle" && spotted && !familiar.mine && <p className="text-sm text-muted-foreground">Spotted. Friends now.</p>}
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2">
          {!familiar.mine &&
            (spotted ? (
              <Button
                size="lg"
                variant={familiar.giftedToday ? "outline" : "primary"}
                disabled={familiar.giftedToday || gift.isPending}
                loading={gift.isPending}
                onClick={() => (canAct ? gift.mutate(familiar.label) : onNeedAccount())}
              >
                <Gift className="size-4" aria-hidden /> {familiar.giftedToday ? "Gift sent today" : "Send gift"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => void spot()} loading={phase === "tossing"} disabled={phase === "tossing"}>
                <StarCharm className="-my-2 -ml-1 h-7 w-6" /> {canAct ? "Spot it" : "Sign in to spot"}
              </Button>
            ))}
          <ButtonLink href={`/f/${familiar.label}`} size="lg" variant="outline" className={cn(familiar.mine && "sm:col-span-2")}>
            Visit page
          </ButtonLink>
          {!familiar.mine && spotted && canAct && onSwap && (
            <Button size="lg" variant="ghost" onClick={onSwap} className="sm:col-span-2">
              <ArrowLeftRight className="size-4" aria-hidden /> Propose a swap
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
