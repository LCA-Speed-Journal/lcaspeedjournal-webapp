import { describe, it, expect } from "vitest";
import {
  parseNameFromQuery,
  gradeToGraduatingClass,
  resolveGraduatingClass,
  buildAthleteCreatePayload,
  addOptionVisible,
  pickerOptionCount,
  isAddOptionIndex,
  nextHighlightIndex,
} from "./quick-athlete";

describe("parseNameFromQuery", () => {
  it("splits on the first space", () => {
    expect(parseNameFromQuery("Jordan Smith")).toEqual({
      first: "Jordan",
      last: "Smith",
    });
  });

  it("leaves last empty for a one-word name", () => {
    expect(parseNameFromQuery("Jordan")).toEqual({
      first: "Jordan",
      last: "",
    });
  });

  it("puts remaining words in last after the first space", () => {
    expect(parseNameFromQuery("Mary Ann Smith")).toEqual({
      first: "Mary",
      last: "Ann Smith",
    });
  });

  it("trims the query and each part", () => {
    expect(parseNameFromQuery("  Jordan   Smith  ")).toEqual({
      first: "Jordan",
      last: "Smith",
    });
  });

  it("returns empty parts for blank input", () => {
    expect(parseNameFromQuery("   ")).toEqual({ first: "", last: "" });
  });
});

describe("gradeToGraduatingClass", () => {
  const btsnNight = new Date("2026-08-25T18:00:00");

  it("maps 9–12 for August 2026 (school year ending 2027)", () => {
    expect(gradeToGraduatingClass(12, btsnNight)).toBe(2027);
    expect(gradeToGraduatingClass(11, btsnNight)).toBe(2028);
    expect(gradeToGraduatingClass(10, btsnNight)).toBe(2029);
    expect(gradeToGraduatingClass(9, btsnNight)).toBe(2030);
  });

  it("keeps the same school-year end in January of the following calendar year", () => {
    expect(gradeToGraduatingClass(12, new Date("2027-01-15T12:00:00"))).toBe(2027);
    expect(gradeToGraduatingClass(9, new Date("2027-01-15T12:00:00"))).toBe(2030);
  });

  it("returns null for grades outside 9–12", () => {
    expect(gradeToGraduatingClass(8, btsnNight)).toBeNull();
    expect(gradeToGraduatingClass(13, btsnNight)).toBeNull();
  });
});

describe("resolveGraduatingClass", () => {
  it("returns null for alumni regardless of class year", () => {
    expect(resolveGraduatingClass("alumni", 2027)).toBeNull();
  });

  it("returns null when a current athlete omits class year", () => {
    expect(resolveGraduatingClass("athlete", null)).toBeNull();
    expect(resolveGraduatingClass("athlete", "")).toBeNull();
    expect(resolveGraduatingClass("athlete", undefined)).toBeNull();
  });

  it("parses a numeric class year for current athletes", () => {
    expect(resolveGraduatingClass("athlete", 2029)).toBe(2029);
    expect(resolveGraduatingClass("athlete", "2029")).toBe(2029);
  });

  it("returns null for non-numeric class year", () => {
    expect(resolveGraduatingClass("athlete", "nope")).toBeNull();
  });
});

describe("buildAthleteCreatePayload", () => {
  const now = new Date("2026-08-25T18:00:00");

  it("builds an athlete without graduating_class when grade is omitted", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: " Jordan ",
        lastName: " Smith ",
        gender: "F",
        alumniStaff: false,
        grade: null,
        now,
      })
    ).toEqual({
      first_name: "Jordan",
      last_name: "Smith",
      gender: "F",
      athlete_type: "athlete",
    });
  });

  it("adds graduating_class from grade 9–12 for current athletes", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: "Jordan",
        lastName: "Smith",
        gender: "M",
        alumniStaff: false,
        grade: 10,
        now,
      }).graduating_class
    ).toBe(2029);
  });

  it("stores alumni and ignores grade", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: "Pat",
        lastName: "Lee",
        gender: "M",
        alumniStaff: true,
        grade: 12,
        now,
      })
    ).toEqual({
      first_name: "Pat",
      last_name: "Lee",
      gender: "M",
      athlete_type: "alumni",
    });
  });
});

describe("athlete picker add option", () => {
  it("hides Add when the query is blank", () => {
    expect(addOptionVisible("")).toBe(false);
    expect(addOptionVisible("   ")).toBe(false);
    expect(pickerOptionCount(5, "")).toBe(5);
    expect(isAddOptionIndex(5, 5, "")).toBe(false);
  });

  it("appends Add after matches when the query has text", () => {
    expect(addOptionVisible("Jordan")).toBe(true);
    expect(pickerOptionCount(2, "Jordan")).toBe(3);
    expect(isAddOptionIndex(2, 2, "Jordan")).toBe(true);
    expect(isAddOptionIndex(0, 2, "Jordan")).toBe(false);
  });

  it("treats Add as index 0 when there are no matches", () => {
    expect(pickerOptionCount(0, "Jordan")).toBe(1);
    expect(isAddOptionIndex(0, 0, "Jordan")).toBe(true);
  });

  it("wraps highlight indexes over matches plus Add", () => {
    expect(nextHighlightIndex(0, 3, 1)).toBe(1);
    expect(nextHighlightIndex(2, 3, 1)).toBe(0);
    expect(nextHighlightIndex(0, 3, -1)).toBe(2);
    expect(nextHighlightIndex(0, 0, 1)).toBe(0);
  });
});
