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

describe("parseEntry agility metrics (single-interval seconds)", () => {
  it("parses 5-0-5_Agility as a single-interval seconds metric", () => {
    const rows = parseEntry("5-0-5_Agility", "2.91");
    expect(rows).toHaveLength(1);
    expect(rows[0].metric_key).toBe("5-0-5_Agility");
    expect(rows[0].component).toBeNull();
    expect(rows[0].value).toBe(2.91);
    expect(rows[0].display_value).toBe(2.91);
    expect(rows[0].units).toBe("s");
  });

  it("parses 5-0-10_Agility as a single-interval seconds metric", () => {
    const rows = parseEntry("5-0-10_Agility", "4.12");
    expect(rows).toHaveLength(1);
    expect(rows[0].metric_key).toBe("5-0-10_Agility");
    expect(rows[0].component).toBeNull();
    expect(rows[0].value).toBe(4.12);
    expect(rows[0].display_value).toBe(4.12);
    expect(rows[0].units).toBe("s");
  });
});

describe("parseEntry flying 20m split metrics", () => {
  it("accepts direct single-interval entry for new 20m fly split keys", () => {
    const split20to40 = parseEntry("20-40m_Split", "1.98");
    const split30to50 = parseEntry("30-50m_Split", "1.95");
    const split40to60 = parseEntry("40-60m_Split", "1.92");

    expect(split20to40).toHaveLength(1);
    expect(split30to50).toHaveLength(1);
    expect(split40to60).toHaveLength(1);

    expect(split20to40[0].metric_key).toBe("20-40m_Split");
    expect(split30to50[0].metric_key).toBe("30-50m_Split");
    expect(split40to60[0].metric_key).toBe("40-60m_Split");
    expect(split20to40[0].component).toBeNull();
    expect(split20to40[0].units).toBe("mph");
  });

  it("derives new 20m fly split windows from cumulative entries when split keys exist", () => {
    const rows20to40 = parseEntry(
      "30m_Accel",
      "2.0|4.0",
      { day_splits: { "30m_Accel": [20, 20] } }
    );
    const rows30to50 = parseEntry(
      "50m_Sprint",
      "3.0|5.0",
      { day_splits: { "50m_Sprint": [30, 20] } }
    );
    const rows40to60 = parseEntry(
      "50m_Sprint",
      "4.0|6.0",
      { day_splits: { "50m_Sprint": [40, 20] } }
    );

    expect(rows20to40.some((r) => r.metric_key === "20-40m_Split")).toBe(true);
    expect(rows30to50.some((r) => r.metric_key === "30-50m_Split")).toBe(true);
    expect(rows40to60.some((r) => r.metric_key === "40-60m_Split")).toBe(true);
  });

  it("keeps existing 10-30m split derivation unchanged", () => {
    const rows = parseEntry("30m_Accel", "1.00|2.00|3.00");
    expect(rows.some((r) => r.metric_key === "10-30m_Split")).toBe(true);
  });

  it("stores segment rows plus overall split rows for split metrics with day_splits override", () => {
    const rows = parseEntry(
      "20-40m_Split",
      "0.95|0.90",
      { day_splits: { "20-40m_Split": [10, 10] } }
    );

    // Parent split metric should include overall row (mph) and component rows (seconds).
    const parentRows = rows.filter((r) => r.metric_key === "20-40m_Split");
    expect(parentRows.some((r) => r.component === null && r.units === "mph")).toBe(true);
    expect(parentRows.some((r) => r.component === "20-30m" && r.units === "s")).toBe(true);
    expect(parentRows.some((r) => r.component === "30-40m" && r.units === "s")).toBe(true);
    expect(parentRows.some((r) => r.component === "20-40m" && r.units === "s")).toBe(true);

    // Segment split metrics should also be emitted for leaderboard querying/ranking.
    expect(rows.some((r) => r.metric_key === "20-30m_Split")).toBe(true);
    expect(rows.some((r) => r.metric_key === "30-40m_Split")).toBe(true);
  });

  it("rejects split-override mismatch for split metrics", () => {
    expect(() =>
      parseEntry("20-40m_Split", "0.95|0.90", { day_splits: { "20-40m_Split": [20] } })
    ).toThrow(/Cannot parse single_interval input/);
  });
});
