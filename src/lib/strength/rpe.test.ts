import { describe, expect, it } from "vitest";
import { applyRpeNudge, resolveSetRpe } from "./rpe";

describe("resolveSetRpe", () => {
  it("prefers the override over the card", () => {
    expect(resolveSetRpe({ target: "3 @ RPE 8", rpeOverride: 6.5 })).toEqual({
      rpe: 6.5,
      prescribedReps: 3,
      rmAttempt: false,
    });
  });

  it("reads reps and RPE from the target", () => {
    expect(resolveSetRpe({ target: "6/side @ RPE 7", rpeOverride: null })).toEqual({
      rpe: 7,
      prescribedReps: 6,
      rmAttempt: false,
    });
  });

  it("treats an RM attempt as RPE 10", () => {
    expect(resolveSetRpe({ target: "3RM Attempt", rpeOverride: null })).toEqual({
      rpe: 10,
      prescribedReps: 3,
      rmAttempt: true,
    });
  });

  it("returns null RPE when the target has no intensity", () => {
    expect(resolveSetRpe({ target: "Max Attempt", rpeOverride: null }).rpe).toBeNull();
  });

  it("uses the high end of a rep range", () => {
    expect(resolveSetRpe({ target: "6\u20138 @ RPE 7", rpeOverride: null })).toEqual({
      rpe: 7,
      prescribedReps: 8,
      rmAttempt: false,
    });
  });

  it("reads a hyphen range with a side qualifier", () => {
    expect(resolveSetRpe({ target: "6-8/side @ RPE 8", rpeOverride: null })).toEqual({
      rpe: 8,
      prescribedReps: 8,
      rmAttempt: false,
    });
  });

  it("reads a plus target", () => {
    expect(resolveSetRpe({ target: "12+ @ RPE 8", rpeOverride: null })).toEqual({
      rpe: 8,
      prescribedReps: 12,
      rmAttempt: false,
    });
  });

  it("reads RPE from an AMRAP target and leaves reps empty", () => {
    expect(resolveSetRpe({ target: "AMRAP @ RPE 8", rpeOverride: null })).toEqual({
      rpe: 8,
      prescribedReps: null,
      rmAttempt: false,
    });
  });

  it("treats a bare RM as an attempt", () => {
    expect(resolveSetRpe({ target: "5RM", rpeOverride: null })).toEqual({
      rpe: 10,
      prescribedReps: 5,
      rmAttempt: true,
    });
  });
});

describe("applyRpeNudge", () => {
  it("steps by 0.5 and stops at ±1.5", () => {
    expect(applyRpeNudge(8, 0.5)).toBe(8.5);
    expect(applyRpeNudge(8, 1.5)).toBe(9.5);
    expect(applyRpeNudge(8, 2)).toBe(9.5);
    expect(applyRpeNudge(8, -1.5)).toBe(6.5);
  });

  it("clamps to the chart range", () => {
    expect(applyRpeNudge(10, 1.5)).toBe(10);
    expect(applyRpeNudge(3, -1.5)).toBe(3);
  });

  it("snaps a small negative delta away from zero", () => {
    expect(applyRpeNudge(8, -0.25)).toBe(7.5);
  });
});
