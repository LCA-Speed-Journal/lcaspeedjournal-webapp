import { ISO_ROCKS, matchIsoRock, type IsoRockId } from "./headlines";
import { median } from "./stats";

export type IsoTemplateRow = {
  session_date: string;
  movement_name: string;
  notes: string | null;
  targets: string[] | unknown;
};

export type IsoRockPoint = {
  /** Session / template date (YYYY-MM-DD), not week start. */
  date: string;
  seconds: number;
  n: number;
};

export type IsoRockSeries = {
  rock_id: IsoRockId;
  label: string;
  total_points: IsoRockPoint[];
  per_set_points: IsoRockPoint[];
  /** @deprecated kept empty; prefer total_points */
  points: IsoRockPoint[];
  prescribed_points: IsoRockPoint[];
  actual_points: IsoRockPoint[];
};

export type IsoLogRow = {
  athlete_id: string;
  session_date: string;
  movement_name: string;
  kind: string | null;
  load: number | null;
  units: string | null;
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

function maxSecondsInText(text: string | null | undefined): number | null {
  if (!text) return null;
  let best: number | null = null;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*s\b/gi)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  return best;
}

function maxSecondsInParts(parts: string[]): number | null {
  let best: number | null = null;
  for (const part of parts) {
    const n = maxSecondsInText(part);
    if (n != null && (best == null || n > best)) best = n;
  }
  return best;
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

  // Name matched but seconds live only in notes/targets without repeating the alias
  // (e.g. movement "Sprinter Bridge", notes "60s hold", targets ["45s"]).
  if (nameMatch) {
    const fromNotesBare = maxSecondsInText(row.notes);
    if (fromNotesBare != null && (best == null || fromNotesBare > best)) {
      best = fromNotesBare;
    }
    if (Array.isArray(row.targets)) {
      const fromTargetsBare = maxSecondsInParts(
        (row.targets as unknown[]).map(String)
      );
      if (fromTargetsBare != null && (best == null || fromTargetsBare > best)) {
        best = fromTargetsBare;
      }
    }
  }

  if (nameMatch && best == null && Array.isArray(row.targets)) {
    best = extractSecondsNearAlias(row.targets as string[], def.aliases[0]!);
  }

  return best;
}

export function aggregateIsoRocks(rows: IsoTemplateRow[]): IsoRockSeries[] {
  // rockId\0date → max seconds + template count
  const maxBy = new Map<string, { seconds: number; n: number }>();

  for (const row of rows) {
    const date = row.session_date;
    for (const rock of ISO_ROCKS) {
      const seconds = secondsForRock(row, rock.id);
      if (seconds == null) continue;
      const key = `${rock.id}\0${date}`;
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
    const prescribed_points: IsoRockPoint[] = [];
    for (const [key, val] of maxBy) {
      if (!key.startsWith(`${rock.id}\0`)) continue;
      const date = key.slice(rock.id.length + 1);
      prescribed_points.push({
        date,
        seconds: val.seconds,
        n: val.n,
      });
    }
    prescribed_points.sort((a, b) => a.date.localeCompare(b.date));
    return {
      rock_id: rock.id,
      label: rock.label,
      total_points: [],
      per_set_points: [],
      points: prescribed_points,
      prescribed_points,
      actual_points: [],
    };
  }).filter((s) => s.prescribed_points.length > 0);
}

function usableHoldSeconds(row: IsoLogRow): number | null {
  const load = row.load;
  if (load == null || !Number.isFinite(load) || load <= 0) return null;
  if (row.kind === "duration") return load;
  if (row.kind === "output" && (row.units === "s" || row.units == null)) {
    return load;
  }
  return null;
}

/**
 * Logged holds → per rock per session date: team median of each athlete's
 * total hold volume and mean per-set duration.
 */
export function aggregateIsoRockActuals(rows: IsoLogRow[]): IsoRockSeries[] {
  const holdsByAthlete = new Map<string, number[]>();

  for (const row of rows) {
    const seconds = usableHoldSeconds(row);
    if (seconds == null) continue;
    const rockId = matchIsoRock(row.movement_name);
    if (!rockId) continue;
    const key = `${rockId}\0${row.session_date}\0${row.athlete_id}`;
    const list = holdsByAthlete.get(key);
    if (list) list.push(seconds);
    else holdsByAthlete.set(key, [seconds]);
  }

  const totalsByDate = new Map<string, number[]>();
  const perSetsByDate = new Map<string, number[]>();
  for (const [key, holds] of holdsByAthlete) {
    const parts = key.split("\0");
    const rockId = parts[0]!;
    const date = parts[1]!;
    const dateKey = `${rockId}\0${date}`;
    const total = holds.reduce((sum, s) => sum + s, 0);
    const perSet = total / holds.length;
    const totals = totalsByDate.get(dateKey);
    if (totals) totals.push(total);
    else totalsByDate.set(dateKey, [total]);
    const perSets = perSetsByDate.get(dateKey);
    if (perSets) perSets.push(perSet);
    else perSetsByDate.set(dateKey, [perSet]);
  }

  return ISO_ROCKS.map((rock) => {
    const total_points: IsoRockPoint[] = [];
    const per_set_points: IsoRockPoint[] = [];
    for (const [key, totals] of totalsByDate) {
      if (!key.startsWith(`${rock.id}\0`)) continue;
      const date = key.slice(rock.id.length + 1);
      const totalMed = median(totals);
      const perSetMed = median(perSetsByDate.get(key) ?? []);
      if (totalMed != null) {
        total_points.push({ date, seconds: totalMed, n: totals.length });
      }
      if (perSetMed != null) {
        per_set_points.push({ date, seconds: perSetMed, n: totals.length });
      }
    }
    total_points.sort((a, b) => a.date.localeCompare(b.date));
    per_set_points.sort((a, b) => a.date.localeCompare(b.date));
    return {
      rock_id: rock.id,
      label: rock.label,
      total_points,
      per_set_points,
      points: [],
      prescribed_points: [],
      actual_points: total_points,
    };
  }).filter((s) => s.total_points.length > 0 || s.per_set_points.length > 0);
}

/** Merge prescribed + actual series so each rock appears once. */
export function combineIsoRockSeries(
  prescribed: IsoRockSeries[],
  actual: IsoRockSeries[]
): IsoRockSeries[] {
  const byId = new Map<IsoRockId, IsoRockSeries>();
  for (const rock of ISO_ROCKS) {
    byId.set(rock.id, {
      rock_id: rock.id,
      label: rock.label,
      total_points: [],
      per_set_points: [],
      points: [],
      prescribed_points: [],
      actual_points: [],
    });
  }
  for (const s of prescribed) {
    const cur = byId.get(s.rock_id);
    if (!cur) continue;
    cur.prescribed_points = s.prescribed_points;
    cur.points = s.prescribed_points;
  }
  for (const s of actual) {
    const cur = byId.get(s.rock_id);
    if (!cur) continue;
    cur.total_points = s.total_points;
    cur.per_set_points = s.per_set_points;
    cur.actual_points = s.actual_points;
  }
  return [...byId.values()].filter(
    (s) =>
      s.prescribed_points.length > 0 ||
      s.total_points.length > 0 ||
      s.per_set_points.length > 0
  );
}
