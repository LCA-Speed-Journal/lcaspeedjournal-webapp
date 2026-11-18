import { describe, expect, it } from "vitest";
import { meetSheetFilename, meetSheetLogo, meetSheetPage, meetSheetTitle, meetSheetTitleSize } from "./meet-sheet";

describe("meet sheet", () => {
  it("prints landscape with tight margins", () => {
    expect(meetSheetPage).toEqual({
      size: "LETTER",
      orientation: "landscape",
      paddingTop: 16,
      paddingBottom: 16,
      paddingHorizontal: 16,
    });
  });

  it("names the file from the team", () => {
    expect(meetSheetFilename("mens_basketball")).toBe("boys-basketball-meet.pdf");
    expect(meetSheetFilename("womens_basketball")).toBe("girls-basketball-meet.pdf");
  });

  it("titles the report from the team and keeps the logo just taller than the title", () => {
    expect(meetSheetTitle("mens_basketball")).toBe("Baseline Testing Report: Men's Basketball");
    expect(meetSheetTitle("womens_basketball")).toBe("Baseline Testing Report: Women's Basketball");
    expect(meetSheetLogo.height).toBeCloseTo(meetSheetTitleSize * 1.05);
    expect(meetSheetLogo.width).toBeCloseTo(meetSheetLogo.height * 4);
  });
});
