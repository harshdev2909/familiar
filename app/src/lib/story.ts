import { ART, MASCOT, type Tone } from "./art";

/** Ember's story: how every Familiar's life goes, one chapter per thing the product does. */
export type Chapter = {
  n: number;
  id: string;
  art: string;
  alt: string;
  title: string;
  /** One or two short sentences, for the home page trail. */
  short: string;
  /** A little more, for the storybook at /story. */
  long: string;
  tone: Tone;
  /** Where this chapter happens in the app, if anywhere. */
  link?: { href: string; label: string };
};

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    id: "egg",
    art: "/art/events/egg-hatch.jpg",
    alt: "A speckled pastel egg with a ribbon bow, smiling",
    title: "An egg arrives on your doorstep.",
    short: "Warm, a little heavy, tied with a ribbon. It hums when you say its name.",
    long: "Warm, a little heavy, tied with a ribbon. Nobody else on the street seems to hear it humming. You give it a name, and the humming changes key, as if it already knows you.",
    tone: "butter",
    link: { href: "/hatch", label: "Hatch yours" },
  },
  {
    n: 2,
    id: "listen",
    art: MASCOT.listening,
    alt: "Ember the fox, ears up, listening",
    title: "It listens to your day.",
    short: "Sixty seconds, every night. The burnt chai, the good news, the long train home.",
    long: "Sixty seconds, every night. The burnt chai, the good news, the long train home. It doesn't scroll or interrupt. It answers in one warm line, out loud.",
    tone: "peach",
  },
  {
    n: 3,
    id: "remember",
    art: MASCOT.remember,
    alt: "Ember the fox writing in a small book with a quill",
    title: "It remembers, privately.",
    short: "Not your words, just who you are. A few lines, locked with a key only it holds.",
    long: "Not your words, just who you are. Your voice is forgotten when the visit ends; what's left is a few lines, locked with a key only your Familiar holds. Ask it to forget, and it does.",
    tone: "lilac",
    link: { href: "/privacy", label: "How it keeps secrets" },
  },
  {
    n: 4,
    id: "grow",
    art: ART.sprite,
    alt: "Ember grown into a sprite, with a soft glow",
    title: "It grows a little each night.",
    short: "A new portrait after every visit. On the seventh night, a new form.",
    long: "A new portrait after every visit, painted from your mood. On the seventh night it becomes a sprite, and on the fourteenth a guardian. Miss a week and it curls up to sleep until you're back.",
    tone: "mint",
  },
  {
    n: 5,
    id: "wander",
    art: "/art/explore/map.jpg",
    alt: "A watercolour map of a little town by the water",
    title: "It wanders out to meet the others.",
    short: "Across the map and past the sea wall. It comes home with new friends for your Dex.",
    long: "Across the map and past the sea wall, to wherever the other Familiars are out tonight. Spot one with a star charm, send it a gift a day, and fill your Dex one kind at a time.",
    tone: "sky",
    link: { href: "/explore", label: "Open the map" },
  },
  {
    n: 6,
    id: "diwali",
    art: "/art/diwali/lantern.jpg",
    alt: "Ember the fox beneath a glowing paper lantern",
    title: "Diwali night: lights for everyone.",
    short: "It hangs a lantern in the window, and saves one for a friend down the road.",
    long: "It hangs a lantern in the window, wears something new from the bazaar, and saves one light for a friend down the road. Every Familiar in town glows a little brighter tonight.",
    tone: "blush",
    link: { href: "/shop", label: "Visit the bazaar" },
  },
];
