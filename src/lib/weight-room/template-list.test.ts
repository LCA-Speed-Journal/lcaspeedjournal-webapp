import { describe, it, expect } from "vitest";
import { filterTemplatesByActivity } from "./template-list";

const templates = [
  { id: "1", hugo_group: "volleyball", title: "VB Mon" },
  { id: "2", hugo_group: "xc", title: "XC Tue" },
  { id: "3", hugo_group: "volleyball", title: "VB Wed" },
];

describe("filterTemplatesByActivity", () => {
  it("returns every template when activity is empty (All)", () => {
    expect(filterTemplatesByActivity(templates, "")).toEqual(templates);
  });

  it("keeps only the selected activity", () => {
    expect(filterTemplatesByActivity(templates, "xc").map((t) => t.id)).toEqual(
      ["2"]
    );
    expect(
      filterTemplatesByActivity(templates, "volleyball").map((t) => t.id)
    ).toEqual(["1", "3"]);
  });
});
