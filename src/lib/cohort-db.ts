import { sql } from "@/lib/db";
import {
  COHORT_CONFIG_ID,
  DEFAULT_CAPACITY,
  DEFAULT_TITLE,
  deriveCohort,
  type CohortSignup,
  type DerivedCohort,
} from "@/lib/cohort";

export async function ensureCohortConfig(): Promise<{ capacity: number; title: string }> {
  await sql`
    INSERT INTO cohort_config (id, capacity, title)
    VALUES (${COHORT_CONFIG_ID}, ${DEFAULT_CAPACITY}, ${DEFAULT_TITLE})
    ON CONFLICT (id) DO NOTHING
  `;
  const { rows } = await sql`
    SELECT capacity, title
    FROM cohort_config
    WHERE id = ${COHORT_CONFIG_ID}
    LIMIT 1
  `;
  const row = rows[0] as { capacity: number; title: string } | undefined;
  return {
    capacity: Number(row?.capacity ?? DEFAULT_CAPACITY),
    title: String(row?.title ?? DEFAULT_TITLE),
  };
}

type CohortSignupRow = {
  id: unknown;
  display_name: string | null;
  grade: string | null;
  email: string | null;
  created_at: unknown;
};

function serializeCreatedAt(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function listCohortSignups(): Promise<CohortSignup[]> {
  const { rows } = await sql`
    SELECT id, display_name, grade, email, created_at
    FROM cohort_signups
    ORDER BY created_at ASC
  `;
  return (rows as CohortSignupRow[]).map((r) => ({
    id: String(r.id),
    display_name: r.display_name ?? null,
    grade: r.grade ?? null,
    email: r.email ?? null,
    created_at: serializeCreatedAt(r.created_at),
  }));
}

export async function loadDerivedCohort(): Promise<DerivedCohort> {
  const [config, signups] = await Promise.all([
    ensureCohortConfig(),
    listCohortSignups(),
  ]);
  return deriveCohort(signups, config.capacity, config.title);
}
