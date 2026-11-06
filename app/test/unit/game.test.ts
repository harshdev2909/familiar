import { describe, expect, it } from "vitest";
import { ITEMS, activeFestival } from "@/server/game/catalog";
import { isoWeek, levelFor, visitSparks, xpForLevel } from "@/server/game/progress";
import { imagePromptFor } from "@/server/familiar/rules";

describe("progression", () => {
  it("levels need 0, 50, 150, 300… XP", () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 50, 150, 300, 500]);
    expect(levelFor(0)).toMatchObject({ level: 1, intoLevel: 0, levelSize: 50, toNext: 50 });
    expect(levelFor(49).level).toBe(1);
    expect(levelFor(50).level).toBe(2);
    expect(levelFor(320)).toMatchObject({ level: 4, intoLevel: 20, levelSize: 200 });
  });
  it("streaks add Sparks, capped", () => {
    expect(visitSparks(1)).toBe(10);
    expect(visitSparks(3)).toBe(14);
    expect(visitSparks(100)).toBe(24);
  });
  it("ISO weeks", () => {
    expect(isoWeek("2026-11-06")).toBe("2026-W45");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("festival + catalog", () => {
  it("Diwali runs 1–10 Nov 2026 and can be forced either way", () => {
    expect(activeFestival("2026-11-08")?.id).toBe("diwali");
    expect(activeFestival("2026-11-11")).toBeNull();
    expect(activeFestival("2026-11-10")?.id).toBe("diwali");
    expect(activeFestival("2026-12-01", "diwali")?.id).toBe("diwali");
    expect(activeFestival("2026-11-08", "none")).toBeNull();
  });
  it("every item has a unique id, positive price and a wear phrase", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS.every((i) => i.price > 0 && i.wear.length > 10 && i.art.startsWith("/art/items/"))).toBe(true);
  });
  it("accessories go into the portrait prompt", () => {
    const p = imagePromptFor("cute round fox", "hatchling", "a quiet night", ["holding a small glowing clay diya lamp"]);
    expect(p).toContain("holding a small glowing clay diya lamp");
    expect(p.endsWith("a quiet night")).toBe(true);
    expect(imagePromptFor("seed", "sprite", "scene")).not.toContain(", .");
  });
});
