import "server-only";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type { Session } from "../auth/session";
import { env } from "../env";
import { isAppError } from "../errors";
import { scheduleAfterVisit } from "../familiar/afterVisit";
import { MAX_TEXT_CHARS, familiarOf, myFamiliarRow, visit } from "../familiar/service";
import type { FamiliarView } from "../familiar/views";
import { care } from "../game/care";
import { eventViews } from "../game/events";
import { CARE_ACTIONS } from "../game/meters";
import { buy, claimQuest, equip, quests, shop, spin } from "../game/service";
import { explore, gift, spot } from "../game/social";
import { listTrades } from "../game/trades";
import { createWalk } from "../game/walks";
import { getDiary } from "../familiar/diary";
import { log } from "../log";

/**
 * Familiar as an MCP server (Streamable HTTP, stateless) for ChatGPT / Claude connectors.
 * Every tool calls the same service functions as the REST API, as the key owner's session.
 */

const SLOTS = ["head", "neck", "hand", "back", "ground"] as const;
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const abs = (url: string | null | undefined) => (!url ? null : url.startsWith("/") ? `${env().APP_URL}${url}` : url);

/** Friendly next steps for the errors a chat user can act on. */
function hint(code: string): string {
  const app = env().APP_URL;
  switch (code) {
    case "PAYMENT_REQUIRED":
      return ` Open ${app} to feed it (a small Uniswap swap) or sign in with 0G, then try again.`;
    case "DORMANT":
      return ` Open ${app} to wake it up.`;
    case "NOT_FOUND":
      return ` Hatch or find Familiars at ${app}.`;
    case "UNAUTHENTICATED":
      return ` Create a new connector key at ${app}.`;
    default:
      return "";
  }
}

function sessionOf(ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }): Session {
  const s = ctx.http?.authInfo?.extra?.session as Session | undefined;
  if (!s) throw new Error("MCP request reached a tool without a resolved session");
  return s;
}

async function run(tool: string, fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: await fn() }] };
  } catch (e) {
    if (isAppError(e)) {
      const details = e.details as { readyAt?: string } | undefined;
      const when = details?.readyAt ? ` (ready at ${details.readyAt})` : "";
      return { isError: true, content: [{ type: "text", text: `${e.message}${when}.${hint(e.code)}`.replace(/\.\./g, ".") }] };
    }
    log.error("mcp_tool_failed", { tool, error: e instanceof Error ? e.message : String(e) });
    return { isError: true, content: [{ type: "text", text: "Something went wrong on Familiar's side. Please try again in a moment." }] };
  }
}

const lines = (...ls: (string | null | false | undefined)[]) => ls.filter(Boolean).join("\n");

function until(iso: string | null) {
  if (!iso) return "now";
  const mins = Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  return mins >= 60 ? `in ${Math.floor(mins / 60)} h ${mins % 60} min` : `in ${mins} min`;
}

function statusText(f: FamiliarView) {
  const c = f.care;
  return lines(
    `${f.name} — a ${f.color} ${f.species} ${f.stage}${f.mood ? `, feeling ${f.mood}` : ""}.`,
    f.dormant && "It is asleep (dormant): wake it in the app.",
    `Night ${f.day} · ${f.streak}-night streak · level ${f.level.level} (${f.level.toNext} XP to next) · ${f.sparks} Sparks`,
    `Care: fullness ${c.fullness} · joy ${c.joy} · energy ${c.energy}${c.need ? ` — it's ${c.need}` : ""}`,
    `Ready: pet ${until(c.ready.pet)} · snack ${until(c.ready.snack)} · play ${until(c.ready.play)}`,
    f.visitedToday && !f.demo ? "Already talked tonight — next visit after 00:00 UTC." : `Ready to talk tonight${f.feedCredits ? ` (${f.feedCredits} prepaid visit${f.feedCredits === 1 ? "" : "s"})` : ""}.`,
    `Daily lantern: ${f.spunToday ? "already spun" : "ready to spin"}`,
    f.equipped.length > 0 && `Wearing: ${f.equipped.map((e) => e.name).join(", ")}`,
    f.portraitUrl && `Portrait: ${f.portraitUrl}`,
  );
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "familiar_status",
      {
        title: "Familiar status",
        description: "See how your Familiar is doing: mood, care meters (fullness, joy, energy), Sparks, level, streak, what it's wearing, and its latest portrait.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async (_args, ctx) =>
        run("familiar_status", async () => {
          const f = await familiarOf(sessionOf(ctx).address);
          if (!f) return `You haven't hatched a Familiar yet. Hatch one at ${env().APP_URL}.`;
          return statusText(f);
        }),
    );

    server.registerTool(
      "talk_to_familiar",
      {
        title: "Talk to your Familiar",
        description: "Tell your Familiar about your day; it replies in one line and paints a new portrait. Once per night (resets 00:00 UTC). Pass the human's own words.",
        inputSchema: z.object({ message: z.string().trim().min(1).max(MAX_TEXT_CHARS).describe("What the human wants to tell their Familiar about their day, in their words.") }),
        annotations: { ...WRITE, openWorldHint: true },
      },
      async ({ message }, ctx) =>
        run("talk_to_familiar", async () => {
          const session = sessionOf(ctx);
          const me = await myFamiliarRow(session);
          const result = await visit(session, me.label, { text: message });
          scheduleAfterVisit(session, result);
          const { visit: v, reward } = result;
          return lines(
            `${me.label}${v.mood ? ` (${v.mood})` : ""}: "${v.reply}"`,
            v.imageUrl && `New portrait: ${v.imageUrl}`,
            v.replyAudioUrl && `Voice: ${v.replyAudioUrl}`,
            `+${reward.sparks} Sparks, +${reward.xp} XP${reward.leveledUp ? ` — level up! Now level ${reward.level}` : ""}`,
            result.evolve && `Night ${v.day}: ${me.label} is evolving — an evolution clip is on its way.`,
          );
        }),
    );

    server.registerTool(
      "care_for_familiar",
      {
        title: "Care for your Familiar",
        description: "Pet (free, every 20 min), feed a snack (5 Sparks, every 2 h) or play (free, +1 Spark, every hour) to keep its meters up and earn XP.",
        inputSchema: z.object({ action: z.enum(CARE_ACTIONS).describe("pet, snack or play") }),
        annotations: WRITE,
      },
      async ({ action }, ctx) =>
        run("care_for_familiar", async () => {
          const session = sessionOf(ctx);
          const me = await myFamiliarRow(session);
          const r = await care(session, me.label, action);
          const verb = action === "pet" ? "You petted" : action === "snack" ? "You fed a snack to" : "You played with";
          const c = r.familiar.care;
          return lines(
            `${verb} ${me.label}. ${r.reward.sparks ? `${r.reward.sparks > 0 ? "+" : ""}${r.reward.sparks} Sparks, ` : ""}+${r.reward.xp} XP.`,
            `Fullness ${c.fullness} · joy ${c.joy} · energy ${c.energy} · ${r.familiar.sparks} Sparks`,
          );
        }),
    );

    server.registerTool(
      "spin_lantern",
      {
        title: "Spin the daily lantern",
        description: "Spin your Familiar's daily lantern for 10–30 Sparks and a small chance of an accessory. Once per day (resets 00:00 UTC).",
        inputSchema: z.object({}),
        annotations: WRITE,
      },
      async (_args, ctx) =>
        run("spin_lantern", async () => {
          const session = sessionOf(ctx);
          const me = await myFamiliarRow(session);
          const r = await spin(session, me.label);
          return lines(`The lantern glows: +${r.sparks} Sparks.`, r.item && `And it dropped an accessory: ${r.item.name} (${abs(r.item.art)}). Wear it with wear_item.`);
        }),
    );

    server.registerTool(
      "list_shop",
      {
        title: "Browse the accessory shop",
        description: "List the accessories your Familiar can buy with Sparks (with price, slot, and whether you own or wear it). Worn accessories appear in its next portrait.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async (_args, ctx) =>
        run("list_shop", async () => {
          const s = await shop(sessionOf(ctx));
          return lines(
            s.sparks !== null && `You have ${s.sparks} Sparks.`,
            s.festival && `${s.festival.name} festival: festive items on sale until ${s.festival.end}.`,
            ...s.items.map(
              (i) => `- ${i.id}: ${i.name} (${i.slot}, ${i.price} Sparks${i.rarity !== "common" ? `, ${i.rarity}` : ""}) — ${i.equipped ? "wearing" : i.owned ? "owned" : i.available ? "for sale" : "not on sale now"}. ${i.blurb}`,
            ),
          );
        }),
    );

    server.registerTool(
      "buy_item",
      {
        title: "Buy an accessory",
        description: "Buy an accessory from the shop with Sparks (use an id from list_shop). One of each per Familiar.",
        inputSchema: z.object({ itemId: z.string().min(1).max(40).describe("Item id from list_shop, e.g. scarf") }),
        annotations: WRITE,
      },
      async ({ itemId }, ctx) =>
        run("buy_item", async () => {
          const r = await buy(sessionOf(ctx), itemId);
          return `Bought ${r.item}. ${r.sparks} Sparks left. Put it on with wear_item.`;
        }),
    );

    server.registerTool(
      "wear_item",
      {
        title: "Wear or remove an accessory",
        description: "Put an owned accessory on your Familiar (it replaces whatever is in that slot), or pass itemId null to take that slot off. It shows up in the next portrait.",
        inputSchema: z.object({
          slot: z.enum(SLOTS).describe("head, neck, hand, back or ground"),
          itemId: z.string().min(1).max(40).nullable().describe("Owned item id, or null to remove"),
        }),
        annotations: WRITE,
      },
      async ({ slot, itemId }, ctx) =>
        run("wear_item", async () => {
          const session = sessionOf(ctx);
          const me = await myFamiliarRow(session);
          const r = await equip(session, me.label, slot, itemId);
          const worn = Object.entries(r.equipped).map(([s, id]) => `${id} (${s})`);
          return `${itemId ? `${me.label} is now wearing ${itemId}.` : `Took off the ${slot} item.`} Wearing: ${worn.length ? worn.join(", ") : "nothing"}.`;
        }),
    );

    server.registerTool(
      "list_quests",
      {
        title: "List quests",
        description: "Show daily, weekly and event quests with progress, which ones can be claimed for Sparks, and earned badges.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async (_args, ctx) =>
        run("list_quests", async () => {
          const q = await quests(sessionOf(ctx));
          return lines(
            `Level ${q.level.level} · ${q.sparks} Sparks`,
            ...q.quests.map((x) => `- ${x.id} [${x.kind}] ${x.title}: ${x.progress}/${x.goal}, ${x.reward} Sparks — ${x.claimed ? "claimed" : x.claimable ? "READY TO CLAIM" : x.description}`),
            `Badges: ${q.badges.filter((b) => b.earned).map((b) => b.name).join(", ") || "none yet"}`,
          );
        }),
    );

    server.registerTool(
      "claim_quest",
      {
        title: "Claim a quest reward",
        description: "Claim the Sparks for a finished quest (use an id from list_quests).",
        inputSchema: z.object({ questId: z.string().min(1).max(40).describe("Quest id from list_quests, e.g. daily-visit") }),
        annotations: WRITE,
      },
      async ({ questId }, ctx) =>
        run("claim_quest", async () => {
          const r = await claimQuest(sessionOf(ctx), questId);
          return `Claimed ${r.claimed}: +${r.reward} Sparks (now ${r.sparks}).`;
        }),
    );

    server.registerTool(
      "explore_nearby",
      {
        title: "Explore nearby Familiars",
        description: "See the Familiars that are awake right now (most recently visited first), which ones you've already spotted, and which you've sent a gift today.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async (_args, ctx) =>
        run("explore_nearby", async () => {
          const { familiars } = await explore(sessionOf(ctx));
          if (!familiars.length) return "No Familiars are awake right now.";
          return lines(
            `${familiars.length} Familiars awake:`,
            ...familiars.map(
              (x) =>
                `- ${x.label}: ${x.color} ${x.species} ${x.stage}, level ${x.level}${x.mood ? `, ${x.mood}` : ""} — ${x.mine ? "yours" : x.spotted ? `spotted${x.giftedToday ? ", gifted today" : ""}` : "not spotted yet"}`,
            ),
            "Spot one with spot_familiar to add it to your Dex.",
          );
        }),
    );

    server.registerTool(
      "spot_familiar",
      {
        title: "Spot a Familiar",
        description: "Spot another Familiar to add it to your Dex: +5 Sparks and +5 XP, plus 10 bonus Sparks for a species you haven't spotted before. Once per Familiar.",
        inputSchema: z.object({ label: z.string().min(1).max(64).describe("The Familiar's name (label), e.g. ember") }),
        annotations: WRITE,
      },
      async ({ label }, ctx) =>
        run("spot_familiar", async () => {
          const r = await spot(sessionOf(ctx), label);
          return `Spotted ${r.spotted}! +${r.reward.sparks} Sparks, +${r.reward.xp} XP${r.newSpecies ? " — a new species for your Dex!" : "."}`;
        }),
    );

    server.registerTool(
      "send_gift",
      {
        title: "Send a gift",
        description: "Send a small gift to a Familiar you've spotted: they get 5 Sparks, you get 3 XP. Once per Familiar per day.",
        inputSchema: z.object({ label: z.string().min(1).max(64).describe("The Familiar's name (label)") }),
        annotations: WRITE,
      },
      async ({ label }, ctx) =>
        run("send_gift", async () => {
          const r = await gift(sessionOf(ctx), label);
          return `Sent ${r.gifted} a gift. +${r.reward.xp} XP for you, 5 Sparks for them.`;
        }),
    );

    server.registerTool(
      "start_night_walk",
      {
        title: "Start a night walk",
        description: "Host tonight's night walk: share the invite link with up to two friends. When they join, all the Familiars are painted walking together and each earns 20 Sparks. Once per night.",
        inputSchema: z.object({}),
        annotations: WRITE,
      },
      async (_args, ctx) =>
        run("start_night_walk", async () => {
          const { walk } = await createWalk(sessionOf(ctx));
          return lines(
            `${walk.host} is ready for a night walk.`,
            `Invite up to two friends: ${walk.inviteUrl}`,
            "When the third Familiar joins, the painting starts (or the host can start with two in the app).",
          );
        }),
    );

    server.registerTool(
      "list_trades",
      {
        title: "List accessory trades",
        description: "Show accessory swap offers sent to you and by you (pending ones expire after 72 h), plus recently resolved trades. Accept or decline them in the app.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async (_args, ctx) =>
        run("list_trades", async () => {
          const { incoming, outgoing, history } = await listTrades(sessionOf(ctx));
          const fmt = (x: (typeof incoming)[number]) => `${x.from.label} gives ${x.give.name} for ${x.to.label}'s ${x.want.name}`;
          return lines(
            incoming.length ? `Offers for you:\n${incoming.map((x) => `- ${fmt(x)} (expires ${x.expiresAt})`).join("\n")}` : "No offers waiting for you.",
            outgoing.length ? `Your open offers:\n${outgoing.map((x) => `- ${fmt(x)}`).join("\n")}` : "You have no open offers.",
            history.length > 0 && `Recently:\n${history.map((x) => `- ${fmt(x)}: ${x.status}`).join("\n")}`,
            (incoming.length > 0 || outgoing.length > 0) && `Answer offers at ${env().APP_URL}.`,
          );
        }),
    );

    server.registerTool(
      "read_diary",
      {
        title: "Read your Familiar's diary",
        description: "Read the diary your Familiar wrote about this week (or a past ISO week like 2026-W45), in its own voice.",
        inputSchema: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/).optional().describe("ISO week, e.g. 2026-W45. Defaults to this week.") }),
        annotations: READ,
      },
      async ({ week }, ctx) =>
        run("read_diary", async () => {
          const session = sessionOf(ctx);
          const me = await myFamiliarRow(session);
          const { diary, canWrite } = await getDiary(session, me.label, week);
          if (!diary) return canWrite ? `${me.label} hasn't written this week's diary yet — ask it to in the app at ${env().APP_URL}.` : `No diary for that week yet — ${me.label} writes about weeks you visited.`;
          return lines(`${me.label}'s diary, ${diary.week} — ${diary.moodLine}`, "", diary.text, diary.days.length > 0 && `Moods: ${diary.days.map((d) => `${d.date} ${d.mood ?? "?"}`).join(", ")}`);
        }),
    );

    server.registerTool(
      "list_events",
      {
        title: "Event spotlights",
        description: "List live and upcoming events (Devcon, ETHGlobal, Diwali…) and the bonuses they bring, like 2× Sparks on visits.",
        inputSchema: z.object({}),
        annotations: READ,
      },
      async () =>
        run("list_events", async () => {
          const events = eventViews();
          if (!events.length) return "No events right now.";
          return lines(...events.map((e) => `- ${e.name} (${e.status}, ${e.start} → ${e.end}, ${e.place}): ${e.bonus}.${e.url ? ` ${e.url}` : ""}`));
        }),
    );
  },
  {
    serverInfo: { name: "familiar", version: "1.0.0" },
    instructions:
      "Familiar is a small private AI creature the user visits once a night. Use talk_to_familiar when the user wants to tell it about their day (pass their own words). Check familiar_status before caring for it; claim finished quests with claim_quest.",
  },
);

/** Serve one MCP request as `session` (resolved by the route from a `fam_` key). */
export function serveMcp(req: Request, session: Session): Promise<Response> {
  req.auth = { token: "fam_…", clientId: session.apiKeyId ?? "session", scopes: [], extra: { session } };
  return handler(req);
}

export function unauthorizedMcp(): Response {
  return Response.json(
    { error: { code: "UNAUTHENTICATED", message: `A Familiar connector key is required — create one at ${env().APP_URL}` } },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="familiar"' } },
  );
}
