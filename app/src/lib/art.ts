/** Brand illustrations (generated on 0G Seedream in the product's own watercolor style). */
export const SPECIES = [
  { id: "fox", name: "Fox", color: "ember orange", art: "/art/fox.jpg", line: "Curious, quick to notice the small things." },
  { id: "owl", name: "Owl", color: "dusk lavender", art: "/art/owl.jpg", line: "Sleepy-eyed and wise. Listens longest." },
  { id: "otter", name: "Otter", color: "tide blue", art: "/art/otter.jpg", line: "Keeps a pebble from every good day." },
  { id: "moth", name: "Moth", color: "honey gold", art: "/art/moth.jpg", line: "Drawn to every small light." },
  { id: "axolotl", name: "Axolotl", color: "rose pink", art: "/art/axolotl.jpg", line: "Always smiling. Regrows from anything." },
  { id: "cat", name: "Cat", color: "ink black", art: "/art/cat.jpg", line: "Unimpressed, secretly devoted." },
  { id: "dragonling", name: "Dragonling", color: "moss green", art: "/art/dragonling.jpg", line: "Small wings, big feelings." },
  { id: "bunny", name: "Bunny", color: "snow white", art: "/art/bunny.jpg", line: "Soft-footed, first to notice you're home." },
] as const;

export type SpeciesId = (typeof SPECIES)[number]["id"];

export const speciesArt = (species: string) => SPECIES.find((s) => s.id === species)?.art ?? "/art/egg.jpg";

export const ART = {
  egg: "/art/egg.jpg",
  eggCrack: "/art/egg-crack.jpg",
  hatchling: "/art/fox.jpg",
  sprite: "/art/fox-sprite.jpg",
  guardian: "/art/fox-guardian.jpg",
  asleep: "/art/fox-asleep.jpg",
};

/** Ember, the brand mascot, in the moments the product needs to show (generated on 0G Seedream). */
export const MASCOT = {
  hungry: "/art/ember/hungry.jpg",
  fed: "/art/ember/fed.jpg",
  listening: "/art/ember/listening.jpg",
  thinking: "/art/ember/thinking.jpg",
  waking: "/art/ember/waking.jpg",
  talk: "/art/ember/talk.jpg",
  remember: "/art/ember/remember.jpg",
  paint: "/art/ember/paint.jpg",
  lantern: "/art/ember/lantern.jpg",
} as const;

/** Each species' pastel, for map rings and Dex cards (tokens in globals.css). */
export type Tone = "blush" | "mint" | "butter" | "lilac" | "sky" | "peach";
// In grid order (fox → bunny) no two neighbours share a pastel, in rows of 2 or 4.
export const SPECIES_TONE: Record<string, Tone> = { fox: "peach", owl: "lilac", otter: "sky", moth: "butter", axolotl: "blush", cat: "sky", dragonling: "mint", bunny: "blush" };
export const toneOf = (species: string): Tone => SPECIES_TONE[species] ?? "lilac";
export const speciesName = (species: string) => SPECIES.find((s) => s.id === species)?.name ?? species;

/** Static class strings per tone (Tailwind needs to see them whole). */
export const TONE_CLASS: Record<Tone, { bg: string; ink: string; ring: string; solid: string }> = {
  blush: { bg: "bg-blush", ink: "text-blush-ink", ring: "ring-blush-ink/70", solid: "bg-blush-ink" },
  mint: { bg: "bg-mint", ink: "text-mint-ink", ring: "ring-mint-ink/70", solid: "bg-mint-ink" },
  butter: { bg: "bg-butter", ink: "text-butter-ink", ring: "ring-butter-ink/70", solid: "bg-butter-ink" },
  lilac: { bg: "bg-lilac", ink: "text-lilac-ink", ring: "ring-lilac-ink/70", solid: "bg-lilac-ink" },
  sky: { bg: "bg-sky", ink: "text-sky-ink", ring: "ring-sky-ink/70", solid: "bg-sky-ink" },
  peach: { bg: "bg-peach", ink: "text-peach-ink", ring: "ring-peach-ink/70", solid: "bg-peach-ink" },
};

export const CARE_ART = { snack: "/art/care/snack.jpg", pet: "/art/care/pet.jpg", play: "/art/care/play.jpg", sleepy: "/art/care/sleepy.jpg" } as const;
