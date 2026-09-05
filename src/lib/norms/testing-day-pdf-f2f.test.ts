import { describe, expect, it } from "vitest";
import type { F2fProfile } from "./f2f/types";
import type { F2fThemeMix } from "./f2f/themes";
import {
  f2fFocusBadge,
  f2fPieSlices,
  f2fStrengthDeficiency,
  pieSlicePath,
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

describe("f2fFocusBadge", () => {
  it("is male-only and uses Develop Top-End for Form", () => {
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

describe("pieSlicePath", () => {
  it("starts with M and contains an arc", () => {
    const d = pieSlicePath(50, 50, 40, 0, 0.25);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("A");
  });
});
