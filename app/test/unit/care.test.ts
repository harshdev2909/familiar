import { describe, expect, it } from "vitest";
import { CARE, type CareInput, careView, hearts, readyAt } from "@/server/game/meters";

const H = 3600_000;
const now = new Date("2026-11-06T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * H);
const base: CareInput = { lastPetAt: null, lastSnackAt: null, lastPlayAt: null, lastVisitAt: ago(2), lastVisitDate: "2026-11-06", createdAt: ago(100) };

describe("care costs and cooldowns", () => {
  it("pet is free (20 min), snack costs 5 Sparks (2 h), play pays 1 Spark (60 min)", () => {
    expect(CARE.pet).toEqual({ cooldownMs: 20 * 60_000, cost: 0, sparks: 0, xp: 2 });
    expect(CARE.snack).toEqual({ cooldownMs: 2 * H, cost: 5, sparks: 0, xp: 3 });
    expect(CARE.play).toEqual({ cooldownMs: H, cost: 0, sparks: 1, xp: 3 });
  });
  it("readyAt is null when never done or the cooldown has passed, else the exact time", () => {
    expect(readyAt("pet", null, now)).toBeNull();
    expect(readyAt("pet", new Date(now.getTime() - 20 * 60_000), now)).toBeNull();
    expect(readyAt("pet", new Date(now.getTime() - 5 * 60_000), now)?.toISOString()).toBe("2026-11-06T12:15:00.000Z");
    expect(readyAt("snack", ago(1), now)?.toISOString()).toBe("2026-11-06T13:00:00.000Z");
    expect(readyAt("play", ago(0.5), now)?.toISOString()).toBe("2026-11-06T12:30:00.000Z");
  });
  it("the view reports ready times as ISO strings, null when available", () => {
    const v = careView({ ...base, lastPetAt: ago(0.1), lastSnackAt: ago(3), lastPlayAt: ago(0.25) }, now);
    expect(v.ready.pet).toBe(new Date(ago(0.1).getTime() + 20 * 60_000).toISOString());
    expect(v.ready.snack).toBeNull();
    expect(v.ready.play).toBe("2026-11-06T12:45:00.000Z");
  });
});

describe("care meters", () => {
  it("fullness falls 6/h since the last snack, joy 5/h since pet or play", () => {
    const v = careView({ ...base, lastSnackAt: ago(5), lastPetAt: ago(4), lastPlayAt: ago(2) }, now);
    expect(v.fullness).toBe(70);
    expect(v.joy).toBe(90); // the more recent of pet/play
  });
  it("falls back to the last visit, then the hatch time", () => {
    expect(careView(base, now)).toMatchObject({ fullness: 88, joy: 90 });
    expect(careView({ ...base, lastVisitAt: null, createdAt: ago(10) }, now)).toMatchObject({ fullness: 40, joy: 50 });
  });
  it("clamps to 0–100", () => {
    const v = careView({ ...base, lastSnackAt: ago(100), lastPetAt: new Date(now.getTime() + H) }, now);
    expect(v.fullness).toBe(0);
    expect(v.joy).toBe(100);
  });
  it("energy is full on a visit day and falls 4/h from the next midnight, never below 10", () => {
    expect(careView(base, now).energy).toBe(100);
    expect(careView({ ...base, lastVisitDate: "2026-11-05" }, now).energy).toBe(52); // 12 h into today
    expect(careView({ ...base, lastVisitDate: "2026-11-01" }, now).energy).toBe(10);
  });
  it("hearts are ceil(meter/25)", () => {
    expect([0, 1, 25, 26, 50, 74, 75, 76, 100].map(hearts)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(careView(base, now).hearts).toEqual({ fullness: 4, joy: 4, energy: 4 });
  });
  it("need is the lowest meter under 40", () => {
    expect(careView(base, now).need).toBeNull();
    expect(careView({ ...base, lastSnackAt: ago(12) }, now).need).toBe("hungry");
    expect(careView({ ...base, lastSnackAt: ago(11), lastPetAt: ago(15) }, now).need).toBe("lonely");
    expect(careView({ ...base, lastVisitDate: "2026-11-04" }, now).need).toBe("sleepy");
  });
});
