# Project Brief - The LCA Speed Journal

## Product Vision

The LCA Speed Journal is the home base for LCA Track & Field and Strength & Conditioning. Coaches do all data entry in the app; athletes and spectators get live leaderboards, progression charts, and team context. **Goal:** no more manual spreadsheets or notebooks for core metrics.

## Coding Conventions

- Follow `agent_docs/code_patterns.md` for naming, structure, and API style.
- Use TypeScript strict mode; add types for API and DB shapes so the compiler (and you) catch mistakes early.
- **Auth rule:** Write endpoints (entries, athletes, notes) require a NextAuth session; read endpoints (leaderboard, historical, progression) stay public so anyone can view.
- Keep parsing and conversion logic aligned with the Python reference so behavior stays consistent.

## Quality Gates

- After **every** API or DB change: run the flow once (e.g. create session → add entry → load leaderboard) and confirm it works.
- **Schema changes:** Don’t alter tables without a migration or backup plan; it’s easy to lose data or break the app otherwise.
- A feature is **done** when the full path works end-to-end as in the PRD (e.g. data entry → stored → visible on leaderboard).

## Key Commands

- `npm run dev` — Start dev server (use this whenever you’re coding).
- `npm run build` — Production build (run before deploy or when checking for type/build errors).
- `npm run lint` — Check code style and common issues.

## Learning as You Go

Docs are tuned for a level between vibe-coder and developer. If something is unclear or you get stuck, ask for: (1) a **small, testable step** (e.g. “add one API route that returns X”), or (2) a **one-paragraph explanation** of why we do it this way so you can reuse the pattern later. The AI can also add brief comments in the code (e.g. “why we use server components here”) when that helps.

## Phased Delivery

- **Beta (weeks 1–2):** Data entry + live leaderboard; deploy to Vercel; optional single coach password to unblock testing.
- **v1 (by 3/9):** Athlete management, historical + progression, proper coach auth, UI polish (clean/sleek/cyberpunk).

## Out of Scope for MVP

Reporting, gamification, metric correlation, red-flag system. No in-app AI features. No Google Sheets as primary DB (export to Sheets can be added later).
