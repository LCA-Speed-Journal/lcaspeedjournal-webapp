import type { HugoGroup } from "@/lib/weight-room/constants";
import type { StrengthPattern } from "./exercises";
import { seedPatternsFromAnchors } from "./series";

export type BaselineOrigin = "anchor" | "seed" | "edit";

export type BaselineWrite = {
  pattern: StrengthPattern;
  valueLb: number;
  origin: "anchor" | "seed";
};

export type BaselineRow = {
  athlete_id: string;
  pattern: StrengthPattern;
  value_lb: number;
  origin: BaselineOrigin;
};

const SEED_PATTERNS = ["hinge", "single_leg", "pull"] as const;

const PATTERNS = new Set<string>([
  "squat",
  "hinge",
  "single_leg",
  "press",
  "pull",
  "power",
]);

const ORIGINS = new Set<string>(["anchor", "seed", "edit"]);

/**
 * Squat, press, and power always update from the anchors.
 * Hinge, single-leg, and pull are written only when that pattern is missing,
 * so a later squat or bench change does not move an existing seed.
 */
export function baselinesToWrite(input: {
  anchors: { squat: number; bench: number; power: number };
  existingPatterns: readonly string[];
}): BaselineWrite[] {
  const seeded = seedPatternsFromAnchors(input.anchors);
  const existing = new Set(input.existingPatterns);
  const writes: BaselineWrite[] = [
    { pattern: "squat", valueLb: seeded.squat, origin: "anchor" },
    { pattern: "press", valueLb: seeded.press, origin: "anchor" },
    { pattern: "power", valueLb: seeded.power, origin: "anchor" },
  ];

  for (const pattern of SEED_PATTERNS) {
    if (existing.has(pattern)) continue;
    writes.push({ pattern, valueLb: seeded[pattern], origin: "seed" });
  }

  return writes;
}

function isPattern(value: unknown): value is StrengthPattern {
  return typeof value === "string" && PATTERNS.has(value);
}

function isOrigin(value: unknown): value is BaselineOrigin {
  return typeof value === "string" && ORIGINS.has(value);
}

function mapRows(rows: readonly Record<string, unknown>[]): BaselineRow[] {
  const out: BaselineRow[] = [];
  for (const row of rows) {
    if (!isPattern(row.pattern) || !isOrigin(row.origin)) continue;
    const valueLb =
      typeof row.value_lb === "number" ? row.value_lb : Number(row.value_lb);
    if (!Number.isFinite(valueLb)) continue;
    out.push({
      athlete_id: String(row.athlete_id),
      pattern: row.pattern,
      value_lb: valueLb,
      origin: row.origin,
    });
  }
  return out;
}

/** Open Postgres only when a row is read or written, so the pure helper stays free of it. */
async function db() {
  const { sql } = await import("@/lib/db");
  return sql;
}

async function existingPatterns(athleteId: string): Promise<string[]> {
  const sql = await db();
  const { rows } = await sql`
    SELECT pattern
    FROM athlete_strength_baselines
    WHERE athlete_id = ${athleteId}::uuid
  `;
  return (rows as Record<string, unknown>[]).map((row) => String(row.pattern));
}

export async function listBaselines(
  query: { athleteId: string } | { hugoGroup: HugoGroup }
): Promise<BaselineRow[]> {
  const sql = await db();
  if ("athleteId" in query) {
    const { rows } = await sql`
      SELECT athlete_id::text AS athlete_id, pattern, value_lb, origin
      FROM athlete_strength_baselines
      WHERE athlete_id = ${query.athleteId}::uuid
      ORDER BY pattern
    `;
    return mapRows(rows as Record<string, unknown>[]);
  }

  const { rows } = await sql`
    SELECT
      b.athlete_id::text AS athlete_id,
      b.pattern,
      b.value_lb,
      b.origin
    FROM athlete_hugo_memberships m
    JOIN athletes a ON a.id = m.athlete_id
    JOIN athlete_strength_baselines b ON b.athlete_id = a.id
    WHERE m.hugo_group = ${query.hugoGroup} AND a.active = true
    ORDER BY b.athlete_id, b.pattern
  `;
  return mapRows(rows as Record<string, unknown>[]);
}

async function upsertAnchor(
  athleteId: string,
  write: BaselineWrite
): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO athlete_strength_baselines (athlete_id, pattern, value_lb, origin)
    VALUES (${athleteId}::uuid, ${write.pattern}, ${write.valueLb}, ${write.origin})
    ON CONFLICT (athlete_id, pattern) DO UPDATE
    SET value_lb = EXCLUDED.value_lb,
        origin = EXCLUDED.origin,
        updated_at = NOW()
  `;
}

async function insertSeed(athleteId: string, write: BaselineWrite): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO athlete_strength_baselines (athlete_id, pattern, value_lb, origin)
    VALUES (${athleteId}::uuid, ${write.pattern}, ${write.valueLb}, ${write.origin})
    ON CONFLICT (athlete_id, pattern) DO NOTHING
  `;
}

export async function saveAnchorBaselines(input: {
  athleteId: string;
  squat: number;
  bench: number;
  power: number;
}): Promise<BaselineRow[]> {
  const existing = await existingPatterns(input.athleteId);
  const writes = baselinesToWrite({
    anchors: {
      squat: input.squat,
      bench: input.bench,
      power: input.power,
    },
    existingPatterns: existing,
  });

  await Promise.all(
    writes.map((write) =>
      write.origin === "anchor"
        ? upsertAnchor(input.athleteId, write)
        : insertSeed(input.athleteId, write)
    )
  );

  return listBaselines({ athleteId: input.athleteId });
}

export async function editBaseline(input: {
  athleteId: string;
  pattern: StrengthPattern;
  valueLb: number;
}): Promise<BaselineRow[]> {
  const sql = await db();
  await sql`
    INSERT INTO athlete_strength_baselines (athlete_id, pattern, value_lb, origin)
    VALUES (${input.athleteId}::uuid, ${input.pattern}, ${input.valueLb}, 'edit')
    ON CONFLICT (athlete_id, pattern) DO UPDATE
    SET value_lb = EXCLUDED.value_lb,
        origin = EXCLUDED.origin,
        updated_at = NOW()
  `;
  return listBaselines({ athleteId: input.athleteId });
}
