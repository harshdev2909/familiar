import { describe, expect, it } from "vitest";
import { EVENTS, eventStatus, eventViews, eventWindow, visitSparksMultiplier } from "@/server/game/events";

describe("event spotlights", () => {
  it("dates are inclusive UTC", () => {
    const devcon = EVENTS.find((e) => e.id === "devcon-8")!;
    expect(eventStatus(devcon, "2026-11-02")).toBe("upcoming");
    expect(eventStatus(devcon, "2026-11-03")).toBe("live");
    expect(eventStatus(devcon, "2026-11-06")).toBe("live");
    expect(eventStatus(devcon, "2026-11-07")).toBe("ended");
  });
  it("sorts live → upcoming → ended and hides events that ended over 14 days ago", () => {
    expect(eventViews("2026-11-06").map((e) => [e.id, e.status])).toEqual([
      ["devcon-8", "live"],
      ["ethglobal-mumbai", "live"],
      ["diwali-2026", "live"],
    ]);
    expect(eventViews("2026-11-04").map((e) => [e.id, e.status])).toEqual([
      ["devcon-8", "live"],
      ["diwali-2026", "live"],
      ["ethglobal-mumbai", "upcoming"],
    ]);
    expect(eventViews("2026-10-01").map((e) => e.status)).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(eventViews("2026-11-20").map((e) => e.id)).toEqual(["diwali-2026", "ethglobal-mumbai", "devcon-8"]);
    expect(eventViews("2026-11-23").map((e) => e.id)).toEqual(["diwali-2026"]);
    expect(eventViews("2026-12-30")).toEqual([]);
  });
  it("carries the contract fields", () => {
    const e = eventViews("2026-11-06").find((x) => x.id === "ethglobal-mumbai")!;
    expect(e).toEqual({
      id: "ethglobal-mumbai",
      name: "ETHGlobal Mumbai",
      place: "Mumbai",
      start: "2026-11-05",
      end: "2026-11-07",
      logo: "/logos/ethglobal.svg",
      art: "/art/spotlight/hackathon.jpg",
      url: "https://ethglobal.com/events/mumbai",
      blurb: expect.any(String),
      bonus: expect.stringContaining("2×"),
      status: "live",
    });
    expect(eventViews("2026-11-06").find((x) => x.id === "diwali-2026")).toMatchObject({ logo: null, url: null });
  });
  it("visits earn 2× Sparks only while ETHGlobal Mumbai is live", () => {
    expect(visitSparksMultiplier("2026-11-04")).toBe(1);
    expect(visitSparksMultiplier("2026-11-05")).toBe(2);
    expect(visitSparksMultiplier("2026-11-07")).toBe(2);
    expect(visitSparksMultiplier("2026-11-08")).toBe(1);
  });
  it("the event window shifts with EVENTS_TODAY so 'now' lands on the pretend day", () => {
    const e = { start: "2026-11-05", end: "2026-11-07" };
    const real = eventWindow(e, "2026-11-06", "2026-11-06");
    expect(real.from.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(real.to.toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(real).toMatchObject({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    const shifted = eventWindow(e, "2026-11-06", "2027-01-10"); // pretend it's 11-06 on 01-10
    expect(shifted).toMatchObject({ fromDate: "2027-01-09", toDate: "2027-01-11" });
  });
});
