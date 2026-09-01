export const ZONE_LABELS = [
  "poor",
  "developmental",
  "efficient",
  "advanced",
  "elite",
  "world-class",
] as const;

export type ZoneLabel = (typeof ZONE_LABELS)[number];

/** Display hex; CSS variables in globals.css should match. */
export const ZONE_COLORS: Record<ZoneLabel, string> = {
  poor: "#dc2626",
  developmental: "#ea580c",
  efficient: "#ca8a04",
  advanced: "#16a34a",
  elite: "#2563eb",
  "world-class": "#7c3aed",
};

export function isZoneLabel(value: unknown): value is ZoneLabel {
  return typeof value === "string" && (ZONE_LABELS as readonly string[]).includes(value);
}

/** Higher = better. poor = 0 … world-class = 5. */
export function zoneRank(label: ZoneLabel): number {
  return ZONE_LABELS.indexOf(label);
}

/** Live board starts recognizing at efficient. Poor/developmental stay on reporting. */
export const LIVE_LEADERBOARD_MIN_LABEL: ZoneLabel = "efficient";

export function isLiveLeaderboardZone(label: unknown): boolean {
  return isZoneLabel(label) && zoneRank(label) >= zoneRank(LIVE_LEADERBOARD_MIN_LABEL);
}
