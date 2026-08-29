import { describe, it, expect } from "vitest";
import extraSessions from "./extracurricular-sessions.json";
import { extraSessionToDraft } from "./from-extra-json";
import {
  PAGE_BODY_IN,
  MAX_SCAN_SAFE_SETS,
  analyzeCardFit,
} from "./layout-estimate";
import { makeStressDraft } from "./row-stress";
import { sampleInSeasonSoccer } from "./sample-in-season";
import type { CardDraft } from "./types";

function tinyDraft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    hugoGroup: "soccer",
    weekNumber: 1,
    dayName: "Tuesday",
    sessionDate: "2026-09-08",
    focus: "Lower",
    title: "Test card",
    movements: [
      {
        label: "1",
        name: "Goblet Squat",
        block: "Main",
        setCount: 3,
        targets: ["5", "5", "5"],
        notes: "",
        fromPair: false,
        exerciseHtml: null,
      },
    ],
    ...overrides,
  };
}

describe("analyzeCardFit", () => {
  it("fits a short in-season style card", () => {
    const r = analyzeCardFit(tinyDraft());
    expect(r.fits).toBe(true);
    expect(r.scanSafe).toBe(true);
    expect(r.estimatedHeightIn).toBeLessThanOrEqual(PAGE_BODY_IN);
    expect(r.maxSets).toBe(3);
  });

  it("marks too many sets as not scan-safe even if height might fit", () => {
    const r = analyzeCardFit(
      tinyDraft({
        movements: [
          {
            label: "1",
            name: "Cluster",
            block: "Main",
            setCount: MAX_SCAN_SAFE_SETS + 2,
            targets: Array(MAX_SCAN_SAFE_SETS + 2).fill("5"),
            notes: "",
            fromPair: false,
            exerciseHtml: null,
          },
        ],
      })
    );
    expect(r.maxSets).toBe(MAX_SCAN_SAFE_SETS + 2);
    expect(r.scanSafe).toBe(false);
    expect(r.warnings.some((w) => /set/i.test(w))).toBe(true);
  });

  it("eventually overflows when dummy rows pile up", () => {
    const fits8 = analyzeCardFit(makeStressDraft(8));
    const overflow = analyzeCardFit(makeStressDraft(20));
    expect(fits8.fits).toBe(true);
    expect(overflow.fits).toBe(false);
    expect(overflow.estimatedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
  });
});

describe("mapped extra sessions vs letter page", () => {
  it("Week 1 Monday (8 movements, 4 sets) fits and is scan-safe", () => {
    const session = extraSessions.find((s) => s.week === 1 && s.day === "Monday");
    const r = analyzeCardFit(extraSessionToDraft(session!));
    expect(r.movementCount).toBe(8);
    expect(r.maxSets).toBe(4);
    expect(r.fits).toBe(true);
    expect(r.scanSafe).toBe(true);
  });

  it("densest extra Monday (12 movements) still fits the page budget", () => {
    const session = extraSessions.find((s) => s.week === 2 && s.day === "Monday");
    const r = analyzeCardFit(extraSessionToDraft(session!));
    expect(r.movementCount).toBe(12);
    expect(r.fits).toBe(true);
  });
});

describe("sampleInSeasonSoccer", () => {
  it("is a soccer card that fits one landscape letter page", () => {
    expect(sampleInSeasonSoccer.hugoGroup).toBe("soccer");
    const r = analyzeCardFit(sampleInSeasonSoccer);
    expect(r.fits).toBe(true);
    expect(r.scanSafe).toBe(true);
  });
});
