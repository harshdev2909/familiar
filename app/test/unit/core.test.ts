import { describe, expect, it } from "vitest";
import { namehash } from "viem";
import { getSession, issueSession } from "@/server/auth/session";
import { dnsEncode, normalizeLabel, nodeOf } from "@/server/chain/ens";
import { hexValue } from "@/server/feed/service";
import { defaultLook, isEvolutionDay, nextRefresh, nextStreak, stageFor, utcDate } from "@/server/familiar/rules";
import { decryptMemory, encryptMemory, persistMemory } from "@/server/zerog/memory";

const NODE = namehash("ember.familiar.eth");

describe("memory encryption", () => {
  it("round-trips and never contains the plaintext", async () => {
    const sealed = await encryptMemory(NODE, "They care about their sister, climbing, and shipping.");
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("sister");
    expect(await decryptMemory(NODE, sealed)).toBe("They care about their sister, climbing, and shipping.");
  });
  it("is bound to the Familiar (another node cannot decrypt)", async () => {
    const sealed = await encryptMemory(NODE, "secret");
    await expect(decryptMemory(namehash("moss.familiar.eth"), sealed)).rejects.toThrow();
  });
  it("detects tampering", async () => {
    const sealed = await encryptMemory(NODE, "secret");
    const [v, iv, ct] = sealed.split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0]! ^= 1;
    await expect(decryptMemory(NODE, `${v}.${iv}.${flipped.toString("base64url")}`)).rejects.toThrow();
  });
  it("uses a fresh IV each time", async () => expect(await encryptMemory(NODE, "x")).not.toBe(await encryptMemory(NODE, "x")));
  it("commits to the ciphertext when 0G Storage is disabled", async () => {
    const r = await persistMemory("v1.a.b");
    expect(r.onZeroGStorage).toBe(false);
    expect(r.root).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("names", () => {
  it("normalizes valid labels", () => expect(normalizeLabel("  Ember ")).toBe("ember"));
  it.each(["ab", "-ember", "ember-", "em--ber", "em.ber", "émber", "a".repeat(33), "admin"])("rejects %s", (l) => expect(() => normalizeLabel(l)).toThrow());
  it("node matches ENS namehash", () => expect(nodeOf("ember")).toBe(NODE));
  it("DNS-encodes like the registry", () => expect(dnsEncode("ember.familiar.eth")).toBe("0x05656d626572086661" + "6d696c69617203657468" + "00"));
});

describe("rules", () => {
  it("stages", () => {
    expect(stageFor(1)).toBe("hatchling");
    expect(stageFor(7)).toBe("sprite");
    expect(stageFor(14)).toBe("guardian");
  });
  it("evolves every 7th visit", () => expect([1, 6, 7, 13, 14].map(isEvolutionDay)).toEqual([false, false, true, false, true]));
  it("streaks", () => {
    expect(nextStreak(null, 0, "2026-11-05")).toBe(1);
    expect(nextStreak("2026-11-04", 3, "2026-11-05")).toBe(4);
    expect(nextStreak("2026-11-02", 3, "2026-11-05")).toBe(1);
    expect(nextStreak("2026-11-05", 3, "2026-11-05")).toBe(3);
    expect(nextStreak("2026-12-31", 9, "2027-01-01")).toBe(10);
  });
  it("credit refresh is the next 00:00 UTC", () => expect(nextRefresh(new Date("2026-11-05T23:59:59Z")).toISOString()).toBe("2026-11-06T00:00:00.000Z"));
  it("utc dates", () => expect(utcDate(new Date("2026-11-05T23:30:00-05:00"))).toBe("2026-11-06"));
  it("default look is deterministic", () => expect(defaultLook("ember")).toEqual(defaultLook("ember")));
  it("hexValue normalizes Uniswap values", () => {
    expect(hexValue("0x00")).toBe("0x0");
    expect(hexValue("1000")).toBe("0x3e8");
    expect(hexValue(undefined)).toBe("0x0");
  });
});

describe("sessions", () => {
  const req = (token?: string, cookie?: string) =>
    new Request("http://x", { headers: { ...(token && { authorization: `Bearer ${token}` }), ...(cookie && { cookie }) } });
  it("issues and reads a wallet session (bearer or cookie)", async () => {
    const t = await issueSession({ address: "0x04b4534A84C25992A958B60e96995269Cd744258", method: "wallet" });
    expect((await getSession(req(t)))?.address).toBe("0x04b4534A84C25992A958B60e96995269Cd744258");
    expect((await getSession(req(undefined, `a=b; familiar_session=${t}`)))?.method).toBe("wallet");
  });
  it("seals the 0G user token inside the JWT", async () => {
    const t = await issueSession({ address: "0x04b4534A84C25992A958B60e96995269Cd744258", method: "iai", zgUserToken: "zg-secret-jwt" });
    expect(Buffer.from(t.split(".")[1]!, "base64url").toString()).not.toContain("zg-secret-jwt");
    expect((await getSession(req(t)))?.zgUserToken).toBe("zg-secret-jwt");
  });
  it("rejects tampered tokens", async () => {
    const t = await issueSession({ address: "0x04b4534A84C25992A958B60e96995269Cd744258", method: "wallet" });
    expect(await getSession(req(`${t.slice(0, -2)}xx`))).toBeNull();
    expect(await getSession(req())).toBeNull();
  });
});

describe("env", () => {
  it("treats blank values as unset and reports misconfiguration as NOT_CONFIGURED", async () => {
    const { env, resetEnvForTests } = await import("@/server/env");
    const saved = { ...process.env };
    process.env.ZG_API_KEY = "";
    process.env.UNISWAP_API_KEY = "   ";
    resetEnvForTests();
    expect(env().ZG_API_KEY).toBeUndefined();
    expect(env().UNISWAP_API_KEY).toBeUndefined();
    process.env.SESSION_SECRET = "short";
    resetEnvForTests();
    expect(() => env()).toThrow(expect.objectContaining({ code: "NOT_CONFIGURED", status: 503 }));
    Object.assign(process.env, saved);
    resetEnvForTests();
  });
});
