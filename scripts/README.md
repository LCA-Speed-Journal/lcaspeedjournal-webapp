# Scripts Runbook

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
