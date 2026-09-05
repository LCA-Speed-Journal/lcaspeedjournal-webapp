import { describe, expect, it } from "vitest";
import type { F2fProfile } from "./f2f/types";
import type { F2fThemeMix } from "./f2f/themes";
import {
  ZONE_ABBREV_LEGEND,
  PDF_F2F_QUALITY_LABELS,
  f2fCardHeading,
  f2fFocusBadge,
  f2fPieSlices,
  f2fStrengthDeficiency,
  pdfCoachF2fCopy,
  pieSlicePath,
  zoneAbbrev,
} from "./testing-day-pdf-f2f";

const vertex = (predicted_40: number) => ({
  predicted_40,
  extrapolated: false,
  projected: false,
});

const profile = (partial: Partial<F2fProfile>): F2fProfile => ({
  reference_40: 5,
  reference_source: "actual_40",
  explosion: vertex(5.1),
  force: vertex(5.2),
  form: vertex(4.9),
  eligible_for_labels: true,
  show_predicted_40s: true,
  flags: ["force"],
  primary: "force",
  ...partial,
});

describe("f2fStrengthDeficiency", () => {
  it("paints fastest green and slowest red", () => {
    expect(f2fStrengthDeficiency(profile({}))).toEqual({
      explosion: null,
      force: "deficiency",
      form: "strength",
    });
  });

  it("shares a color on a two-way tie and skips a three-way tie", () => {
    expect(
      f2fStrengthDeficiency(
        profile({
          explosion: vertex(5.0),
          force: vertex(5.0),
          form: vertex(5.2),
        })
      )
    ).toEqual({
      explosion: "strength",
      force: "strength",
      form: "deficiency",
    });
    expect(
      f2fStrengthDeficiency(
        profile({
          explosion: vertex(5.0),
          force: vertex(5.0),
          form: vertex(5.0),
        })
      )
    ).toEqual({ explosion: null, force: null, form: null });
  });

  it("ignores missing vertices", () => {
    expect(
      f2fStrengthDeficiency(profile({ force: null, form: vertex(4.9) }))
    ).toEqual({ explosion: "deficiency", force: null, form: "strength" });
  });
});

describe("f2fCardHeading", () => {
  it("is just the name when show_predicted_40s is false", () => {
    expect(
      f2fCardHeading("Ada Lovelace", profile({ show_predicted_40s: false }))
    ).toBe("Ada Lovelace");
  });

  it("appends the reference 40 when show_predicted_40s is true", () => {
    expect(
      f2fCardHeading(
        "Ada Lovelace",
        profile({ show_predicted_40s: true, reference_40: 5.2 })
      )
    ).toBe("Ada Lovelace: 5.20 40yd");
  });
});

describe("f2fFocusBadge", () => {
  it("follows eligible_for_labels and uses Develop Top-End for Form", () => {
    expect(f2fFocusBadge(profile({ primary: "form" }))).toEqual({
      text: "Develop Top-End",
      tone: "form",
    });
    expect(f2fFocusBadge(profile({ primary: "explosion" }))).toEqual({
      text: "Develop Explosion",
      tone: "explosion",
    });
    expect(f2fFocusBadge(profile({ primary: "force" }))).toEqual({
      text: "Develop Force",
      tone: "force",
    });
    expect(
      f2fFocusBadge(profile({ eligible_for_labels: false, primary: "force" }))
    ).toBeNull();
    expect(f2fFocusBadge(profile({ primary: "balanced" }))).toBeNull();
    expect(f2fFocusBadge(undefined)).toBeNull();
  });
});

describe("f2fPieSlices", () => {
  it("omits zeros and percents against eligible_count", () => {
    const mix: F2fThemeMix = {
      explosion: 8,
      force: 12,
      form: 0,
      balanced: 5,
    };
    expect(f2fPieSlices(mix, 25)).toEqual([
      { key: "balanced", label: "Balanced", count: 5, percent: 20 },
      {
        key: "explosion",
        label: "Explosion-deficient",
        count: 8,
        percent: 32,
      },
      { key: "force", label: "Force-deficient", count: 12, percent: 48 },
    ]);
    expect(f2fPieSlices(mix, 0)).toEqual([]);
  });
});

describe("pdfCoachF2fCopy", () => {
  it("says Top-End in analysis copy and keeps the Force-to-Form title", () => {
    expect(pdfCoachF2fCopy("Form-deficient")).toBe("Top-End-deficient");
    expect(pdfCoachF2fCopy("No Force-to-Form labels yet.")).toBe(
      "No Force-to-Form labels yet."
    );
    expect(PDF_F2F_QUALITY_LABELS.form).toBe("Top-End");
  });
});

describe("zoneAbbrev", () => {
  it("maps live zones to compact athlete-table codes", () => {
    expect(zoneAbbrev("efficient")).toBe("EFF");
    expect(zoneAbbrev("advanced")).toBe("ADV");
    expect(zoneAbbrev("elite")).toBe("E");
    expect(zoneAbbrev("world-class")).toBe("WC");
    expect(zoneAbbrev("poor")).toBeNull();
    expect(ZONE_ABBREV_LEGEND).toContain("EFF Efficient");
  });
});

describe("pieSlicePath", () => {
  it("starts with M and contains an arc", () => {
    const d = pieSlicePath(50, 50, 40, 0, 0.25);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("A");
  });
});
