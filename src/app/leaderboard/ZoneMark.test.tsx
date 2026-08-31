import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ZoneLegend, ZoneMark } from "./ZoneMark";

describe("ZoneMark", () => {
  it("renders the zone chip with color and population title", () => {
    const html = renderToStaticMarkup(
      createElement(ZoneMark, {
        label: "elite",
        color: "#2563eb",
        populationName: "Football Skill 40yd",
      })
    );
    expect(html).toContain("zone-badge");
    expect(html).toContain("elite");
    expect(html).toContain("#2563eb");
    expect(html).toContain("Football Skill 40yd");
  });
});

describe("ZoneLegend", () => {
  it("lists every palette label plus no badge", () => {
    const html = renderToStaticMarkup(createElement(ZoneLegend));
    expect(html).toContain("aria-label=\"Zone legend\"");
    expect(html).toContain("poor");
    expect(html).toContain("world-class");
    expect(html).toContain("no badge");
  });
});
