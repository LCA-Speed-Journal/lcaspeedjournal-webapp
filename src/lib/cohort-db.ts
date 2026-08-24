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

export async function listCohortSignups(): Promise<CohortSignup[]> {
  const { rows } = await sql`
    SELECT id, display_name, grade, email, created_at
    FROM cohort_signups
    ORDER BY created_at ASC
  `;
  return (rows as CohortSignup[]).map((r) => ({
    id: String(r.id),
    display_name: r.display_name ?? null,
    grade: r.grade ?? null,
    email: r.email ?? null,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  }));
}

export async function loadDerivedCohort(): Promise<DerivedCohort> {
  const [config, signups] = await Promise.all([
    ensureCohortConfig(),
    listCohortSignups(),
  ]);
  return deriveCohort(signups, config.capacity, config.title);
}
