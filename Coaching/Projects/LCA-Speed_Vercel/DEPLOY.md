# Deploy to GitHub & Vercel

## 1. Push to GitHub for production

Pushing to the `main` branch on GitHub triggers Vercel to build and deploy. Here’s how to push for production.

### Repo layout

LCA-Speed_Vercel may live inside a parent repo (e.g. Starter-Vault). Run these commands from the **git root**:

- **Parent repo:** if LCA-Speed_Vercel is a subfolder (e.g. `Starter-Vault`), use the parent repo root
- **Standalone repo:** if LCA-Speed_Vercel has its own `.git`, use the LCA-Speed_Vercel directory

### First-time setup (new GitHub repo)

If the project is not yet on GitHub:

1. On [github.com](https://github.com) → **New repository** → create `lcaspeedjournal-webapp` (or your preferred name)
2. From your project root:

   ```bash
   # If LCA-Speed_Vercel is a subfolder (parent repo root):
   cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault"
   git remote add origin https://github.com/YOUR_USERNAME/lcaspeedjournal-webapp.git

   # Or if LCA-Speed_Vercel is its own repo:
   cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel"
   git remote add origin https://github.com/YOUR_USERNAME/lcaspeedjournal-webapp.git

   git push -u origin main
   ```

### Regular push to production

```bash
# Option A — from Starter-Vault root (LCA-Speed_Vercel is a subfolder):
cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault"
git add Coaching/Projects/LCA-Speed_Vercel/
git status
git commit -m "Your descriptive commit message"
git push origin main

# Option B — from LCA-Speed_Vercel if it is its own repo:
cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel"
git add .
git status
git commit -m "Your descriptive commit message"
git push origin main
```

**Tip:** Use a clear commit message (e.g. "Phase 3 polish: gold theme, background animations, card borders" or "Fix leaderboard parsing error"). Pushing to `main` triggers Vercel deployment.

## 2. Connect to Vercel (if not already)

1. Go to [vercel.com](https://vercel.com) and sign in
2. **Add New Project** → Import `LCA-Speed-Journal/lcaspeedjournal-webapp` from GitHub
3. Vercel will detect Next.js; leave framework preset as-is
4. **If the repo root is not the Next.js app** (e.g. LCA-Speed_Vercel is in a subfolder):  
   Set **Root Directory** to `Coaching/Projects/LCA-Speed_Vercel` in project settings
5. **Before deploying**, add environment variables (step 3)

## 3. Set environment variables in Vercel

In Vercel: **Project → Settings → Environment Variables**

| Variable | Value | Notes |
|----------|-------|-------|
| `POSTGRES_URL` | From Vercel Storage | Project → Storage → Postgres → Connect → use **pooled** URL (must contain `-pooler.`) |
| `NEXTAUTH_SECRET` | Random string | Run `openssl rand -base64 32` or use a password generator |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Your Vercel app URL (e.g. `https://lcaspeedjournal-webapp.vercel.app`) |
| `COACH_PIN` | Your coach PIN | Default: `1234` (change for production) |

## 4. Run database migrations

If the production database doesn't have tables yet:

1. In Vercel: **Storage → Postgres** for your project
2. Open **Query** (or use a local client with the connection string)
3. Run the contents of `scripts/migrate.sql`

If you have an existing database (created before Staff/Alumni support), also run `scripts/migrate-add-athlete-type.sql` to add the `athlete_type` column.

**Manage Athletes dashboard (Event Groups, etc.):** Run `scripts/migrate-phase-a-dashboard.sql` to add the `active` column, `event_groups`, `athlete_event_groups`, and other Phase A tables. Without this, "Manage Event Groups" and athlete event-group assignment will show "Event groups table not found."

**Optional (progression performance):** If progression queries feel slow on large data, run `scripts/migrate-progression-index.sql` against your Postgres DB to add `idx_entries_athlete_metric`.

## 4b. Seed 2024 & 2025 historical data (optional)

To populate the leaderboard with real 2024/2025 data from LCA-Speed-Journal:

1. Copy **2024-Data-Transformed.csv** and **2025-Data-Transformed.csv** from  
   `LCA-Speed-Journal/data/historical/` into `scripts/seed-data/` in this repo.  
   Or set `SEED_DATA_DIR` to that folder.
2. Ensure `POSTGRES_URL` is set (e.g. in `.env.local`).
3. From the project root run:
   ```bash
   npm install
   npm run seed
   ```
4. Open the app → **Leaderboard** (pick a session + metric) or **Historical** (date range + metric; optionally pick athlete + metric for progression chart).

The seed script uses the **transformed** CSVs only (metric_key matches `src/lib/metrics.json`). Raw 2024/2025 CSVs are not used.

## 5. Deploy

- If connected to GitHub: pushing to `main` triggers a deploy automatically
- Or in Vercel: **Deployments → Redeploy** to manually trigger

## 6. Smoke test

1. Visit your Vercel URL
2. Confirm **Leaderboard** (pick session + metric) and **Historical** (date range + metric; progression: athlete + metric) load without errors
3. Log in with coach PIN at `/login`; create a session, add an athlete, add an entry
4. Check data in Vercel Postgres if needed
