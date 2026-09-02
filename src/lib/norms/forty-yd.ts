import { FORTY_YD_COMPONENTS, FORTY_YD_DASH, TWENTY_YD_DASH } from "./editor-metrics";

/** 10 yards in 1.00s → 20.45 mph (coach stick). */
export const MPH_PER_10YD_PER_SECOND = 20.45;

export function isFortyYardComponent(
  value: string | null | undefined
): value is (typeof FORTY_YD_COMPONENTS)[number] {
  return (
    typeof value === "string" &&
    (FORTY_YD_COMPONENTS as readonly string[]).includes(value)
  );
}

/** Distance covered by a 40yd component label (`20-40yd` → 20). */
export function yardsInFortyComponent(component: string | null | undefined): number | null {
  if (!component) return null;
  const match = component.trim().match(/^(\d+)-(\d+)yd$/);
  if (!match) return null;
  const yards = Number(match[2]) - Number(match[1]);
  return yards > 0 ? yards : null;
}

export function mphFromYardSplit(timeS: number, yards: number): number | null {
  if (!Number.isFinite(timeS) || timeS <= 0) return null;
  if (!Number.isFinite(yards) || yards <= 0) return null;
  return (MPH_PER_10YD_PER_SECOND * yards) / 10 / timeS;
}

/** Live 20-40yd board ranks/displays mph; other 40yd marks stay seconds-primary. */
export function isFortyYardMphPrimary(
  metricKey: string,
  component: string | null | undefined
): boolean {
  if (metricKey === FORTY_YD_DASH) return component === "20-40yd";
  if (metricKey === TWENTY_YD_DASH) return component === "10-20yd";
  return false;
}

/** Show mph as a secondary readout on 40yd splits (not the full 0-40yd dash). */
export function showFortyYardMphSecondary(
  metricKey: string,
  component: string | null | undefined
): boolean {
  if (metricKey === FORTY_YD_DASH) {
    if (component === "0-40yd") return false;
    return yardsInFortyComponent(component) != null;
  }
  if (metricKey === TWENTY_YD_DASH) {
    if (component === "0-20yd") return false;
    return yardsInFortyComponent(component) != null;
  }
  return false;
}

export type FortyYardLiveReadout = {
  primaryValue: number;
  primaryUnits: string;
  secondaryValue: number;
  secondaryUnits: string;
};

/** Live-board display: 20-40yd is mph-primary; other short splits show mph under time. */
export function fortyYardLiveReadout(
  metricKey: string,
  component: string | null | undefined,
  timeS: number
): FortyYardLiveReadout | null {
  const yards = yardsInFortyComponent(component);
  const mph = yards != null ? mphFromYardSplit(timeS, yards) : null;
  if (mph == null) return null;
  if (isFortyYardMphPrimary(metricKey, component)) {
    return {
      primaryValue: mph,
      primaryUnits: "mph",
      secondaryValue: timeS,
      secondaryUnits: "s",
    };
  }
  if (showFortyYardMphSecondary(metricKey, component)) {
    return {
      primaryValue: timeS,
      primaryUnits: "s",
      secondaryValue: mph,
      secondaryUnits: "mph",
    };
  }
  return null;
}
