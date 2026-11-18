import { describe, expect, it } from "vitest";
import { meetSheetFilename, meetSheetPage } from "./meet-sheet";

describe("meet sheet", () => {
  it("prints landscape with tight margins", () => {
    expect(meetSheetPage).toEqual({
      size: "LETTER",
      orientation: "landscape",
      paddingTop: 12,
      paddingBottom: 12,
      paddingHorizontal: 12,
    });
  });

  it("names the file from the team", () => {
    expect(meetSheetFilename("mens_basketball")).toBe("boys-basketball-meet.pdf");
    expect(meetSheetFilename("womens_basketball")).toBe("girls-basketball-meet.pdf");
  });
});
