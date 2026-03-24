import { describe, it, expect } from "vitest";
import {
  segmentToCumulative,
  segmentInputToCumulativeInput,
  parseEntry,
} from "./parser";

describe("segmentToCumulative", () => {
  it("returns running sum of segment values", () => {
    expect(segmentToCumulative([1, 2, 3])).toEqual([1, 3, 6]);
  });

  it("returns single value unchanged", () => {
    expect(segmentToCumulative([0.95])).toEqual([0.95]);
  });

  it("handles decimal segment times", () => {
    expect(segmentToCumulative([0.95, 0.9, 0.8])).toEqual([0.95, 1.85, 2.65]);
  });
});

describe("segmentInputToCumulativeInput", () => {
  it("converts pipe-separated segment string to cumulative string", () => {
    expect(segmentInputToCumulativeInput("0.95|0.90|0.80")).toBe("0.95|1.85|2.65");
  });

  it("returns null when any part is non-numeric", () => {
    expect(segmentInputToCumulativeInput("0.95|foo|0.80")).toBeNull();
    expect(segmentInputToCumulativeInput("")).toBeNull();
  });

  it("trims parts", () => {
    expect(segmentInputToCumulativeInput(" 0.95 | 0.90 | 0.80 ")).toBe("0.95|1.85|2.65");
  });
});

describe("parseEntry cumulative canonical keys", () => {
  it("20m_Accel with three cumulative times emits 5m_Accel, 10m_Accel, 20m_Accel rows", () => {
    const rows = parseEntry("20m_Accel", "1.0|2.0|3.0");
    const keys = rows.map((r) => r.metric_key);
    expect(keys).toContain("5m_Accel");
    expect(keys).toContain("10m_Accel");
    expect(keys).toContain("20m_Accel");
    expect(rows.filter((r) => r.metric_key === "5m_Accel")).toHaveLength(1);
    expect(rows.find((r) => r.metric_key === "5m_Accel")?.component).toBeNull();
    expect(rows.find((r) => r.metric_key === "10m_Accel")?.component).toBe("0-10m");
    expect(rows.find((r) => r.metric_key === "20m_Accel")?.component).toBe("0-20m");
  });

  it("40m_Sprint has no duplicate rows for same metric_key, component, and value", () => {
    const rows = parseEntry("40m_Sprint", "4.5|1.2|1.1");
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.metric_key}\0${r.component ?? ""}\0${r.value}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe("parseEntry throw metrics in feet", () => {
  it("keeps ShotPut input in feet without meter conversion", () => {
    const [row] = parseEntry("ShotPut", "45");
    expect(row.value).toBe(45);
    expect(row.display_value).toBe(45);
    expect(row.units).toBe("ft");
  });

  it("keeps Discus input in feet without meter conversion", () => {
    const [row] = parseEntry("Discus", "120");
    expect(row.value).toBe(120);
    expect(row.display_value).toBe(120);
    expect(row.units).toBe("ft");
  });

  it("supports Shotput_PWR and Discus_PWR using feet for input and display", () => {
    const [shotputPwrRow] = parseEntry("Shotput_PWR", "39.5");
    const [discusPwrRow] = parseEntry("Discus_PWR", "111.25");

    expect(shotputPwrRow.value).toBe(39.5);
    expect(shotputPwrRow.display_value).toBe(39.5);
    expect(shotputPwrRow.units).toBe("ft");

    expect(discusPwrRow.value).toBe(111.25);
    expect(discusPwrRow.display_value).toBe(111.25);
    expect(discusPwrRow.units).toBe("ft");
  });
});
