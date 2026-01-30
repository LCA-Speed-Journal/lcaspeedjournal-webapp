# Code Patterns - The LCA Speed Journal

*Conventions so the codebase stays consistent and the AI (and you) know where things live.*

## Naming

- **Files:** kebab-case for pages/routes (e.g. `data-entry`, `leaderboard`) — matches URLs. PascalCase for React components (e.g. `LeaderboardCard.tsx`). camelCase for utilities and helpers (e.g. `parseEntry.ts`).
- **API routes:** One file per route: `app/api/entries/route.ts`, `app/api/athletes/route.ts`, etc. Use GET for reads, POST for writes; **protect write routes** by checking the NextAuth session and returning 401 if not logged in.
- **DB columns:** snake_case (athlete_id, session_id, metric_key, created_at) — matches Postgres convention.
- **Types:** PascalCase (Session, Entry, Athlete, AthleteNote). Put types next to the feature that uses them, or in `types/` if shared across the app.

## File Structure (Next.js App Router)

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/           # optional group for login
│   ├── data-entry/
│   ├── leaderboard/
│   ├── historical/
│   ├── athletes/
│   └── api/
│       ├── entries/
│       ├── athletes/
│       ├── leaderboard/
│       ├── leaderboard/historical/
│       ├── progression/
│       └── auth/[...nextauth]/
├── components/           # shared UI
├── lib/
│   ├── db.ts             # Postgres client
│   ├── auth.ts           # NextAuth config
│   ├── metrics.json      # or data/metrics.json
│   ├── parser.ts         # entry parsing (single_interval, cumulative, paired)
│   └── conversions.ts    # velocity_mph, distance_ft_from_cm/m, pass_through
└── types/
```

## API Conventions

- **Read (leaderboard, historical, progression):** Public GET — no login required. Return JSON; filters come from query params (session_id, metric, from, to, phase, group_by). Keeps athletes/spectators able to view without an account.
- **Write (entries, athletes, notes):** Require an authenticated coach session; if no session, return 401. Always use parameterized SQL (never concatenate user input into SQL). Return clear error messages and the right status (4xx for client mistakes, 5xx for server/DB issues).
- **Responses:** Use a consistent shape (e.g. `{ data }` for success, `{ error }` for failure) so the front end can handle them predictably. Keep leaderboard payloads small (e.g. top N per group) so the app stays fast on mobile.

## Error Handling

- In API routes: wrap logic in try/catch; log the full error on the server; return a short, user-friendly message and the right status code to the client.
- On the client: show that message and, where it makes sense, a “Retry” or “Go back” option for network or DB errors.
- Never send internal errors or stack traces to the browser — that’s a security and UX risk.

## Data Entry & Parsing

- **Flow:** One raw input per metric per athlete (or per split/component) → parser turns it into one or more `entries` rows → apply the conversion from the metric registry → store value, display_value, units. Match the Python logic so results are identical.
- **Safety:** Validate numeric inputs and metric keys against the registry before inserting; reject or correct invalid data instead of crashing or storing garbage.

## UI

- **Mobile-first:** Design for phone first (practice), then scale up for desktop. Use touch-friendly tap targets and avoid horizontal scroll on small screens.
- **Phasing:** Phase 1 = functional layout with Tailwind (no fancy theme yet). Phase 2 = apply the PRD look: clean, sleek, cyberpunk (dark theme, neon accents, strong typography).

## Performance Patterns (Vercel React Best Practices)

Reference these when implementing; see `vercel-react-best-practices` skill for full rules.

### API Routes & Server

- **async-parallel:** Use `Promise.all()` for independent operations in API routes (e.g. session + roster + session config when loading data entry). Don’t chain awaits.
- **async-api-routes:** Start promises early, await late. Example: `const sessionPromise = auth()` then `const session = await sessionPromise` before dependent fetches.
- **server-auth-actions:** If using Server Actions for mutations, always verify auth **inside** the action—don’t rely on layout or page guards alone.
- **server-cache-react:** Use `React.cache()` for DB/auth helpers so repeated calls in one request hit cache. Pass primitive args (e.g. `uid: number`) not inline objects.
- **server-parallel-fetching:** For RSC pages, fetch in sibling components (e.g. `Header`, `Sidebar`) so React can fetch in parallel, not waterfalls.

### Client-Side Data Fetching

- **client-swr-dedup:** Use SWR for leaderboard, roster, and historical data. Avoid `useEffect` + `fetch`—SWR deduplicates and caches across components.
- **rendering-usetransition-loading:** Prefer `useTransition` for filter/query changes (e.g. metric/session filter) instead of manual `isLoading` state.

### Bundle & Rendering

- **bundle-dynamic-imports:** Lazy-load chart library (e.g. Recharts) with `next/dynamic` and `ssr: false` so charts don’t bloat the initial bundle.
- **bundle-defer-third-party:** Load analytics/logging after hydration via `next/dynamic` with `ssr: false` if added later.
- **rendering-content-visibility:** For long leaderboard lists, add `content-visibility: auto` and `contain-intrinsic-size` to list items to defer off-screen rendering.
