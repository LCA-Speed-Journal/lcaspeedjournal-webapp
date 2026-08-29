import { describe, it, expect } from "vitest";
import { parseWorkoutCsv } from "./csv-import";

const HEADER =
  "week,day,session_date,focus,hugo_group,label,name,block,set_count,targets,notes";

describe("parseWorkoutCsv", () => {
  it("groups rows with the same group+date+focus into one template", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,extracurricular,1,DB Bench,Main,2,5 @ RPE 8|5 @ RPE 8,",
      "1,Monday,2026-09-08,Upper A,extracurricular,2,TRX Row,Main,2,12+|12+,BW",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0].movements).toHaveLength(2);
    expect(r.errors).toEqual([]);
    expect(r.templates[0]).toMatchObject({
      week_number: 1,
      day_name: "Monday",
      session_date: "2026-09-08",
      focus: "Upper A",
      hugo_group: "extracurricular",
      title: "Monday — Upper A",
    });
    expect(r.templates[0].movements[0]).toMatchObject({
      sort_index: 0,
      label: "1",
      name: "DB Bench",
      block: "Main",
      set_count: 2,
      targets: ["5 @ RPE 8", "5 @ RPE 8"],
      notes: "",
    });
    expect(r.templates[0].movements[1]).toMatchObject({
      sort_index: 1,
      label: "2",
      name: "TRX Row",
      notes: "BW",
    });
  });

  it("keeps valid rows and records row errors", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,not-a-sport,1,DB Bench,Main,1,5,",
      "1,Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,1,8,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.some((e) => e.row === 2)).toBe(true);
    expect(r.templates[0].hugo_group).toBe("soccer");
  });

  it("records a row error when session_date is missing", () => {
    const csv = [
      HEADER,
      "1,Monday,,Upper A,soccer,1,Goblet,Main,1,8,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.some((e) => e.row === 2)).toBe(true);
    expect(r.templates).toHaveLength(0);
  });

  it("records a row error when set_count does not match targets length", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,2,8,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.some((e) => e.row === 2)).toBe(true);
    expect(r.templates).toHaveLength(0);
  });

  it("builds one template per distinct date", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,soccer,1,DB Bench,Main,1,5,",
      "1,Wednesday,2026-09-10,Lower A,soccer,1,Squat,Main,1,5,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates).toHaveLength(2);
    expect(r.templates.map((t) => t.session_date)).toEqual([
      "2026-09-08",
      "2026-09-10",
    ]);
    expect(r.errors).toEqual([]);
  });

  it("builds one template per hugo_group when date and focus match", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,soccer,1,DB Bench,Main,1,5,",
      "1,Monday,2026-09-08,Upper A,volleyball,1,DB Bench,Main,1,5,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates).toHaveLength(2);
    expect(r.templates.map((t) => t.hugo_group)).toEqual([
      "soccer",
      "volleyball",
    ]);
    expect(r.errors).toEqual([]);
  });

  it("builds one template per focus when group and date match", () => {
    const csv = [
      HEADER,
      "1,Monday,2026-09-08,Upper A,soccer,1,DB Bench,Main,1,5,",
      "1,Monday,2026-09-08,Lower,soccer,1,Squat,Main,1,5,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates).toHaveLength(2);
    expect(r.templates.map((t) => t.focus)).toEqual(["Upper A", "Lower"]);
    expect(r.errors).toEqual([]);
  });

  it("returns ok false when the header is missing or wrong", () => {
    const missing = parseWorkoutCsv("");
    expect(missing.ok).toBe(false);

    const wrong = parseWorkoutCsv(
      "week,day,date,focus,hugo_group,label,name,block,set_count,targets,notes\n1,Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,1,8,"
    );
    expect(wrong.ok).toBe(false);
  });

  it("treats empty week as null week_number", () => {
    const csv = [
      HEADER,
      ",Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,1,8,",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates[0].week_number).toBeNull();
    expect(r.errors).toEqual([]);
  });

  it("parses quoted notes that contain commas", () => {
    const csv = [
      HEADER,
      '1,Monday,2026-09-08,Upper A,soccer,1,Goblet,Main,1,8,"hold, then lower"',
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templates[0].movements[0].notes).toBe("hold, then lower");
    expect(r.errors).toEqual([]);
  });
});
