# Test Strategy - The LCA Speed Journal

*MVP relies on manual checks and a short “smoke test” (run the main flow once to confirm nothing is broken). You can add automated tests later.*

## Approach

- **MVP focus:** Manual verification and smoke tests. Automated tests (e.g. Jest/Vitest for API and parser, Playwright for UI) can be added later.
- **Verification loop:** After any change to API, DB, or parsing: run `npm run dev`, trigger the flow (e.g. create session → add entry → load leaderboard), and confirm the data and behavior match what you expect.

## What “Smoke Test” Means

Run the **main path** once from start to finish to make sure nothing is obviously broken:

1. Start dev server (`npm run dev`).
2. Create a session (date, phase, metrics).
3. Add at least one entry (athlete + metric + value).
4. Open the leaderboard and confirm that entry appears with correct rank/value.
5. (Later) Open historical/progression and confirm filters and charts work.

If that path works, the core is in good shape. If something fails, fix it before moving on.

## What to Verify (By Feature)

1. **Data entry:** Session creation persists in DB; form submits without errors; parsing produces the right entry rows (splits, conversions); new values show up in the leaderboard.
2. **Leaderboard:** GET with session_id and metric returns correct order (asc/desc per metric); grouping (e.g. gender) works; response is fast and small.
3. **Athletes:** You can add/edit/delete athletes; data entry links to athlete_id; notes are visible only when logged in as coach.
4. **Historical / progression:** Date and phase filters return the right subsets; progression series is correct per athlete and metric.
5. **Auth:** Unauthenticated requests to write APIs return 401; read APIs (leaderboard, historical) work without login.

## Tools

- **Dev server:** `npm run dev`; use the browser or a tool like curl/Postman to hit API routes.
- **DB:** After inserts/updates, check tables in the Vercel Postgres dashboard (or a local client) to confirm rows look correct.
- **Optional later:** Jest or Vitest for API and parser unit tests; Playwright or Cypress for critical UI flows.

## Pre-Deploy Checklist

- [ ] Env vars set in Vercel (POSTGRES_URL, NEXTAUTH_SECRET, NEXTAUTH_URL).
- [ ] Migrations run against production DB so tables exist.
- [ ] Smoke test: create session, add entry, open leaderboard, view historical.
- [ ] Auth: coach can write; unauthenticated users can read leaderboard/historical.
