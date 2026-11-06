"use client";

import { activeFestival } from "@/server/game/catalog";
import { useNow } from "./browser";

/** The active festival by the visitor's clock (null during SSR, so static pages never freeze it). */
export function useFestival() {
  const now = useNow();
  if (now === null) return null;
  return activeFestival(new Date(now).toISOString().slice(0, 10), process.env.NEXT_PUBLIC_FESTIVAL);
}
