# Technical Design: The LCA Speed Journal MVP

---

## 1. Recommended Approach

**Stack: Next.js (App Router) on Vercel + Vercel Postgres (free tier) + NextAuth.js (credentials or simple provider)**

This approach fits your constraints: **free-only**, **simple to build**, **functionality first**, and **learn-as-you-go**. You get a single codebase, one deployment target (Vercel), and no separate backend server to run or pay for.

| Choice | Why |
|--------|-----|
| **Next.js 14+ (App Router)** | First-class Vercel support, server components for fast loads, API routes for data entry and leaderboard reads, easy responsive layout. You can read the file structure and learn one framework. |
| **Vercel Postgres (free tier)** | 256 MB storage, 60s compute/month free — enough for MVP (athletes, sessions, entries, notes). Same dashboard as the app; no separate DB host. If you outgrow it, migration path is clear. |
| **NextAuth.js** | Free, open-source. Use **credentials** (e.g. coach email + password or a shared coach PIN) so only coaches can hit data-entry APIs. No paid auth provider required. |
| **No Google Sheets in MVP** | Sheets was great for the Streamlit prototype. For production, a real DB gives you faster reads (live leaderboard), simpler queries (historical filters), and no Sheets API rate limits. Plan to add a “Export to Sheets” action later for future expansion into other analyses. |

**Reference material:** Your existing Python code in `Python Scripts/2026 Coding/LCA-Speed-Journal/` is the source of reference for **parsing rules** (single_interval, cumulative, paired_components), **conversions** (velocity_mph, distance_ft_from_cm/m, pass_through), **metric registry** (config/metrics.json), and **session model** (phase, phase_week, day_metrics, day_splits). The production app will reimplement this logic in TypeScript/JavaScript (or call a small serverless Python layer if you prefer to keep parsing in Python). Reuse the same metric definitions and data shapes so behavior stays consistent.

**Phased delivery:**

- **Weeks 1–2 (beta):** Data entry (session setup + athlete/metric/value) and live leaderboard only. Deploy to Vercel; coaches and a few athletes can test. Auth can be a single shared coach password if that’s fastest.
- **Weeks 3–6 (v1 by 3/9):** Add athlete management (roster, profiles, coach notes), historical leaderboard + progression charts, proper coach auth, and UI polish (clean/sleek/cyberpunk) so the app is ready for season start.

---

## 2. Alternative Options

| Option | Pros | Cons | When to consider |
|--------|------|------|-------------------|
| **Next.js + Turso (SQLite)** | Turso free tier generous; SQLite familiar. | Extra service to sign up for; Vercel Postgres keeps everything in one place. | If you prefer SQLite or hit Vercel Postgres limits. |
| **Next.js + Supabase** | Postgres + built-in auth + optional realtime. | Another vendor; free tier may change. | If you want Supabase Auth or Realtime out of the box. |
| **Keep Google Sheets as DB** | No new DB; you know it. | Live leaderboard will feel clunky (polling/limits); harder to query by phase/date; not ideal for “real-time” feel. | Only if you must avoid any DB signup for beta; plan to migrate off for v1. |
| **Remix or SvelteKit on Vercel** | Viable alternatives. | Smaller ecosystem than Next.js; fewer “how do I do X on Vercel” answers. | If you or your AI tooling are already committed to one of them. |

**Recommendation:** Stick with **Next.js + Vercel Postgres + NextAuth** unless you have a strong reason to switch. It keeps the stack simple and minimizes “getting stuck” (lots of docs and examples).

---

## 3. Project Setup

Use this as a checklist; order matters.

1. **Create repo and clone**  
   - New repo (e.g. `lca-speed-journal`) and clone into `Coaching/Projects/LCA-Speed Vercel/` (or your chosen path).

2. **Scaffold Next.js**  
   - `npx create-next-app@latest .` — choose TypeScript, App Router, ESLint, no Turbopack if prompted; use `src/` if you want a clear `src/app` layout.

3. **Install deps**  
   - `@vercel/postgres` (or `@vercel/postgres` + serverless client), `next-auth`, and UI/lib of choice (e.g. `tailwindcss` already in create-next-app).

4. **Vercel**  
   - Sign up at vercel.com, connect the repo, add **Vercel Postgres** from the project dashboard (Storage → Postgres). Copy env vars (e.g. `POSTGRES_URL`) into `.env.local`.

5. **Auth**  
   - Configure NextAuth with a credentials provider (utilizing a coach PIN). Protect `/api/entries`, `/api/athletes` (write), etc., by checking the session in route handlers.

6. **Metric registry**  
   - Port `config/metrics.json` (and any categories) from the Python project into the repo (e.g. `lib/metrics.json` or `data/metrics.json`). Use it in the app for data-entry options and parsing.

7. **Local dev**  
   - `npm run dev`; create one table (e.g. `athletes`) and one API route that reads/writes so you confirm DB and env work.

8. **Reference code**  
   - Keep `Python Scripts/2026 Coding/LCA-Speed-Journal/` open for parser/conversion/session logic; reimplement or adapt in TypeScript for API routes (or a minimal serverless Python function if you prefer).

---

## 4. Feature Implementation

### Feature 1: Data Entry and Processing

- **Session setup (UI):** One screen or drawer: session date, phase (Preseason / Preparation / Competition / Championship), phase_week (1–5), day categories, and **day metrics** (multi-select from metric registry). Optional: day_splits and day_components if you support cumulative/paired in MVP. Store in `sessions` table; return `session_id`.
- **Data entry (UI):** Per session, list athletes (from roster or supporting new athletes day-of for new names) and selected metrics. One input per athlete per metric (or per split/component as in your Python parser). Mobile-friendly: big tap targets, minimal typing (e.g. autocomplete athlete, numeric keypad for values).
- **Parsing:** Reimplement the Python logic in TypeScript (or call Python serverless): for each metric’s `input_structure` (single_interval / cumulative / paired_components), parse the raw string and produce one or more **entry rows** (session_id, athlete_id, metric key, interval/component, value, display_value, units). Use the same conversion formulas (velocity_mph, distance_ft_from_cm/m, pass_through) keyed by `conversion_formula` from the registry.
- **Storage:** POST to `/api/entries` (or batch) with session_id, athlete_id, metric, raw input; server parses, applies conversions, and inserts into `entries` (and any `entry_splits`/components tables if needed). Return success and updated entry count so the client can refresh the leaderboard.
- **Reference:** `data_intake/parser.py`, `conversions.py`, `session.py`, `registry.py`; `config/metrics.json`.

### Feature 2: Live Leaderboard

- **Data:** GET `/api/leaderboard?session_id=...&metric=...&group_by=gender` (or similar). Query `entries` (joined with athletes, sessions) filtered by session and metric, ordered by value (asc/desc per metric), optionally grouped by gender (boys/girls).
- **Real-time feel:** No WebSockets required for MVP. Use SWR to fetch leaderboard data—it deduplicates requests, caches across components, and supports `revalidateOnFocus` or `refreshInterval` for periodic refetch after new entries. Keep the response small (top N per group) so it stays fast.
- **UI:** Single page or section: filters (session, metric, phase, date, group). List or card layout with rank (1–3 styled e.g. gold/silver/bronze), athlete name, value, units. Responsive so it works on a phone at practice.
- **Reference:** `leaderboard_vis/` (data loader, processor, renderer).

### Feature 3: Historical Progression / Leaderboard

- **Data:** GET `/api/leaderboard/historical?from=...&to=...&metric=...&phase=...` and GET `/api/progression?athlete_id=...&metric=...` (or combined). Query `entries` with date/phase filters; for progression, aggregate by athlete and date (e.g. best per day) and return time series.
- **UI:** Historical leaderboard: same as live but with date/phase range picker; read-only. Progression: simple line or bar chart (e.g. Chart.js or a small React chart lib) — value over time per athlete. No login required for these routes (public read).
- **Reference:** `detailed_viz/` (historical_transformer, progression_charts, filters).

### Feature 4: Athlete Management

- **Roster:** Table `athletes`: id, first_name, last_name, gender, graduating_class, created_at. CRUD via `/api/athletes` (write requires coach auth). UI: list with add/edit/delete; link from data entry (e.g. dropdown or search).
- **Linking data:** Every `entries` row has `athlete_id`. Data entry form loads roster and stores athlete_id with each entry.
- **Coach notes:** Table `athlete_notes`: id, athlete_id, note_text, created_at, created_by. Private to coaches; only returned when authenticated. UI: per-athlete profile page or slide-out with notes and optional “archetype” tag if you port that from the Python app.
- **Reference:** `athlete_management/` (profiles, storage, grouping).

---

## 5. Design Implementation

- **Phase 1 (beta, weeks 1–2):** Functional only. Use default Tailwind or minimal styling; focus on layout (stacked on mobile, grid on desktop), touch-friendly inputs, and clear hierarchy (e.g. session title, then leaderboard, then entry form). No need for cyberpunk look yet.
- **Phase 2 (weeks 3–6):** Apply PRD direction: **clean, sleek, cyberpunk** — dark or high-contrast theme, strong typography, neon-inspired accents (e.g. borders or highlights), minimal clutter. Reuse one or two accent colors and a single heading/body font.
- **Key screens (from PRD):**  
  1. Data Entry — session setup + athlete/metric/value.  
  2. Live Leaderboard — filters + rank list/cards.  
  3. Historical View — leaderboards + progression charts.  
  4. Athlete Management — roster list + athlete profile (notes).
- **Responsive:** Mobile-first; breakpoints for tablet/desktop so data entry and leaderboard are usable at practice (phone) and at home (desktop). Avoid horizontal scroll on small screens.

---

## 6. Database & Storage

- **Schema (minimal for MVP):**
  - **athletes** — id (uuid), first_name, last_name, gender, graduating_class, created_at.
  - **sessions** — id (uuid), session_date, phase, phase_week, day_categories (json/text), day_metrics (json/text), day_splits (json), day_components (json), session_notes, created_at.
  - **entries** — id (uuid), session_id, athlete_id, metric_key, interval_index (or component), value (numeric), display_value (numeric), units, raw_input, created_at.
  - **athlete_notes** — id (uuid), athlete_id, note_text, created_by, created_at.
- **Hosting:** Vercel Postgres (free tier). Run migrations (e.g. SQL files or a simple migration script) once; use parameterized queries everywhere to avoid SQL injection.
- **Backup:** Export DB periodically (e.g. `pg_dump` or Vercel’s backup if available) to a file in a private folder or repo; optional “Export to Sheets” later for coach peace of mind.

---

## 7. AI Assistance Strategy

- **No in-app AI features** in the MVP (per your choice).
- **For building:** Use Cursor to generate Next.js components, API routes, and parsing/conversion logic. When stuck: paste the exact error or “I want X, currently Y” plus the relevant file; ask for a small, testable step. Refer to the Python reference by path or paste short snippets so the AI can mirror behavior in TypeScript.
- **Learning:** Ask for brief comments in the code (“why we use server components here”) and a one-paragraph summary after each feature so you can reuse patterns in future projects.

---

## 8. Deployment Plan

- **Platform:** Vercel. Connect the repo; Vercel will build and deploy on push (main or your chosen branch).
- **Steps:** (1) Add Vercel Postgres to the project; (2) Set env vars in Vercel dashboard (e.g. `POSTGRES_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`); (3) Deploy; (4) Run DB migrations if not auto-run in build; (5) Smoke-test: create session, add entry, open leaderboard.
- **Backup option:** If you need to move off Vercel later, the app is a standard Next.js app; you can host elsewhere (e.g. Railway, Fly.io) and point to the same Postgres or migrate the DB.

---

## 9. Cost Breakdown

| Item | Cost | Notes |
|------|------|--------|
| Vercel (hobby) | $0 | Enough for MVP traffic. |
| Vercel Postgres (free tier) | $0 | 256 MB, 60s compute/month. |
| NextAuth | $0 | Self-hosted; no paid provider. |
| Domain (optional) | ~$10–15/year | Use Vercel subdomain for free if you prefer. |
| **Total MVP** | **$0** (or domain only) | No subscription required. |

If you later need more DB or compute, Vercel’s paid tiers are predictable; you can re-evaluate then and still keep auth and app logic unchanged.

---

## 10. Performance Implementation (Vercel React Best Practices)

Apply these patterns during implementation (see `agent_docs/code_patterns.md` for details):

| Area | Pattern | Why |
|------|---------|-----|
| **API routes** | `Promise.all()` for independent ops; start promises early, await late | Eliminates waterfalls (2–10× improvement) |
| **Server components** | Fetch in sibling components (e.g. Header, Sidebar) not parent-then-child | React parallelizes fetches |
| **Auth** | Verify auth inside Server Actions and API handlers—don't rely on layout alone | Security: mutations are public endpoints |
| **Client data** | SWR for leaderboard, roster, historical—not `useEffect` + `fetch` | Dedup, cache, revalidation across components |
| **Charts** | `next/dynamic` with `ssr: false` for progression chart component | Keeps initial bundle small |
| **Long lists** | `content-visibility: auto` on leaderboard list items | Defer off-screen rendering |
| **Filter/query changes** | `useTransition` for metric/session filter instead of manual loading state | Cleaner, more resilient loading UX |
| **DB helpers** | `React.cache()` for repeated auth/DB calls within a request | Per-request deduplication |

## 11. Scaling Path

- **~100 users (e.g. 30 active, 70 spectators):** Current stack is fine; optimize leaderboard query (index on session_id, metric_key, value) and keep payloads small.
- **~1,000 users:** Consider connection pooling for Postgres if you see limits; add caching (e.g. in-memory or Vercel KV) for historical leaderboard and progression if reads grow.

---

## 12. Limitations

- **No offline mode:** The app requires network; if practice has bad connectivity, data entry may fail. Mitigation: clear error message and “retry” or “save draft locally” in a later iteration.
- **No built-in realtime:** Leaderboard updates via refetch or short polling, not true push. Acceptable for MVP; you can add Server-Sent Events or a realtime layer later if needed.
- **Coach auth is simple:** Credentials or PIN are fine for a single team; for multiple schools or many coaches, you’d add roles and possibly OAuth later.
- **No reporting/gamification/correlation/red-flag:** Out of scope for v1 per PRD; the design does not block adding these later.

---

## 13. Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | Next.js (App Router) on Vercel + Vercel Postgres + NextAuth (credentials) |
| **Beta (2 weeks)** | Data entry + live leaderboard; deploy on Vercel; optional simple coach password |
| **v1 (6 weeks, by 3/9)** | Athlete management, historical + progression, coach auth, UI polish |
| **Budget** | Free-only; no paid services required for MVP |
| **Reference** | Reuse parsing, conversions, metrics, and session model from `Python Scripts/2026 Coding/LCA-Speed-Journal/` |

---

*Tech Design created: January 2026*  
*Next step: Run `/vibe-agents` to generate AGENTS.md and AI configuration files.*
