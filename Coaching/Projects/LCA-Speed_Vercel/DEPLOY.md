# Deploy to GitHub & Vercel

## 1. Push to GitHub

**Note:** LCA-Speed_Vercel may be inside a parent repo (e.g. Starter-Vault). Run commands from the git root.

```bash
# From Starter-Vault root (parent repo):
cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault"
git add Coaching/Projects/LCA-Speed_Vercel/

# Or from LCA-Speed_Vercel if it has its own .git:
cd "c:\Users\rossp\OneDrive\Documents\Obsidian\Starter-Vault\Coaching\Projects\LCA-Speed_Vercel"
git add .

# Check what will be committed
git status

# Commit
git commit -m "Add data entry: session setup, athletes, entries with parsing/conversions"

# Push to main
git push origin main
```

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

## 5. Deploy

- If connected to GitHub: pushing to `main` triggers a deploy automatically
- Or in Vercel: **Deployments → Redeploy** to manually trigger

## 6. Smoke test

1. Visit your Vercel URL
2. Log in with coach PIN at `/login`
3. Create a session, add an athlete, add an entry
4. Confirm no errors; check data in Vercel Postgres if needed
