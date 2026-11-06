"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { DexResult, ExploreFamiliar, ExploreResult } from "@/lib/api-types";

/** Patch one familiar in every cached explore result. */
export function usePatchExplore() {
  const qc = useQueryClient();
  return (label: string, patch: Partial<ExploreFamiliar>) =>
    qc.setQueriesData<ExploreResult>({ queryKey: ["explore"] }, (d) => (d ? { familiars: d.familiars.map((f) => (f.label === label ? { ...f, ...patch } : f)) } : d));
}

/** Refresh everything a spot or gift touches: Sparks, quests, the Dex and the map. */
export function useAfterSocial() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["quests"] }),
      qc.invalidateQueries({ queryKey: ["dex"] }),
      qc.invalidateQueries({ queryKey: ["explore"] }),
    ]);
}

/** Send today's gift to a spotted Familiar. */
export function useGift() {
  const qc = useQueryClient();
  const toast = useToast();
  const patch = usePatchExplore();
  const after = useAfterSocial();
  const markGifted = (label: string) => {
    patch(label, { giftedToday: true });
    qc.setQueriesData<DexResult>({ queryKey: ["dex"] }, (d) => (d ? { ...d, spotted: d.spotted.map((s) => (s.label === label ? { ...s, giftedToday: true } : s)) } : d));
  };
  return useMutation({
    mutationFn: (label: string) => api.gift(label),
    onSuccess: (r, label) => {
      markGifted(label);
      toast(`Gift sent. ${label} gets 5 Sparks${r.reward.xp ? ` · you get +${r.reward.xp} XP` : ""}`);
      void after();
    },
    onError: (e, label) => {
      if (isApiError(e, "ALREADY_GIFTED")) {
        markGifted(label);
        toast(`You already sent ${label} a gift today. Tomorrow!`);
      } else if (isApiError(e, "FORBIDDEN")) toast(`Spot ${label} first, then you can send gifts`, "error");
      else toast(isApiError(e) ? e.message : "The gift didn't go through — try again", "error");
    },
  });
}
