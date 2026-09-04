import { describe, expect, it } from "vitest";
import { mphFromYardSplit } from "../forty-yd";
import { buildF2fProfile } from "./profile";
import { reconstructFiveFifteen } from "./reconstruct-515";
import { resolveForce } from "./resolve-mark";

const male = { gender: "M" as const };

describe("buildF2fProfile", () => {
  it("uses actual 0-40yd as the reference when present", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 9 },
        { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.625 },
        { metric_key: "40yd_Dash", component: "20-40yd", display_value: 2.045 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.0 },
      ],
      male
    );
    expect(profile.reference_40).toBe(5);
    expect(profile.reference_source).toBe("actual_40");
    expect(profile.explosion?.predicted_40).toBeCloseTo(4.64, 2);
    expect(profile.force?.predicted_40).toBeCloseTo(4.93, 2);
    expect(profile.form?.predicted_40).toBeCloseTo(4.9, 2);
    expect(profile.form?.projected).toBe(false);
    expect(profile.eligible_for_labels).toBe(true);
    expect(profile.flags).toEqual([]);
    expect(profile.primary).toBe("balanced");
  });

  it("does not let a big broad jump average up a mediocre 20yd", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 10 },
        { metric_key: "20yd_Dash", component: "0-20yd", display_value: 2.9 },
        { metric_key: "20yd_Dash", component: "5-10yd", display_value: 0.85 },
        { metric_key: "20yd_Dash", component: "10-20yd", display_value: 1.3 },
      ],
      male
    );
    expect(profile.reference_source).toBe("projected");
    const reconstructed = reconstructFiveFifteen(0.85, 1.3);
    const expectedForce = resolveForce({
      timeS: reconstructed!.timeS,
      yards: 10,
      lookup: "time",
    });
    expect(profile.force?.projected).toBe(true);
    expect(profile.force?.input?.component).toBe("5-15yd");
    expect(profile.force?.predicted_40).toBeCloseTo(expectedForce!.predicted_40);
    const explosion = profile.explosion!.predicted_40;
    const force = profile.force!.predicted_40;
    const form = profile.form!.predicted_40;
    const sprintMedian = (force + form) / 2;
    const withExplosion = (explosion + force + form) / 3;
    expect(profile.reference_40).toBeCloseTo(sprintMedian);
    expect(profile.reference_40).not.toBeCloseTo(withExplosion);
    expect(profile.reference_40).toBeGreaterThan(explosion);
    expect(profile.form?.projected).toBe(true);
  });

  it("projects reference from a 20yd Force stand-in without averaging explosion", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 10 },
        { metric_key: "20yd_Dash", component: "0-20yd", display_value: 2.9 },
      ],
      male
    );
    const standIn = resolveForce({ timeS: 2.9, yards: 20 });
    expect(profile.force).not.toBeNull();
    expect(profile.force?.predicted_40).toBeCloseTo(standIn!.predicted_40);
    expect(profile.reference_source).toBe("projected");
    expect(profile.reference_40).toBeCloseTo(profile.force!.predicted_40);
    expect(profile.form?.projected).toBe(true);
    expect(profile.form?.predicted_40).toBeCloseTo(profile.reference_40!);
    expect(profile.reference_40).toBeGreaterThan(profile.explosion!.predicted_40);
  });

  it("flags qualities 3-4% slower than reference and picks the worst as primary", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 8 },
        { metric_key: "40yd_Dash", component: "5-10yd", display_value: 1.39 },
        { metric_key: "40yd_Dash", component: "20-40yd", display_value: 2.045 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 4.7 },
      ],
      male
    );
    expect(profile.flags).toContain("force");
    expect(profile.primary).toBe("force");
  });

  it("returns vertices without labels for girls", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 8 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.2 },
      ],
      { gender: "F" }
    );
    expect(profile.explosion).not.toBeNull();
    expect(profile.eligible_for_labels).toBe(false);
    expect(profile.primary).toBeNull();
    expect(profile.flags).toEqual([]);
  });

  it("leaves primary null when fewer than two qualities exist", () => {
    const profile = buildF2fProfile(
      [{ metric_key: "Standing-Broad", component: null, display_value: 9 }],
      male
    );
    expect(profile.explosion).not.toBeNull();
    expect(profile.primary).toBeNull();
  });

  it("accepts 40yd 0-20 as the Force stand-in", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 10 },
        { metric_key: "40yd_Dash", component: "0-20yd", display_value: 2.9 },
      ],
      male
    );
    const standIn = resolveForce({ timeS: 2.9, yards: 20 });
    expect(profile.force).not.toBeNull();
    expect(profile.force?.predicted_40).toBeCloseTo(standIn!.predicted_40);
    expect(profile.form?.projected).toBe(true);
    expect(profile.form?.predicted_40).toBeCloseTo(profile.reference_40!);
  });

  it("projects missing Form onto an actual 40 when Force exists", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 9 },
        { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.7 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.1 },
      ],
      male
    );
    expect(profile.form?.projected).toBe(true);
    expect(profile.form?.predicted_40).toBe(5.1);
    expect(profile.reference_40).toBe(5.1);
  });

  it("does not project Form when the only quality is Explosion plus a 40", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 9 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.2 },
      ],
      male
    );
    expect(profile.explosion).not.toBeNull();
    expect(profile.force).toBeNull();
    expect(profile.form).toBeNull();
  });

  it("reconstructs Force 5-15 from 5-10 and 10-20 instead of 5-10 mph", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "Standing-Broad", component: null, display_value: 9 },
        { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.7 },
        { metric_key: "40yd_Dash", component: "10-20yd", display_value: 1.3 },
        { metric_key: "40yd_Dash", component: "20-40yd", display_value: 2.045 },
        { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.0 },
      ],
      male
    );
    const mphOnly = resolveForce({ timeS: 0.7, yards: 5 });
    expect(profile.force?.projected).toBe(true);
    expect(profile.force?.input?.component).toBe("5-15yd");
    expect(profile.force?.input?.value).toBeCloseTo(1.365, 3);
    expect(profile.force?.mph).toBeCloseTo(mphFromYardSplit(1.365, 10)!, 2);
    expect(profile.force?.predicted_40).not.toBeCloseTo(mphOnly!.predicted_40, 2);
    expect(profile.form?.projected).toBe(false);
  });

  it("prefers a timed 5-15yd over reconstruction", () => {
    const profile = buildF2fProfile(
      [
        { metric_key: "40yd_Dash", component: "5-15yd", display_value: 1.2 },
        { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.7 },
        { metric_key: "40yd_Dash", component: "10-20yd", display_value: 1.3 },
      ],
      male
    );
    const timed = resolveForce({ timeS: 1.2, yards: 10, lookup: "time" });
    expect(profile.force?.projected).toBe(false);
    expect(profile.force?.input?.component).toBe("5-15yd");
    expect(profile.force?.input?.value).toBe(1.2);
    expect(profile.force?.mph).toBeCloseTo(mphFromYardSplit(1.2, 10)!, 2);
    expect(profile.force?.predicted_40).toBeCloseTo(timed!.predicted_40);
  });

  it("copies metric input and session_date onto vertices", () => {
    const profile = buildF2fProfile(
      [
        {
          metric_key: "Standing-Broad",
          component: null,
          display_value: 10,
          session_date: "2026-01-15",
        },
        {
          metric_key: "40yd_Dash",
          component: "5-10yd",
          display_value: 0.7,
          session_date: "2026-04-20",
        },
      ],
      male
    );
    expect(profile.explosion?.input).toEqual({
      metric_key: "Standing-Broad",
      component: null,
      value: 10,
      units: "ft",
    });
    expect(profile.explosion?.session_date).toBe("2026-01-15");
    expect(profile.force?.input).toEqual({
      metric_key: "40yd_Dash",
      component: "5-10yd",
      value: 0.7,
      units: "s",
    });
    expect(profile.force?.session_date).toBe("2026-04-20");
  });
});
