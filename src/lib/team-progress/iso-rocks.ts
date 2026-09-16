import { ISO_ROCKS, type IsoRockId } from "./headlines";
import { isoWeekStart } from "./stats";

export type IsoTemplateRow = {
  session_date: string;
  movement_name: string;
  notes: string | null;
  targets: string[] | unknown;
};

export type IsoRockPoint = {
  week_start: string;
  seconds: number;
  n: number;
};

export type IsoRockSeries = {
  rock_id: IsoRockId;
  label: string;
  points: IsoRockPoint[];
};

/**
 * Extract the largest seconds value associated with an alias in free text.
 * Looks for `Ns` shortly after the alias (e.g. `Spring ankle 45s/leg`).
 * When the alias is absent (targets-only), takes the max `Ns` in the blob.
 */
export function extractSecondsNearAlias(
  textOrTargets: string | string[] | null | undefined,
  alias: string
): number | null {
  const parts = Array.isArray(textOrTargets)
    ? textOrTargets.map(String)
    : textOrTargets
      ? [String(textOrTargets)]
      : [];
  if (parts.length === 0) return null;

  const aliasLower = alias.toLowerCase();
  let best: number | null = null;
  let anyAlias = false;

  for (const part of parts) {
    const lower = part.toLowerCase();
    let searchFrom = 0;
    while (true) {
      const idx = lower.indexOf(aliasLower, searchFrom);
      if (idx < 0) break;
      anyAlias = true;
      const after = part.slice(idx + alias.length);
      const window = after.slice(0, 48);
      const near = window.match(/(\d+(?:\.\d+)?)\s*s\b/i);
      if (near) {
        const n = Number(near[1]);
        if (Number.isFinite(n) && (best == null || n > best)) best = n;
      }
      searchFrom = idx + alias.length;
    }
  }

  if (anyAlias) return best;

  // No alias in text — treat as targets-only (movement name already matched).
  for (const part of parts) {
    for (const m of part.matchAll(/(\d+(?:\.\d+)?)\s*s\b/gi)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && (best == null || n > best)) best = n;
    }
  }
  return best;
}

function textMentionsRock(text: string, rockId: IsoRockId): boolean {
  const def = ISO_ROCKS.find((r) => r.id === rockId);
  if (!def) return false;
  const lower = text.toLowerCase();
  return def.aliases.some((a) => lower.includes(a));
}

function secondsForRock(row: IsoTemplateRow, rockId: IsoRockId): number | null {
  const def = ISO_ROCKS.find((r) => r.id === rockId);
  if (!def) return null;

  const nameMatch = textMentionsRock(row.movement_name, rockId);
  const noteMatch = row.notes ? textMentionsRock(row.notes, rockId) : false;
  if (!nameMatch && !noteMatch) return null;

  let best: number | null = null;
  for (const alias of def.aliases) {
    if (nameMatch) {
      const fromName = extractSecondsNearAlias(row.movement_name, alias);
      if (fromName != null && (best == null || fromName > best)) best = fromName;
    }
    if (row.notes && noteMatch) {
      const fromNotes = extractSecondsNearAlias(row.notes, alias);
      if (fromNotes != null && (best == null || fromNotes > best)) best = fromNotes;
    }
    if (nameMatch && Array.isArray(row.targets)) {
      const fromTargets = extractSecondsNearAlias(
        row.targets as string[],
        alias
      );
      if (fromTargets != null && (best == null || fromTargets > best)) {
        best = fromTargets;
      }
    }
  }

  if (nameMatch && best == null && Array.isArray(row.targets)) {
    best = extractSecondsNearAlias(row.targets as string[], def.aliases[0]!);
  }

  return best;
}

export function aggregateIsoRocks(rows: IsoTemplateRow[]): IsoRockSeries[] {
  // rockId\0week → max seconds + template count
  const maxBy = new Map<string, { seconds: number; n: number }>();

  for (const row of rows) {
    const week = isoWeekStart(row.session_date);
    for (const rock of ISO_ROCKS) {
      const seconds = secondsForRock(row, rock.id);
      if (seconds == null) continue;
      const key = `${rock.id}\0${week}`;
      const prev = maxBy.get(key);
      if (!prev) {
        maxBy.set(key, { seconds, n: 1 });
      } else {
        maxBy.set(key, {
          seconds: Math.max(prev.seconds, seconds),
          n: prev.n + 1,
        });
      }
    }
  }

  return ISO_ROCKS.map((rock) => {
    const points: IsoRockPoint[] = [];
    for (const [key, val] of maxBy) {
      if (!key.startsWith(`${rock.id}\0`)) continue;
      const week_start = key.slice(rock.id.length + 1);
      points.push({
        week_start,
        seconds: val.seconds,
        n: val.n,
      });
    }
    points.sort((a, b) => a.week_start.localeCompare(b.week_start));
    return { rock_id: rock.id, label: rock.label, points };
  }).filter((s) => s.points.length > 0);
}
