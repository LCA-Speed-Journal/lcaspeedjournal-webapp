import type { HugoGroup } from "@/lib/weight-room/constants";
import { getMaxVelocityKey } from "@/lib/velocity-metrics";

export const CORE_TEST_KEYS = [
  "40yd_Dash",
  getMaxVelocityKey(),
  "Standing-Broad",
  "Vertical Jump",
  "OH-MB_Throw",
] as const;

export type CoreTestKey = (typeof CORE_TEST_KEYS)[number];

export const EXTRA_TESTS_BY_GROUP: Partial<Record<HugoGroup, readonly string[]>> =
  {
    volleyball: ["10-5_RSI"],
    soccer: ["5-10-5_Agility"],
    womens_soccer: ["5-10-5_Agility"],
  };

export function groupExtraTests(hugoGroup: string): readonly string[] {
  return EXTRA_TESTS_BY_GROUP[hugoGroup as HugoGroup] ?? [];
}

/** Core + group extras + ephemeral added metrics (deduped, order preserved). */
export function displayedTestKeys(
  hugoGroup: string,
  addedMetrics: readonly string[] = []
): string[] {
  const out: string[] = [...CORE_TEST_KEYS];
  const seen = new Set<string>(out);
  for (const key of groupExtraTests(hugoGroup)) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  for (const key of addedMetrics) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export type LiftId = "squat" | "press" | "hinge";

export type LiftPattern = {
  id: LiftId;
  label: string;
  /** Case-insensitive substrings; first match wins among patterns in order. */
  aliases: readonly string[];
};

export const LIFT_PATTERNS: readonly LiftPattern[] = [
  {
    id: "squat",
    label: "Squat",
    aliases: ["goblet squat", "front squat"],
  },
  {
    id: "press",
    label: "Press",
    aliases: [
      "overhead press",
      "ohp",
      "db bench",
      "bb bench",
      "bench press",
      "bench (",
      "bench",
    ],
  },
  {
    id: "hinge",
    label: "Hinge",
    aliases: ["romanian", "rdl", "hinge"],
  },
];

/** Trap-bar and unrelated names return null. */
export function classifyLiftName(name: string): LiftId | null {
  const lower = name.toLowerCase();
  if (/trap[\s-]?bar|hex[\s-]?bar/.test(lower)) return null;
  for (const pattern of LIFT_PATTERNS) {
    for (const alias of pattern.aliases) {
      if (lower.includes(alias)) return pattern.id;
    }
  }
  return null;
}

export type IsoRockId =
  | "iso_lunge"
  | "spring_ankle"
  | "sprinter_bridge"
  | "copenhagen";

export type IsoRockDef = {
  id: IsoRockId;
  label: string;
  aliases: readonly string[];
};

export const ISO_ROCKS: readonly IsoRockDef[] = [
  {
    id: "iso_lunge",
    label: "ISO-Lunge",
    aliases: [
      "iso-lunge",
      "iso lunge",
      "lunge iso",
      "split-squat iso",
      "split squat iso",
    ],
  },
  {
    id: "spring_ankle",
    label: "Spring Ankle",
    aliases: ["spring ankle"],
  },
  {
    id: "sprinter_bridge",
    label: "Sprinter Bridging",
    aliases: ["sprinter bridg", "sprinter bridge"],
  },
  {
    id: "copenhagen",
    label: "Copenhagens",
    aliases: ["copenhagen"],
  },
];

export function matchIsoRock(text: string): IsoRockId | null {
  const lower = text.toLowerCase();
  for (const rock of ISO_ROCKS) {
    for (const alias of rock.aliases) {
      if (lower.includes(alias)) return rock.id;
    }
  }
  return null;
}

export function testSourceFor(
  metricKey: string,
  hugoGroup: string,
  addedMetrics: readonly string[]
): "core" | "group_extra" | "added" {
  if ((CORE_TEST_KEYS as readonly string[]).includes(metricKey)) return "core";
  if (groupExtraTests(hugoGroup).includes(metricKey)) return "group_extra";
  if (addedMetrics.includes(metricKey)) return "added";
  return "added";
}
