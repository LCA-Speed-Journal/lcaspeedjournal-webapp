# Tech Stack - The LCA Speed Journal

*Written for a level between vibe-coder and developer: enough detail to implement, with short “why” notes so you can learn as you go.*

## Core

| Layer | Choice | Version / Notes |
|-------|--------|-----------------|
| Framework | Next.js (App Router) | 14+ — one codebase, API routes and pages together; great Vercel support. |
| Language | TypeScript | Strict mode — catches mistakes early; types help the AI (and you) understand shapes. |
| Hosting | Vercel | Hobby (free) — deploys on git push; no server to manage. |
| Database | Vercel Postgres | Free tier (256 MB, 60s compute/month) — enough for MVP; same dashboard as the app. |
| Auth | NextAuth.js | Credentials provider (coach PIN / email+password) — no paid OAuth needed. |
| Styling | Tailwind CSS | Via create-next-app — utility classes; fast to style without writing CSS files. |

## Setup Commands

Run these from the **project root** (the folder that will contain `package.json`).

```bash
# 1. Scaffold Next.js (use . so it uses current folder)
npx create-next-app@latest . --typescript --eslint --app --src-dir
# If prompted: skip Turbopack for now (fewer surprises). Say yes to src/ for a clear app/ layout.

# 2. Add database, auth, and client data fetching
npm install @vercel/postgres next-auth swr
# Tailwind is already there. Add chart lib later for progression (e.g. Recharts).

# 3. Local dev — run this whenever you're working
npm run dev

# 4. Before deploy or when checking for errors
npm run build
npm run lint
```

**If a command fails:** Check the error message; often it’s a missing env var (e.g. `POSTGRES_URL`) or running from the wrong folder. Paste the exact error and the command you ran when asking for help.

## Environment Variables

These go in `.env.local` (create it in the project root; **do not** commit it to git).

- **`POSTGRES_URL`** — From Vercel: project → Storage → Postgres → “Connect” / env vars. The app uses this to talk to the database.
- **`NEXTAUTH_SECRET`** — Any long random string (e.g. run `openssl rand -base64 32` or use a password generator). Used to sign cookies so sessions can’t be forged.
- **`NEXTAUTH_URL`** — Local: `http://localhost:3000`. Production: your Vercel URL (e.g. `https://your-app.vercel.app`).

## Database (Vercel Postgres)

Tables you’ll create via a migration (one-time SQL or script):

- **athletes** — id (uuid), first_name, last_name, gender, graduating_class, created_at  
- **sessions** — id (uuid), session_date, phase, phase_week, day_categories (json/text), day_metrics (json/text), day_splits (json), day_components (json), session_notes, created_at  
- **entries** — id (uuid), session_id, athlete_id, metric_key, interval_index (or component), value (numeric), display_value (numeric), units, raw_input, created_at  
- **athlete_notes** — id (uuid), athlete_id, note_text, created_by, created_at  

**Always** use parameterized queries (e.g. the Vercel Postgres `sql` template tag with placeholders, never string-concatenate user input into SQL) so user input can’t inject SQL. After tables exist, add an index on `(session_id, metric_key, value)` so leaderboard queries stay fast.

## Metric Registry

- **What it is:** A JSON file that lists every metric (e.g. 30m fly, standing long jump), how to parse input (single value, cumulative splits, paired components), and how to convert units (e.g. m → ft, time → mph).
- **Where it lives:** Copy `config/metrics.json` from `Python Scripts/2026 Coding/LCA-Speed-Journal/` into this repo as `lib/metrics.json` or `data/metrics.json`.
- **Why:** The app uses it to know which metrics to show in the data-entry form, how to turn coach input into `entries` rows, and which conversion formula to apply. Keeping it in sync with the Python app keeps behavior consistent.

## Reference Code (Python)

The Python project is the **source of truth** for “how things work.” When implementing in Next.js, mirror this behavior:

- **Parsing:** `data_intake/parser.py`, `session.py`, `registry.py` — how raw input becomes one or more entry rows.
- **Conversions:** `conversions.py` — velocity_mph, distance_ft_from_cm/m, pass_through.
- **Config:** `config/metrics.json` — metric keys, input_structure, conversion_formula.
- **Leaderboard:** `leaderboard_vis/` — how data is loaded and ordered.
- **Historical / progression:** `detailed_viz/` — filters and time series.
- **Athlete:** `athlete_management/` — roster and notes.

Reimplement in TypeScript in API routes (or a small serverless Python function if you prefer to keep parsing in Python). Either way, use the **same** metric definitions and data shapes so results match the Python app.

## Client Data Fetching (SWR)

- **SWR** for leaderboard, roster, historical, and progression data. Use `useSWR` instead of `useEffect` + `fetch` so requests are deduplicated and cached across components (e.g. data entry + leaderboard both showing roster).
- When adding charts, use `next/dynamic` to lazy-load the chart component (`ssr: false`) so it doesn't bloat the initial bundle—progression charts aren't needed until the user navigates there.

## Optional Later

- Chart library for progression (e.g. Recharts)—lazy-load with `next/dynamic`.
- Export to Google Sheets (post-MVP).
- Connection pooling or caching (e.g. Vercel KV) if read load grows.
