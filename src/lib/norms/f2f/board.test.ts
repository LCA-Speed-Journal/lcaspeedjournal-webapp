import { describe, expect, it } from "vitest";
import { attachF2fToAthletes } from "./board";
import { buildF2fProfile } from "./profile";
import { buildF2fThemes } from "./themes";
import type { F2fEntry } from "./types";
import type { TestingDayMatrixAthlete } from "../testing-day";

const BATTERY: F2fEntry[] = [
  { metric_key: "Standing-Broad", component: null, display_value: 9 },
  { metric_key: "40yd_Dash", component: "5-10yd", display_value: 0.625 },
  { metric_key: "40yd_Dash", component: "20-40yd", display_value: 2.045 },
  { metric_key: "40yd_Dash", component: "0-40yd", display_value: 5.0 },
];

function athlete(
  partial: Partial<TestingDayMatrixAthlete> &
    Pick<TestingDayMatrixAthlete, "athlete_id">
): TestingDayMatrixAthlete {
  return {
    first_name: "A",
    last_name: "Runner",
    gender: "M",
    sport: "soccer",
    cells: { keep: { display_value: 1 } },
    ...partial,
  };
}

function entriesByAthlete(
  pairs: Array<[string, F2fEntry[]]>
): Map<string, F2fEntry[]> {
  return new Map(pairs);
}

describe("attachF2fToAthletes", () => {
  it("sets f2f from the session battery and returns buildF2fThemes as f2f_themes", () => {
    const male = athlete({
      athlete_id: "m1",
      first_name: "Max",
      last_name: "Male",
      gender: "M",
    });
    const girl = athlete({
      athlete_id: "f1",
      first_name: "Gina",
      last_name: "Female",
      gender: "F",
    });
    const entries = entriesByAthlete([
      [male.athlete_id, BATTERY],
      [girl.athlete_id, BATTERY],
    ]);

    const result = attachF2fToAthletes([male, girl], entries);

    expect(result.athletes[0].f2f?.reference_source).toBe("actual_40");
    expect(result.athletes[0].f2f?.eligible_for_labels).toBe(true);
    expect(result.athletes[1].f2f?.explosion).not.toBeNull();
    expect(result.athletes[1].f2f?.force).not.toBeNull();
    expect(result.athletes[1].f2f?.form).not.toBeNull();
    expect(result.athletes[1].f2f?.eligible_for_labels).toBe(true);
    expect(result.athletes[1].f2f?.show_predicted_40s).toBe(false);
    expect(result.athletes[0].f2f?.show_predicted_40s).toBe(true);

    const themeAthletes = result.athletes
      .filter((row) => row.f2f)
      .map((row) => ({
        id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        sport: row.sport,
        gender: row.gender,
        eligible_for_labels: row.f2f!.eligible_for_labels,
        primary: row.f2f!.primary,
        reference_40: row.f2f!.reference_40,
      }));
    expect(result.f2f_themes).toEqual(buildF2fThemes(themeAthletes, {}));
    expect(result.f2f_themes.session.eligible_count).toBe(2);
    expect(result.f2f_themes.groups.some((group) => group.gender === "F")).toBe(
      true
    );
  });

  it("leaves the rest of the athlete row intact when a profile builder throws", () => {
    const male = athlete({
      athlete_id: "m1",
      first_name: "Max",
      last_name: "Male",
      gender: "M",
      sprint_points: 12,
    });
    const girl = athlete({
      athlete_id: "f1",
      first_name: "Gina",
      last_name: "Female",
      gender: "F",
    });
    const entries = entriesByAthlete([
      [male.athlete_id, BATTERY],
      [girl.athlete_id, BATTERY],
    ]);

    const result = attachF2fToAthletes([male, girl], entries, {
      buildProfile: (marks, subject) => {
        if (subject.gender === "M") {
          throw new Error("lookup tables failed");
        }
        return buildF2fProfile(marks, subject);
      },
    });

    const maleRow = result.athletes[0];
    expect(maleRow.f2f).toBeUndefined();
    expect(maleRow.athlete_id).toBe("m1");
    expect(maleRow.first_name).toBe("Max");
    expect(maleRow.last_name).toBe("Male");
    expect(maleRow.gender).toBe("M");
    expect(maleRow.sport).toBe("soccer");
    expect(maleRow.cells).toEqual({ keep: { display_value: 1 } });
    expect(maleRow.sprint_points).toBe(12);

    expect(result.athletes[1].f2f).toBeDefined();
    expect(result.athletes[1].f2f?.eligible_for_labels).toBe(true);
    expect(result.f2f_themes.session.eligible_count).toBe(1);
  });

  it("passes noteOverrides through to f2f_themes", () => {
    const male = athlete({
      athlete_id: "m1",
      first_name: "Max",
      last_name: "Male",
      gender: "M",
    });
    const entries = entriesByAthlete([[male.athlete_id, BATTERY]]);
    const noteOverrides = {
      session: "Session takeaway",
      "soccer|M": "the gap is Force, not speed",
    };

    const result = attachF2fToAthletes([male], entries, { noteOverrides });

    const themeAthletes = result.athletes
      .filter((row) => row.f2f)
      .map((row) => ({
        id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        sport: row.sport,
        gender: row.gender,
        eligible_for_labels: row.f2f!.eligible_for_labels,
        primary: row.f2f!.primary,
        reference_40: row.f2f!.reference_40,
      }));
    expect(result.f2f_themes).toEqual(buildF2fThemes(themeAthletes, noteOverrides));
    expect(result.f2f_themes.session.note).toBe("Session takeaway");
    expect(result.f2f_themes.groups[0]?.note).toBe("the gap is Force, not speed");
  });
});

