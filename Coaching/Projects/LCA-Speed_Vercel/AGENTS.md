# AGENTS.md - Master Plan for The LCA Speed Journal

## Project Overview

**App:** The LCA Speed Journal  
**Goal:** Coaches doing all data entry in the app; live leaderboards, athlete management, and progression views.  
**Stack:** Next.js 14+ (App Router), Vercel, Vercel Postgres, NextAuth.js (credentials), Tailwind CSS  
**Current Phase:** Phase 1 - Foundation  
**User level:** Between vibe-coder and developer — explain steps and “why” in plain language; offer small, testable steps when stuck.

## How I Should Think

1. **Understand Intent First**: Identify what the user actually needs (data entry, leaderboard, athlete profile, etc.).
2. **Ask If Unsure**: If critical info is missing (e.g. metric definition, session shape), ask before proceeding.
3. **Plan Before Coding**: Propose a plan, get approval, then implement. When suggesting options (e.g. parsing in TS vs Python serverless), briefly explain trade-offs in plain language.
4. **Verify After Changes**: Run tests/checks after each change; confirm DB and API before moving on.
5. **Explain Trade-offs**: When recommending, mention alternatives and why we prefer one (e.g. “We do X so that Y; the downside of Z is …”).

## Plan -> Execute -> Verify

1. **Plan:** Outline approach, reference Python logic or Tech Design where relevant, ask for approval.
2. **Execute:** One feature or sub-feature at a time (e.g. session setup, then entry form, then leaderboard).
3. **Verify:** Run dev server, hit API routes, check DB; fix before moving on.

## Context Files

Load only when needed:

- `agent_docs/tech_stack.md` - Tech details, versions, setup
- `agent_docs/code_patterns.md` - Code style, naming, file structure, performance patterns
- `agent_docs/project_brief.md` - Project rules, quality gates, commands
- `agent_docs/product_requirements.md` - Requirements, user stories, success metrics
- `agent_docs/testing.md` - Test strategy and verification loop

Reference (outside repo): `Python Scripts/2026 Coding/LCA-Speed-Journal/` for parsing rules, conversions, metric registry, session model.

## Current State

**Last Updated:** January 30, 2026  
**Working On:** Live leaderboard (next)  
**Recently Completed:** Data entry — entry form (athletes + metrics, mobile-friendly, parsing/conversions, POST /api/entries)  
**Blocked By:** None  

## Roadmap

### Phase 1: Foundation (Weeks 1–2 beta target)

- [x] Initialize Next.js project (TypeScript, App Router, ESLint, `src/`)
- [x] Add Vercel Postgres; run migrations for `athletes`, `sessions`, `entries`, `athlete_notes`
- [x] Configure NextAuth (credentials / coach PIN); protect write APIs
- [x] Port metric registry (`config/metrics.json`) into repo (`src/lib/metrics.json`)
- [x] Local dev: `npm run dev`, one table + one API read/write smoke test

### Phase 2: Core Features

- [x] **Data entry:** Session setup UI (date, phase, phase_week, day_metrics); store in `sessions`
- [x] **Data entry:** Entry form (athletes + metrics, mobile-friendly); parsing (single_interval, cumulative, paired_components) and conversions (velocity_mph, distance_ft_from_cm/m, pass_through); POST to `/api/entries`, persist to `entries`
- [ ] **Live leaderboard:** GET `/api/leaderboard?session_id=...&metric=...&group_by=gender`; UI with filters, rank styling (e.g. gold/silver/bronze), responsive
  - Use SWR for leaderboard data (dedup + cache); use `useTransition` for filter changes
  - Apply `content-visibility: auto` to leaderboard list items for long lists
- [ ] **Athlete management:** CRUD `/api/athletes`, roster UI, link data entry to athlete_id; `athlete_notes` + coach-only notes UI
- [ ] **Historical / progression:** GET `/api/leaderboard/historical`, GET `/api/progression`; historical leaderboard + progression charts (read-only, no login)
  - Lazy-load chart component with `next/dynamic` (ssr: false) so charts don't bloat initial bundle

### Phase 3: Polish

- [ ] Error handling and clear messages (e.g. retry on network failure)
- [ ] UI: clean, sleek, cyberpunk (dark/high-contrast, neon accents, strong typography)
- [ ] Mobile-first responsive; no horizontal scroll on small screens
- [ ] Performance:
  - Index `session_id`, `metric_key`, `value` on `entries`; keep leaderboard payloads small (top N per group)
  - API routes: use `Promise.all()` for independent ops; start promises early, await late (see `code_patterns.md`)
  - Server components: fetch in sibling components to avoid waterfalls

### Phase 4: Launch

- [ ] Deploy to Vercel; env vars (POSTGRES_URL, NEXTAUTH_SECRET, NEXTAUTH_URL)
- [ ] Run DB migrations in production; smoke-test: create session, add entry, open leaderboard
- [ ] Launch checklist: data entry, live leaderboard, historical view, athlete management, auth, responsive, deployed

## What NOT To Do

- Do NOT delete files without confirmation.
- Do NOT modify database schemas without a backup/migration plan.
- Do NOT add features outside current phase (no reporting, gamification, correlation, red-flag in v1).
- Do NOT skip tests for "simple" changes; verify API and DB after edits.
- Do NOT use deprecated libraries; stick to Tech Design stack (Next.js 14+, Vercel Postgres, NextAuth).
- Do NOT expose coach auth or write APIs to unauthenticated users.
