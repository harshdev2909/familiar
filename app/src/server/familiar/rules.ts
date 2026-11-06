import { keccak256, stringToHex } from "viem";

export const MOODS = ["joyful", "calm", "tired", "anxious", "proud", "sad", "curious"] as const;
export type Mood = (typeof MOODS)[number];

export const SPECIES = ["fox", "owl", "otter", "moth", "axolotl", "cat", "dragonling", "bunny"] as const;
export const COLORS = ["ember orange", "moss green", "dusk lavender", "tide blue", "honey gold", "rose pink", "snow white", "ink black"] as const;
export type Species = (typeof SPECIES)[number];
export type Color = (typeof COLORS)[number];

export type Stage = "hatchling" | "sprite" | "guardian";

/** Growth: every 7th visit evolves the Familiar. */
export function stageFor(day: number): Stage {
  if (day >= 14) return "guardian";
  if (day >= 7) return "sprite";
  return "hatchling";
}

export const isEvolutionDay = (day: number) => day > 0 && day % 7 === 0;

const STAGE_MODIFIER: Record<Stage, string> = {
  hatchling: "tiny newborn hatchling, oversized eyes, a bit of eggshell nearby",
  sprite: "young sprite, small glowing wings, playful posture",
  guardian: "wise guardian form, gentle aura, larger and calmer",
};

/** Deterministic look for a label when the user doesn't choose one. */
export function defaultLook(label: string): { species: Species; color: Color } {
  const h = BigInt(keccak256(stringToHex(label)));
  return { species: SPECIES[Number(h % BigInt(SPECIES.length))]!, color: COLORS[Number((h >> 8n) % BigInt(COLORS.length))]! };
}

/** Fixed per Familiar (set at hatch) so every portrait is the same creature. */
export function styleSeed(species: string, color: string) {
  return `cute round ${species} creature, ${color} fur, soft watercolor, storybook illustration, centered, plain background, same character as before`;
}

export const imagePromptFor = (seed: string, stage: Stage, scene: string) => `${seed}, ${STAGE_MODIFIER[stage]}. ${scene}`;

/** YYYY-MM-DD in UTC. */
export const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);

/** Next 00:00 UTC — when iAI credits refresh. */
export function nextRefresh(d = new Date()) {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return n;
}

/** Streak after a visit on `today`, given the previous visit date. */
export function nextStreak(prevDate: string | null, prevStreak: number, today: string) {
  if (!prevDate) return 1;
  if (prevDate === today) return prevStreak;
  const diff = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${prevDate}T00:00:00Z`)) / 86_400_000;
  return diff === 1 ? prevStreak + 1 : 1;
}
