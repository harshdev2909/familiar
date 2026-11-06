/**
 * Accessories. Equipped items are written into the portrait prompt, so the Familiar actually wears
 * them in its next painting. Festival items are sold only during the festival, owned forever.
 */
export type Slot = "head" | "neck" | "hand" | "back" | "ground";
export type Rarity = "common" | "rare" | "festive";

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  rarity: Rarity;
  festival: "diwali" | null;
  art: string;
  /** Phrase appended to the image prompt when equipped. */
  wear: string;
  blurb: string;
}

export const ITEMS: readonly Item[] = [
  { id: "diya", name: "Clay diya", slot: "hand", price: 40, rarity: "festive", festival: "diwali", art: "/art/items/diya.jpg", wear: "gently holding a small glowing clay diya lamp", blurb: "A little flame to carry through the dark." },
  { id: "sparkler", name: "Phuljhadi", slot: "hand", price: 30, rarity: "festive", festival: "diwali", art: "/art/items/sparkler.jpg", wear: "holding a lit sparkler with golden sparks", blurb: "Thirty seconds of pure joy." },
  { id: "garland", name: "Marigold garland", slot: "neck", price: 60, rarity: "festive", festival: "diwali", art: "/art/items/garland.jpg", wear: "wearing a garland of orange marigold flowers", blurb: "Fresh from the morning market." },
  { id: "dupatta", name: "Silk dupatta", slot: "neck", price: 70, rarity: "festive", festival: "diwali", art: "/art/items/dupatta.jpg", wear: "wearing a deep red silk dupatta with a golden border", blurb: "Borrowed from a grandmother's trunk." },
  { id: "crown", name: "Marigold crown", slot: "head", price: 80, rarity: "festive", festival: "diwali", art: "/art/items/crown.jpg", wear: "wearing a tiny crown woven from marigold flowers", blurb: "For the brightest night of the year." },
  { id: "kandil", name: "Akash kandil", slot: "back", price: 90, rarity: "festive", festival: "diwali", art: "/art/items/kandil.jpg", wear: "with a glowing paper star lantern floating just behind it", blurb: "A star lantern that follows it home." },
  { id: "mithai", name: "Box of mithai", slot: "ground", price: 50, rarity: "festive", festival: "diwali", art: "/art/items/mithai.jpg", wear: "with a little open box of ladoos and barfi beside it", blurb: "Shared, obviously. Mostly." },
  { id: "rangoli", name: "Rangoli", slot: "ground", price: 120, rarity: "rare", festival: "diwali", art: "/art/items/rangoli.jpg", wear: "sitting beside a colourful round rangoli of petals and powder", blurb: "Drawn by paw, petal by petal." },
  { id: "scarf", name: "Cozy scarf", slot: "neck", price: 45, rarity: "common", festival: null, art: "/art/items/scarf.jpg", wear: "wearing a cozy hand-knitted cream and terracotta striped scarf", blurb: "For cold nights and long talks." },
  { id: "starcap", name: "Star cap", slot: "head", price: 35, rarity: "common", festival: null, art: "/art/items/starcap.jpg", wear: "wearing a tiny cone party hat covered in gold stars", blurb: "Every night is a small celebration." },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

/** Diwali 2026 falls on 8 November; the festival runs the surrounding fortnight. */
export const FESTIVALS = {
  diwali: { id: "diwali", name: "Diwali", start: "2026-11-01", end: "2026-11-10", period: "diwali-2026" },
} as const;

export function activeFestival(today: string, override?: string) {
  if (override === "none") return null;
  if (override === "diwali") return FESTIVALS.diwali;
  const d = FESTIVALS.diwali;
  return today >= d.start && today <= d.end ? d : null;
}
