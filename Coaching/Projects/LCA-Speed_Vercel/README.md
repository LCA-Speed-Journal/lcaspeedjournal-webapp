# LCA Speed Journal

Track & field and strength data — live leaderboards, athlete management, progression views.

## Setup

1. **Install dependencies:** `npm install`

2. **Environment:** Copy `.env.example` to `.env.local` and fill in:
   - `POSTGRES_URL` — from Vercel project → Storage → Postgres → Connect
   - `NEXTAUTH_SECRET` — run `openssl rand -base64 32`
   - `NEXTAUTH_URL` — `http://localhost:3000` (local) or your Vercel URL
   - `COACH_PIN` — default `1234` for MVP

3. **Database:** Run `scripts/migrate.sql` against your Vercel Postgres DB (dashboard query editor or psql).

4. **Run dev:** `npm run dev` — open [http://localhost:3000](http://localhost:3000)

## Smoke Test

- **GET** `/api/athletes` — public, returns `[]` if empty
- **POST** `/api/athletes` — requires auth (login at `/login` with coach PIN), body: `{ first_name, last_name, gender, graduating_class }`

## Getting Started

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
