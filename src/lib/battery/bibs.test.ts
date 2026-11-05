import { describe, expect, it } from "vitest";
import { assignBibs, athletesForIssuedBibs, gradeDigit } from "./bibs";

const senior = 2027;

describe("gradeDigit", () => {
  it("maps the 2026-27 classes", () => {
    expect(gradeDigit(2030, senior)).toBe(1);
    expect(gradeDigit(2029, senior)).toBe(2);
    expect(gradeDigit(2028, senior)).toBe(3);
    expect(gradeDigit(2027, senior)).toBe(4);
    expect(gradeDigit(2031, senior)).toBeNull();
    expect(gradeDigit(null, senior)).toBeNull();
  });
});

describe("assignBibs", () => {
  it("numbers alphabetical order inside the grade", () => {
    const bibs = assignBibs(
      [
        { athlete_id: "b", first_name: "Bea", last_name: "Young", graduating_class: 2029 },
        { athlete_id: "a", first_name: "Ann", last_name: "Adams", graduating_class: 2029 },
        { athlete_id: "c", first_name: "Cam", last_name: "Cole", graduating_class: 2030 },
      ],
      senior,
      []
    );
    expect(bibs.map((row) => [row.athlete_id, row.bib])).toEqual([
      ["c", "101"],
      ["a", "201"],
      ["b", "202"],
    ]);
  });

  it("appends a late add without renumbering issued bibs", () => {
    const bibs = assignBibs(
      [
        { athlete_id: "a", first_name: "Ann", last_name: "Adams", graduating_class: 2029 },
        { athlete_id: "z", first_name: "Zoe", last_name: "Zed", graduating_class: 2029 },
      ],
      senior,
      [{ athlete_id: "a", bib: "201" }]
    );
    expect(bibs.find((row) => row.athlete_id === "a")?.bib).toBe("201");
    expect(bibs.find((row) => row.athlete_id === "z")?.bib).toBe("202");
  });

  it("does not give a departed athlete's bib to a new freshman", () => {
    const stored = [{ athlete_id: "gone", bib: "101" }];
    const roster = [
      { athlete_id: "new", first_name: "Ned", last_name: "New", graduating_class: 2030 },
    ];
    const bibs = assignBibs(athletesForIssuedBibs(roster, stored, senior), senior, stored);
    expect(bibs.find((row) => row.athlete_id === "new")?.bib).toBe("102");
    expect(bibs.find((row) => row.athlete_id === "gone")?.bib).toBe("101");
  });

  it("does not reuse a stored bib when that athlete's grade digit changed", () => {
    const stored = [{ athlete_id: "a", bib: "101" }];
    const roster = [
      { athlete_id: "a", first_name: "Ann", last_name: "Adams", graduating_class: 2027 },
      { athlete_id: "new", first_name: "Ned", last_name: "New", graduating_class: 2030 },
    ];
    const bibs = assignBibs(athletesForIssuedBibs(roster, stored, senior), senior, stored);
    expect(bibs.find((row) => row.athlete_id === "new")?.bib).toBe("102");
  });
});
