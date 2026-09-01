import { describe, it, expect } from "vitest";
import { defaultCutsComponent } from "./editor-metrics";

describe("defaultCutsComponent", () => {
  it("defaults 40yd_Dash to 0-40yd so named parsed rows can match cuts", () => {
    expect(defaultCutsComponent("40yd_Dash")).toBe("0-40yd");
  });

  it("keeps other metrics empty/none", () => {
    expect(defaultCutsComponent("Vertical Jump")).toBe("");
    expect(defaultCutsComponent("Standing-Broad")).toBe("");
    expect(defaultCutsComponent("OH-MB_Throw")).toBe("");
  });
});
