export const HUGO_GROUPS = [
  "soccer",
  "volleyball",
  "xc",
  "football",
  "womens_tennis",
  "womens_soccer",
  "extracurricular",
  "mens_basketball",
  "womens_basketball",
  "nordic_ski",
  "track",
  "baseball",
  "golf",
] as const;

export type HugoGroup = (typeof HUGO_GROUPS)[number];

export type HugoSeason = "fall" | "winter" | "spring" | "year";

export const HUGO_GROUP_META: Record<
  HugoGroup,
  { label: string; season: HugoSeason }
> = {
  soccer: { label: "Soccer", season: "fall" },
  volleyball: { label: "Volleyball", season: "fall" },
  xc: { label: "XC", season: "fall" },
  football: { label: "Football", season: "fall" },
  womens_tennis: { label: "Women's Tennis", season: "fall" },
  womens_soccer: { label: "Women's Soccer", season: "fall" },
  extracurricular: { label: "Extracurricular", season: "year" },
  mens_basketball: { label: "Men's Basketball", season: "winter" },
  womens_basketball: { label: "Women's Basketball", season: "winter" },
  nordic_ski: { label: "Nordic Ski", season: "winter" },
  track: { label: "Track", season: "spring" },
  baseball: { label: "Baseball", season: "spring" },
  golf: { label: "Golf", season: "spring" },
};

export const FALL_IN_SEASON_GROUPS: readonly HugoGroup[] = [
  "soccer",
  "volleyball",
  "xc",
  "football",
  "womens_tennis",
  "womens_soccer",
  "extracurricular",
];

const FEMALE_HUGO_GROUPS: ReadonlySet<HugoGroup> = new Set([
  "volleyball",
  "womens_basketball",
  "womens_tennis",
  "womens_soccer",
]);

/** Default gender when creating an athlete from a sport roster. Mixed sports stay M so the roster dropdown can correct. */
export function defaultGenderForHugoGroup(group: HugoGroup): "M" | "F" {
  return FEMALE_HUGO_GROUPS.has(group) ? "F" : "M";
}

/** Sports shown on the printed identity row. Fall cohort omits winter/spring. */
export function printHeaderGroups(group: HugoGroup): readonly HugoGroup[] {
  const season = HUGO_GROUP_META[group].season;
  if (season === "winter" || season === "spring") {
    return HUGO_GROUPS.filter((g) => HUGO_GROUP_META[g].season === season);
  }
  return FALL_IN_SEASON_GROUPS;
}

export const QR_PREFIX = "lca-wr";
export const STICKER_QR_KIND = "sticker";
export const TEMPLATE_QR_KIND = "template";

export const SCAN_STATUSES = [
  "uploaded",
  "needs_review",
  "unmatched",
  "confirmed",
  "rejected",
] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];

export function isHugoGroup(value: unknown): value is HugoGroup {
  return typeof value === "string" && (HUGO_GROUPS as readonly string[]).includes(value);
}
