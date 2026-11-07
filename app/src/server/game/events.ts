import { env } from "../env";
import { utcDate } from "../familiar/rules";

/**
 * Event spotlights: real-world events the Familiars celebrate. Dates are inclusive, in UTC.
 * Bonuses are applied server-side (visit multiplier, event quests); the copy here is what the UI shows.
 */
export interface EventDef {
  id: "devcon-8" | "ethglobal-mumbai" | "diwali-2026" | "lantern-night";
  name: string;
  place: string;
  start: string;
  end: string;
  logo: string | null;
  art: string;
  url: string | null;
  blurb: string;
  bonus: string;
  /** Multiplier on the Sparks a visit earns while the event is live. */
  visitSparksMultiplier: number;
}

export const EVENTS: readonly EventDef[] = [
  {
    id: "devcon-8",
    name: "Devcon 8",
    place: "Jio World Centre, Mumbai",
    start: "2026-11-03",
    end: "2026-11-06",
    logo: "/logos/devcon.svg",
    art: "/art/spotlight/devcon.jpg",
    url: "https://devcon.org",
    blurb: "Ethereum's builders gather in Mumbai. Tell your Familiar what you learned today.",
    bonus: "Quest: visit during Devcon for 40 Sparks",
    visitSparksMultiplier: 1,
  },
  {
    id: "ethglobal-mumbai",
    name: "ETHGlobal Mumbai",
    place: "Mumbai",
    start: "2026-11-05",
    end: "2026-11-07",
    logo: "/logos/ethglobal.svg",
    art: "/art/spotlight/hackathon.jpg",
    url: "https://ethglobal.com/events/mumbai",
    blurb: "A weekend of hacking. Your Familiar stays up with you.",
    bonus: "Visits earn 2× Sparks · Quest: spot 3 Familiars for 60 Sparks",
    visitSparksMultiplier: 2,
  },
  {
    id: "diwali-2026",
    name: "Diwali",
    place: "Everywhere",
    start: "2026-11-01",
    end: "2026-11-10",
    logo: null,
    art: "/art/diwali/fireworks.jpg",
    url: null,
    blurb: "The festival of lights. Diyas, marigolds and sweets in the shop.",
    bonus: "Festival accessories and Diwali quests",
    visitSparksMultiplier: 1,
  },
  {
    id: "lantern-night",
    name: "Lantern Night",
    place: "Everywhere",
    start: "2026-11-08",
    end: "2026-11-08",
    logo: null,
    art: "/art/events/lantern-night.jpg",
    url: null,
    blurb: "The night of Diwali itself. Every sky fills with fireworks and paper lanterns — visit and your Familiar's portrait does too.",
    bonus: "Every portrait gets fireworks · limited badge",
    visitSparksMultiplier: 1,
  },
];

export type EventStatus = "live" | "upcoming" | "ended";

export interface EventView {
  id: string;
  name: string;
  place: string;
  start: string;
  end: string;
  logo: string | null;
  art: string;
  url: string | null;
  blurb: string;
  bonus: string;
  status: EventStatus;
}

/** Ended events stay visible this long after they finish. */
const ENDED_VISIBLE_DAYS = 14;
const DAY_MS = 86_400_000;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;

export const eventStatus = (e: Pick<EventDef, "start" | "end">, today: string): EventStatus =>
  today < e.start ? "upcoming" : today > e.end ? "ended" : "live";

/** "Today" for events: EVENTS_TODAY when set (tests, previews), otherwise the real UTC date. */
export const eventsToday = () => env().EVENTS_TODAY ?? utcDate();

export const eventById = (id: EventDef["id"]) => EVENTS.find((e) => e.id === id)!;

export const isLive = (id: EventDef["id"], today = eventsToday()) => eventStatus(eventById(id), today) === "live";

/** Live first (ending soonest), then upcoming (starting soonest), then recently ended (latest first). */
export function eventViews(today = eventsToday()): EventView[] {
  const rank: Record<EventStatus, number> = { live: 0, upcoming: 1, ended: 2 };
  return EVENTS.map((e) => ({ e, status: eventStatus(e, today) }))
    .filter(({ e, status }) => status !== "ended" || dayNumber(today) - dayNumber(e.end) <= ENDED_VISIBLE_DAYS)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "upcoming" ? a.e.start.localeCompare(b.e.start) : a.status === "live" ? a.e.end.localeCompare(b.e.end) : b.e.end.localeCompare(a.e.end)))
    .map(({ e, status }) => ({ id: e.id, name: e.name, place: e.place, start: e.start, end: e.end, logo: e.logo, art: e.art, url: e.url, blurb: e.blurb, bonus: e.bonus, status }));
}

/** Sparks multiplier for a visit made today (the best live event wins; never stacks). */
export const visitSparksMultiplier = (today = eventsToday()) =>
  Math.max(1, ...EVENTS.filter((e) => eventStatus(e, today) === "live").map((e) => e.visitSparksMultiplier));

/**
 * The event's window in real time. When EVENTS_TODAY shifts the calendar, the window shifts with
 * it, so records created "now" fall on the pretend day (keeps event quests consistent in tests).
 */
export function eventWindow(e: Pick<EventDef, "start" | "end">, today = eventsToday(), realToday = utcDate()) {
  const shift = (dayNumber(today) - dayNumber(realToday)) * DAY_MS;
  const from = new Date(Date.parse(`${e.start}T00:00:00Z`) - shift);
  const to = new Date(Date.parse(`${e.end}T00:00:00Z`) + DAY_MS - shift);
  return { from, to, fromDate: utcDate(from), toDate: utcDate(new Date(to.getTime() - DAY_MS)) };
}

/** Painted into every visit portrait while Lantern Night is live. */
export const LANTERN_NIGHT_SKY = ", the night sky behind it full of Diwali fireworks and floating paper sky lanterns";

/** Extra words for tonight's visit image prompt from live events ("" on ordinary nights). */
export const eventImagePromptSuffix = (today = eventsToday()) => (isLive("lantern-night", today) ? LANTERN_NIGHT_SKY : "");
