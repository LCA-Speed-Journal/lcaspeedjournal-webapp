export const MEET_COLUMN_ORDER = [
  "Vertical Jump",
  "10-5_RSI",
  "DRI",
  "Standing-Broad",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "10x10m_best",
  "10x10m_mean",
  "10x10m_decrement",
  "OH-MB_Throw",
  "Bench-Press",
  "Hex-Deadlift",
] as const;

const SPRINT_COLUMN_KEYS = ["20yd_Dash", "40yd_Dash", "MaxVelocity"] as const;

export type MetricTint = "power" | "speed" | "repeat" | "throw" | "strength";

const TINTS: Record<string, MetricTint> = {
  "Vertical Jump": "power",
  "Standing-Broad": "power",
  "10-5_RSI": "speed",
  DRI: "speed",
  "20yd_Dash": "speed",
  "40yd_Dash": "speed",
  MaxVelocity: "speed",
  "10x10m_best": "repeat",
  "10x10m_mean": "repeat",
  "10x10m_decrement": "repeat",
  "OH-MB_Throw": "throw",
  "Bench-Press": "strength",
  "Hex-Deadlift": "strength",
};

export function metricTint(key: string): MetricTint | null {
  return TINTS[key] ?? null;
}

const HEADER_TINT_CLASS: Record<MetricTint, string> = {
  power: "bg-purple-500/15",
  speed: "bg-blue-500/15",
  repeat: "bg-green-500/15",
  throw: "bg-orange-500/15",
  strength: "bg-red-500/15",
};

export function headerTintClass(key: string): string {
  const tint = metricTint(key);
  return tint == null ? "" : HEADER_TINT_CLASS[tint];
}

/** Meet grid. Sprint columns stay when a 40 was logged. The raw 10x10 series key never shows. */
export function meetColumnKeys(present: Set<string>, expandSprint: boolean): string[] {
  const sprint = new Set<string>(SPRINT_COLUMN_KEYS);
  return MEET_COLUMN_ORDER.filter((key) => {
    if (expandSprint && sprint.has(key)) return true;
    return present.has(key);
  });
}
