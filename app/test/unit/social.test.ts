import { describe, expect, it } from "vitest";
import { generateKey, hashKey, looksLikeKey } from "@/server/auth/apiKeys";
import { pinFor } from "@/server/game/social";

describe("explore pins", () => {
  it("are deterministic and inside 0.08–0.92", () => {
    expect(pinFor("ember")).toEqual(pinFor("ember"));
    expect(pinFor("ember")).not.toEqual(pinFor("luma"));
    for (const l of ["a", "ember", "luma", "zz-top", "x".repeat(32)]) {
      const p = pinFor(l);
      for (const v of [p.x, p.y]) expect(v >= 0.08 && v <= 0.92).toBe(true);
    }
  });
});

describe("personal keys", () => {
  it("are fam_ + 32 base62 characters, unique, and stored only as sha256", () => {
    const keys = Array.from({ length: 200 }, generateKey);
    expect(keys.every((k) => /^fam_[0-9A-Za-z]{32}$/.test(k) && looksLikeKey(k))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(hashKey(keys[0]!)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(keys[0]!)).not.toContain(keys[0]!.slice(4));
    expect(looksLikeKey("fam_short")).toBe(false);
    expect(looksLikeKey(`fam_${"a".repeat(31)}!`)).toBe(false);
  });
});
