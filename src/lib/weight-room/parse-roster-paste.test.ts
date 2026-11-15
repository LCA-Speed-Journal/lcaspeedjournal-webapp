import { describe, it, expect } from "vitest";
import { parseRosterPaste } from "./parse-roster-paste";

describe("parseRosterPaste", () => {
  it("parses Last, First lines", () => {
    const rows = parseRosterPaste("Smith, Jane\nDoe, John");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Smith, Jane", grade: null },
      { first_name: "John", last_name: "Doe", raw: "Doe, John", grade: null },
    ]);
  });

  it("parses First Last lines", () => {
    const rows = parseRosterPaste("Jane Smith");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Jane Smith", grade: null },
    ]);
  });

  it("skips blanks and records unparseable lines", () => {
    const rows = parseRosterPaste("\nMadonna\n  ");
    expect(rows[0]).toMatchObject({
      first_name: "",
      last_name: "",
      raw: "Madonna",
      grade: null,
      error: "Could not split into first and last name",
    });
  });

  it("reads an optional grade and still accepts last, first", () => {
    const rows = parseRosterPaste("Youtsey, Jimmy, 12\nSmith, Jane\nSmith, Mary Ann, 11");
    expect(rows[0]).toMatchObject({ first_name: "Jimmy", last_name: "Youtsey", grade: 12 });
    expect(rows[1]).toMatchObject({ first_name: "Jane", last_name: "Smith", grade: null });
    expect(rows[2]).toMatchObject({ first_name: "Mary Ann", last_name: "Smith", grade: 11 });
  });

  it("keeps a non-grade third field in the first name", () => {
    const rows = parseRosterPaste("Smith, Mary Ann, Jr\nDoe, John, 13\nLee, Amy, 9");
    expect(rows[0]).toMatchObject({
      first_name: "Mary Ann, Jr",
      last_name: "Smith",
      grade: null,
    });
    expect(rows[0].error).toBeUndefined();
    expect(rows[1]).toMatchObject({ first_name: "John, 13", last_name: "Doe", grade: null });
    expect(rows[2]).toMatchObject({ first_name: "Amy", last_name: "Lee", grade: 9 });
  });
});
