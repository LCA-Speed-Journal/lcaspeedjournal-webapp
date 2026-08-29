import { describe, it, expect } from "vitest";
import { parseRosterPaste } from "./parse-roster-paste";

describe("parseRosterPaste", () => {
  it("parses Last, First lines", () => {
    const rows = parseRosterPaste("Smith, Jane\nDoe, John");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Smith, Jane" },
      { first_name: "John", last_name: "Doe", raw: "Doe, John" },
    ]);
  });

  it("parses First Last lines", () => {
    const rows = parseRosterPaste("Jane Smith");
    expect(rows).toEqual([
      { first_name: "Jane", last_name: "Smith", raw: "Jane Smith" },
    ]);
  });

  it("skips blanks and records unparseable lines", () => {
    const rows = parseRosterPaste("\nMadonna\n  ");
    expect(rows[0]).toMatchObject({
      first_name: "",
      last_name: "",
      raw: "Madonna",
      error: "Could not split into first and last name",
    });
  });
});
