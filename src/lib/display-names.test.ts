import { describe, it, expect } from "vitest";
import { formatLeaderboardName } from "./display-names";

describe("formatLeaderboardName", () => {
  it("returns first initial + last name for staff on desktop", () => {
    expect(
      formatLeaderboardName("Jon", "Vaala", "staff", false)
    ).toBe("J. Vaala");
  });

  it("returns first initial + last name for staff on mobile", () => {
    expect(
      formatLeaderboardName("Jon", "Vaala", "staff", true)
    ).toBe("J. Vaala");
  });

  it("returns full name for athlete on desktop", () => {
    expect(
      formatLeaderboardName("Sarah", "Johnson", "athlete", false)
    ).toBe("Sarah Johnson");
  });

  it("returns first initial + last name for athlete on mobile", () => {
    expect(
      formatLeaderboardName("Sarah", "Johnson", "athlete", true)
    ).toBe("S. Johnson");
  });

  it("returns full name for alumni on desktop", () => {
    expect(
      formatLeaderboardName("Mike", "Smith", "alumni", false)
    ).toBe("Mike Smith");
  });

  it("returns first initial + last name for alumni on mobile", () => {
    expect(
      formatLeaderboardName("Mike", "Smith", "alumni", true)
    ).toBe("M. Smith");
  });

  it("treats undefined athlete_type as athlete on desktop", () => {
    expect(
      formatLeaderboardName("Jane", "Doe", undefined, false)
    ).toBe("Jane Doe");
  });

  it("returns only last_name when first_name is empty", () => {
    expect(
      formatLeaderboardName("", "Smith", "staff", false)
    ).toBe("Smith");
  });

  it("returns full first_name when last_name is empty", () => {
    expect(
      formatLeaderboardName("Jon", "", "athlete", false)
    ).toBe("Jon");
  });

  it("returns empty string when both names are empty", () => {
    expect(formatLeaderboardName("", "", "athlete", false)).toBe("");
  });
});
