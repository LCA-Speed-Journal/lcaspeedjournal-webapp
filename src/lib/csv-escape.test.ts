import { describe, it, expect } from "vitest";
import { escapeCsvCell } from "./csv-escape";

describe("escapeCsvCell", () => {
  it("leaves plain alphanumeric unchanged", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("quotes fields containing comma", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles internal quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing newline", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles raw_input style with triple quotes and commas", () => {
    const raw = `foo,"""bar",baz`;
    // Three literal quotes before bar → each doubled inside the quoted field
    expect(escapeCsvCell(raw)).toBe('"foo,""""""bar"",baz"');
  });

  it("empty null undefined become empty unquoted field", () => {
    expect(escapeCsvCell("")).toBe("");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});
