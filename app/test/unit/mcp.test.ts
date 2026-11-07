import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

// Runs against the in-memory PGlite (migrations included): the MCP protocol surface and key auth.
const owner = privateKeyToAccount(`0x${"33".repeat(32)}`).address;

type Mod = Record<string, (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>>;

async function body(res: Response) {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    return JSON.parse(data.filter(Boolean).at(-1)!);
  }
  return text ? JSON.parse(text) : null;
}

async function rpc(via: { bearer?: string; urlKey?: string }, method: string, params: unknown = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (via.bearer) headers.authorization = `Bearer ${via.bearer}`;
  const mod = (via.urlKey ? await import("@/app/api/mcp/[key]/route") : await import("@/app/api/mcp/route")) as unknown as Mod;
  const req = new Request(`http://localhost:3000/api/mcp${via.urlKey ? `/${via.urlKey}` : ""}`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const routeParams: Record<string, string> = via.urlKey ? { key: via.urlKey } : {};
  const res = await mod.POST!(req, { params: Promise.resolve(routeParams) });
  return { status: res.status, body: await body(res) };
}

const init = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "1.0.0" } };

describe("MCP server", () => {
  it("serves initialize, tools/list and a tool call over the URL-key and bearer paths", async () => {
    const { createKey } = await import("@/server/auth/apiKeys");
    const created = await createKey({ address: owner, method: "wallet" }, "Claude");
    expect(created.key).toMatch(/^fam_[0-9A-Za-z]{32}$/);
    expect(created.connectorUrl).toBe(`http://localhost:3000/api/mcp/${created.key}`);

    const hello = await rpc({ urlKey: created.key }, "initialize", init);
    expect(hello.status).toBe(200);
    expect(hello.body.result.serverInfo.name).toBe("familiar");

    const list = await rpc({ urlKey: created.key }, "tools/list");
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["familiar_status", "talk_to_familiar", "care_for_familiar", "spin_lantern", "list_shop", "buy_item", "wear_item", "list_quests", "claim_quest", "explore_nearby", "spot_familiar", "list_events", "start_night_walk", "list_trades", "read_diary"]),
    );
    const talk = list.body.result.tools.find((t: { name: string }) => t.name === "talk_to_familiar");
    expect(talk.description).toMatch(/Once per night/);
    expect(talk.inputSchema.properties.message.type).toBe("string");

    // No Familiar yet: a helpful text result, not a protocol error.
    const status = await rpc({ bearer: created.key }, "tools/call", { name: "familiar_status", arguments: {} });
    expect(status.status).toBe(200);
    expect(status.body.result.content[0].text).toMatch(/haven't hatched/);
    const care = await rpc({ bearer: created.key }, "tools/call", { name: "care_for_familiar", arguments: { action: "pet" } });
    expect(care.body.result.isError).toBe(true);
    expect(care.body.result.content[0].text).toMatch(/Hatch a Familiar first/);

    const events = await rpc({ urlKey: created.key }, "tools/call", { name: "list_events", arguments: {} });
    expect(events.body.result.content[0].text).toMatch(/Diwali/);
  });

  it("refuses missing, unknown and revoked keys", async () => {
    expect((await rpc({}, "tools/list")).status).toBe(401);
    expect((await rpc({ urlKey: `fam_${"x".repeat(32)}` }, "tools/list")).status).toBe(401);
    expect((await rpc({ urlKey: "not-a-key" }, "tools/list")).status).toBe(401);
    const { createKey, revokeKey } = await import("@/server/auth/apiKeys");
    const s = { address: owner, method: "wallet" as const };
    const k = await createKey(s, "ChatGPT");
    expect((await rpc({ urlKey: k.key }, "tools/list")).status).toBe(200);
    await revokeKey(s, k.id);
    expect((await rpc({ urlKey: k.key }, "tools/list")).status).toBe(401);
    expect((await rpc({ bearer: k.key }, "tools/list")).status).toBe(401);
  });
});
