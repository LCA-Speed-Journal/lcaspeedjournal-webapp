import type { F2fQuality } from "./types";

export type F2fThemePrimary = F2fQuality | "balanced";

export type F2fThemeAthlete = {
  id: string;
  first_name: string;
  last_name: string;
  sport: string | null;
  gender: string | null;
  eligible_for_labels: boolean;
  primary: F2fThemePrimary | null;
  reference_40: number | null;
};

export type F2fThemeMix = {
  explosion: number;
  force: number;
  form: number;
  balanced: number;
};

export type F2fThemeSummary = {
  sport: string | null;
  gender: string | null;
  eligible_count: number;
  mix: F2fThemeMix;
  top3_mix: F2fThemeMix;
  top5_mix: F2fThemeMix;
  rest_mix: F2fThemeMix;
  generated_note: string;
  note: string;
};

export type F2fThemes = {
  session: F2fThemeSummary;
  groups: F2fThemeSummary[];
};

export const SESSION_NOTE_KEY = "session";

const PRIMARY_ORDER: F2fThemePrimary[] = [
  "force",
  "explosion",
  "form",
  "balanced",
];

const emptyMix = (): F2fThemeMix => ({
  explosion: 0,
  force: 0,
  form: 0,
  balanced: 0,
});

export function themeGroupKey(
  sport: string | null | undefined,
  gender: string | null | undefined
): string {
  return `${sport ?? ""}|${gender ?? ""}`;
}

function countMix(athletes: F2fThemeAthlete[]): F2fThemeMix {
  const mix = emptyMix();
  for (const athlete of athletes) {
    if (athlete.primary && athlete.primary in mix) {
      mix[athlete.primary] += 1;
    }
  }
  return mix;
}

function majorityPrimary(mix: F2fThemeMix): F2fThemePrimary | null {
  let best: F2fThemePrimary | null = null;
  let bestCount = 0;
  for (const key of PRIMARY_ORDER) {
    const count = mix[key];
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function displayPrimary(primary: F2fThemePrimary): string {
  return primary.charAt(0).toUpperCase() + primary.slice(1);
}

const MIX_ORDER: F2fThemePrimary[] = ["force", "explosion", "form", "balanced"];

export function formatMixCounts(mix: F2fThemeMix): string {
  return MIX_ORDER.filter((key) => mix[key] > 0)
    .map((key) => `${displayPrimary(key)} ${mix[key]}`)
    .join(" · ");
}

export function themeMixLines(
  theme: F2fThemeSummary
): { label: string; text: string }[] {
  const rows: { label: string; mix: F2fThemeMix }[] = [
    { label: "Mix", mix: theme.mix },
    { label: "Top 3", mix: theme.top3_mix },
    { label: "Top 5", mix: theme.top5_mix },
    { label: "Rest", mix: theme.rest_mix },
  ];
  const lines: { label: string; text: string }[] = [];
  for (const row of rows) {
    const text = formatMixCounts(row.mix);
    if (!text) continue;
    lines.push({ label: row.label, text });
  }
  return lines;
}

function rosterClause(
  roster: F2fThemePrimary,
  mix: F2fThemeMix,
  eligibleCount: number
): string {
  const n = mix[roster];
  if (roster === "balanced") {
    return `Roster is Balanced (${n}/${eligibleCount}).`;
  }
  return `Roster is ${displayPrimary(roster)}-deficient (${n}/${eligibleCount}).`;
}

function generateNote(
  mix: F2fThemeMix,
  top5Mix: F2fThemeMix,
  eligibleCount: number
): string {
  const roster = majorityPrimary(mix);
  if (!roster || eligibleCount === 0) {
    return "No Force-to-Form labels yet.";
  }
  const rosterText = rosterClause(roster, mix, eligibleCount);
  if (eligibleCount <= 5) return rosterText;
  const top5 = majorityPrimary(top5Mix);
  if (!top5) return rosterText;
  if (top5 === "balanced") return `${rosterText} Top 5 are balanced.`;
  if (top5 === roster) return rosterText;
  return `${rosterText} Top 5 are ${displayPrimary(top5)}-deficient.`;
}

function rankByForty(athletes: F2fThemeAthlete[]): F2fThemeAthlete[] {
  return athletes.toSorted((a, b) => {
    const aTime = a.reference_40 ?? Number.POSITIVE_INFINITY;
    const bTime = b.reference_40 ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
}

function resolveNote(
  generatedNote: string,
  override: string | undefined
): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed : generatedNote;
}

function summarizeBucket(
  athletes: F2fThemeAthlete[],
  sport: string | null,
  gender: string | null,
  override: string | undefined
): F2fThemeSummary {
  const ranked = rankByForty(athletes);
  const mix = countMix(ranked);
  const top3Mix = countMix(ranked.slice(0, 3));
  const top5Mix = countMix(ranked.slice(0, 5));
  const restMix = countMix(ranked.slice(5));
  const generated_note = generateNote(mix, top5Mix, ranked.length);
  return {
    sport,
    gender,
    eligible_count: ranked.length,
    mix,
    top3_mix: top3Mix,
    top5_mix: top5Mix,
    rest_mix: restMix,
    generated_note,
    note: resolveNote(generated_note, override),
  };
}

function compareGroups(a: F2fThemeSummary, b: F2fThemeSummary): number {
  if (a.sport == null && b.sport != null) return 1;
  if (a.sport != null && b.sport == null) return -1;
  const sportCmp = (a.sport ?? "").localeCompare(b.sport ?? "");
  if (sportCmp !== 0) return sportCmp;
  return (a.gender ?? "").localeCompare(b.gender ?? "");
}

export function buildF2fThemes(
  athletes: F2fThemeAthlete[],
  noteOverrides: Record<string, string> = {}
): F2fThemes {
  const eligible = athletes.filter((athlete) => athlete.eligible_for_labels);
  const buckets = new Map<string, F2fThemeAthlete[]>();

  for (const athlete of eligible) {
    const key = themeGroupKey(athlete.sport, athlete.gender);
    const list = buckets.get(key);
    if (list) list.push(athlete);
    else buckets.set(key, [athlete]);
  }

  const groups = [...buckets.entries()]
    .map(([key, members]) =>
      summarizeBucket(
        members,
        members[0]?.sport ?? null,
        members[0]?.gender ?? null,
        noteOverrides[key]
      )
    )
    .toSorted(compareGroups);

  return {
    session: summarizeBucket(
      eligible,
      null,
      null,
      noteOverrides[SESSION_NOTE_KEY]
    ),
    groups,
  };
}
