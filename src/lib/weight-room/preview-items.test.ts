import { describe, expect, it } from "vitest";
import { getPreviewCatalog } from "./preview-items";

describe("getPreviewCatalog density hints", () => {
  it("does not treat 14 rows as past a hard scan-safe movement cap", () => {
    const item = getPreviewCatalog().find((i) => i.id === "stress-14");
    expect(item).toBeTruthy();
    expect(item!.hint).not.toMatch(/scan-safe cap/i);
    expect(item!.fit.scanSafe).toBe(true);
  });
});
