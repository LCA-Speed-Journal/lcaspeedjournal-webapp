# Scripts Runbook

## Normative data

Run `scripts/migrate-normative-data.sql` against the app Postgres the same way as other SQL files: paste the file into the Vercel Postgres dashboard query editor, or run `psql $POSTGRES_URL -f scripts/migrate-normative-data.sql` locally. It is safe to re-run. It widens Hugo group CHECKs for football, adds primary-membership / weight-room dual-write columns, creates the `norm_*` tables, and seeds population names plus sport defaults only (no threshold numbers). There is no npm script for this file.

## Canonical cumulative backfill

This migration rewrites existing `entries` rows so 0-start cumulative marks are
stored under canonical metric keys (for example, `20m_Accel` + `0-10m` becomes
`10m_Accel`).

### Prerequisites

- Backup your database (or run on staging first).
- Ensure `POSTGRES_URL` is set (in environment or `.env.local`).

### Commands

- Dry run (recommended first):
  - `npm run migrate:canonical -- --dry-run`
- Apply migration:
  - `npm run migrate:canonical`

### What it updates

- Scans rows where `component` matches `0-<N>m`.
- Resolves canonical metric key using `src/lib/canonical-cumulative.ts`.
- Updates:
  - `metric_key`
  - `component`
  - `interval_index = NULL`

### Verify after running

- Check summary counts in terminal output.
- Spot-check:
  - `/api/athletes/[id]/prs`
  - `/api/progression`
  - `/api/leaderboard/session-metrics`
  - leaderboard page metrics list
