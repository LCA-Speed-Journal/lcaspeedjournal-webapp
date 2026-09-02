import { describe, expect, it } from "vitest";
import {
  MPH_PER_10YD_PER_SECOND,
  fortyYardLiveReadout,
  isFortyYardComponent,
  isFortyYardMphPrimary,
  mphFromYardSplit,
  showFortyYardMphSecondary,
  yardsInFortyComponent,
} from "./forty-yd";

describe("yardsInFortyComponent", () => {
  it("reads the distance from the label", () => {
    expect(yardsInFortyComponent("0-10yd")).toBe(10);
    expect(yardsInFortyComponent("20-40yd")).toBe(20);
    expect(yardsInFortyComponent("0-5yd")).toBe(5);
    expect(yardsInFortyComponent("0-40yd")).toBe(40);
    expect(yardsInFortyComponent("0-10m")).toBeNull();
    expect(yardsInFortyComponent(null)).toBeNull();
  });
});

describe("mphFromYardSplit", () => {
  it("matches 20.45 / 10yd time and 40.9 / 20yd time", () => {
    expect(mphFromYardSplit(1, 10)).toBeCloseTo(MPH_PER_10YD_PER_SECOND, 5);
    expect(mphFromYardSplit(1.8, 20)).toBeCloseTo(40.9 / 1.8, 5);
    expect(mphFromYardSplit(0, 10)).toBeNull();
  });
});

describe("live 20-40yd mph primary", () => {
  it("is only the 20-40yd fly on 40yd_Dash", () => {
    expect(isFortyYardMphPrimary("40yd_Dash", "20-40yd")).toBe(true);
    expect(isFortyYardMphPrimary("40yd_Dash", "10-20yd")).toBe(false);
    expect(isFortyYardMphPrimary("40yd_Dash", "0-40yd")).toBe(false);
    expect(isFortyYardMphPrimary("40m_Sprint", "20-40m")).toBe(false);
  });

  it("shows mph on short/split 40yd marks but not the full dash", () => {
    expect(showFortyYardMphSecondary("40yd_Dash", "0-10yd")).toBe(true);
    expect(showFortyYardMphSecondary("40yd_Dash", "10-20yd")).toBe(true);
    expect(showFortyYardMphSecondary("40yd_Dash", "0-40yd")).toBe(false);
    expect(isFortyYardComponent("0-10yd")).toBe(true);
    expect(isFortyYardComponent("0-10m")).toBe(false);
  });

  it("ranks 20-40yd as mph with time underneath", () => {
    const fly = fortyYardLiveReadout("40yd_Dash", "20-40yd", 1.8);
    expect(fly?.primaryUnits).toBe("mph");
    expect(fly?.primaryValue).toBeCloseTo(40.9 / 1.8, 5);
    expect(fly?.secondaryValue).toBe(1.8);
    expect(fly?.secondaryUnits).toBe("s");

    const ten = fortyYardLiveReadout("40yd_Dash", "0-10yd", 1.72);
    expect(ten?.primaryUnits).toBe("s");
    expect(ten?.secondaryUnits).toBe("mph");

    expect(fortyYardLiveReadout("40yd_Dash", "0-40yd", 4.9)).toBeNull();
  });
});

describe("live 10-20yd mph on 20yd_Dash", () => {
  it("is only the 10-20yd fly on 20yd_Dash", () => {
    expect(isFortyYardMphPrimary("20yd_Dash", "10-20yd")).toBe(true);
    expect(isFortyYardMphPrimary("20yd_Dash", "5-10yd")).toBe(false);
    expect(isFortyYardMphPrimary("20yd_Dash", "0-20yd")).toBe(false);
    expect(isFortyYardMphPrimary("40yd_Dash", "10-20yd")).toBe(false);
  });

  it("shows mph on short 20yd splits but not the full dash", () => {
    expect(showFortyYardMphSecondary("20yd_Dash", "0-5yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "5-10yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "0-10yd")).toBe(true);
    expect(showFortyYardMphSecondary("20yd_Dash", "0-20yd")).toBe(false);
  });

  it("ranks 10-20yd as mph with time underneath", () => {
    const fly = fortyYardLiveReadout("20yd_Dash", "10-20yd", 1.0);
    expect(fly?.primaryUnits).toBe("mph");
    expect(fly?.primaryValue).toBeCloseTo(20.45, 5);
    expect(fly?.secondaryValue).toBe(1.0);
    expect(fly?.secondaryUnits).toBe("s");

    const five = fortyYardLiveReadout("20yd_Dash", "0-5yd", 1.05);
    expect(five?.primaryUnits).toBe("s");
    expect(five?.secondaryUnits).toBe("mph");

    expect(fortyYardLiveReadout("20yd_Dash", "0-20yd", 3.05)).toBeNull();
  });
});
