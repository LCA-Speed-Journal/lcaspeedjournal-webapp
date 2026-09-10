import { describe, it, expect } from "vitest";
import extraSessions from "./extracurricular-sessions.json";
import { extraSessionToDraft } from "./from-extra-json";
import {
  FILL_ROW_MAX_IN,
  FILL_ROW_MIN_IN,
  HEADER_IN,
  NOTES_ROW_MAX_IN,
  PAGE_BODY_IN,
  TABLE_HEAD_IN,
  ZERO_SET_ROW_MAX_IN,
  MAX_SCAN_SAFE_SETS,
  analyzeCardFit,
  computeCardRowHeights,
  crowdingPrintWarning,
  sheetRowCssVars,
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
        speedJournalMetricKey: null,
      },
    ],
    ...overrides,
  };
}

function notesDraft(count: number): CardDraft {
  return tinyDraft({
    movements: Array.from({ length: count }, (_, i) => ({
      label: String(i + 1),
      name: `Lift ${i + 1}`,
      block: "Main",
      setCount: 3,
      targets: ["5", "5", "5"],
      notes: "Cue",
      fromPair: false,
      exerciseHtml: null,
      speedJournalMetricKey: null,
    })),
  });
}

describe("computeCardRowHeights", () => {
  it("grows a 4-row notes card to fillable and notes max and leaves leftover paper", () => {
    const h = computeCardRowHeights(notesDraft(4));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MAX_IN);
    expect(h.notesRowIn).toBeCloseTo(NOTES_ROW_MAX_IN);
    expect(h.leftoverIn).toBeGreaterThan(0);
    expect(h.usedHeightIn).toBeLessThanOrEqual(PAGE_BODY_IN);
    expect(h.usedHeightIn).toBeCloseTo(
      HEADER_IN + TABLE_HEAD_IN + 4 * h.fillRowIn + 4 * h.notesRowIn
    );
  });

  it("grows an 8-row all-notes card to max caps", () => {
    const h = computeCardRowHeights(notesDraft(8));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MAX_IN);
    expect(h.notesRowIn).toBeCloseTo(NOTES_ROW_MAX_IN);
  });

  it("keeps a 13-row all-notes card near ideal", () => {
    const h = computeCardRowHeights(notesDraft(13));
    expect(h.fillRowIn).toBeGreaterThan(0.3);
    expect(h.fillRowIn).toBeLessThan(0.34);
    expect(h.notesRowIn).toBeGreaterThan(0.18);
    expect(h.notesRowIn).toBeLessThan(0.2);
  });

  it("shrinks a 15-row all-notes card toward mins but still fits the grid", () => {
    const h = computeCardRowHeights(notesDraft(15));
    expect(h.fillRowIn).toBeLessThan(5 / 16);
    expect(h.fillRowIn).toBeGreaterThanOrEqual(FILL_ROW_MIN_IN);
    expect(h.usedHeightIn).toBeLessThanOrEqual(PAGE_BODY_IN);
  });

  it("applies mins when even the min pack overflows", () => {
    const h = computeCardRowHeights(notesDraft(24));
    expect(h.fillRowIn).toBeCloseTo(FILL_ROW_MIN_IN);
    expect(h.usedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
  });

  it("uses the zero-set band for a 0-set warmup, not a fixed 0.40in", () => {
    const draft = tinyDraft({
      movements: [
        {
          label: "W",
          name: "Prep",
          block: "Warmup",
          setCount: 0,
          targets: [],
          notes: "Med-ball",
          fromPair: false,
          exerciseHtml: null,
          speedJournalMetricKey: null,
        },
        {
          label: "1",
          name: "Squat",
          block: "Main",
          setCount: 3,
          targets: ["5", "5", "5"],
          notes: "",
          fromPair: false,
          exerciseHtml: null,
          speedJournalMetricKey: null,
        },
      ],
    });
    const h = computeCardRowHeights(draft);
    expect(h.zeroSetRowIn).toBeGreaterThanOrEqual(1 / 4);
    expect(h.zeroSetRowIn).toBeLessThanOrEqual(ZERO_SET_ROW_MAX_IN);
    expect(h.zeroSetRowIn).not.toBeCloseTo(0.4);
    expect(h.usedHeightIn).toBeCloseTo(
      HEADER_IN + TABLE_HEAD_IN + h.zeroSetRowIn + h.fillRowIn
    );
  });

  it("formats applied heights as inch CSS variables", () => {
    const vars = sheetRowCssVars(computeCardRowHeights(notesDraft(4)));
    expect(vars["--wr-fill-row"]).toBe(`${FILL_ROW_MAX_IN}in`);
    expect(vars["--wr-notes-row"]).toBe(`${NOTES_ROW_MAX_IN}in`);
    expect(vars["--wr-zero-set-row"]).toMatch(/in$/);
  });
});

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
            speedJournalMetricKey: null,
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
    const overflow = analyzeCardFit(makeStressDraft(24));
    expect(fits8.fits).toBe(true);
    expect(overflow.fits).toBe(false);
    expect(overflow.estimatedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
  });

  it("marks 15 noted dummy rows scan-safe when they fit at shrunk heights", () => {
    const r = analyzeCardFit(makeStressDraft(15));
    expect(r.fits).toBe(true);
    expect(r.scanSafe).toBe(true);
    expect(r.warnings.some((w) => /scan-safe max of 12/i.test(w))).toBe(false);
  });

  it("treats 13 dummy rows as scan-safe (no movement-count cap)", () => {
    const r = analyzeCardFit(makeStressDraft(13));
    expect(r.fits).toBe(true);
    expect(r.scanSafe).toBe(true);
    expect(crowdingPrintWarning(r)).toBeNull();
  });

  it("overflows when the min pack exceeds the page body", () => {
    const overflow = analyzeCardFit(makeStressDraft(24));
    expect(overflow.fits).toBe(false);
    expect(overflow.scanSafe).toBe(false);
    expect(overflow.estimatedHeightIn).toBeGreaterThan(PAGE_BODY_IN);
    expect(crowdingPrintWarning(overflow)).toMatch(/check the preview/i);
  });

  it("keeps estimatedHeightIn equal to computeCardRowHeights usedHeightIn", () => {
    const draft = makeStressDraft(8);
    const r = analyzeCardFit(draft);
    expect(r.estimatedHeightIn).toBeCloseTo(computeCardRowHeights(draft).usedHeightIn);
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
