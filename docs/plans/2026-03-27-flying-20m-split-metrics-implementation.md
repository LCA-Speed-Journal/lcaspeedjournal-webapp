# Flying 20m Split Metrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-class split-based Flying 20m metrics (`20-40m_Split`, `30-50m_Split`, `40-60m_Split`) while preserving direct-entry and derived-generation behavior, and explicitly support data-entry workflows where a 20m fly can be entered as either `(10,10)` segments or a full `(20)` interval via session custom splits.

**Architecture:** Keep existing parser architecture and database schema unchanged. Expand `metrics.json` with new split keys, then lock behavior with parser tests and API/UI smoke validations so downstream routes treat these as normal standalone metrics rather than only cumulative components. For data-entry, use cumulative metric entry + session-level `day_splits` overrides to support both two-segment (`10,10`) and single-interval (`20`) 20m fly capture patterns.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Vercel Postgres.

**Prerequisite:** Run in a dedicated git worktree if repository is dirty—see @brainstorming and @using-git-worktrees.

---

## Reference files to mirror

- Split registry: `src/lib/metrics.json`
- Split emission + parsing: `src/lib/parser.ts`
- Parser coverage: `src/lib/parser.test.ts`
- Session split configuration UI: `src/app/data-entry/SessionForm.tsx`
- Session split edit UI: `src/app/data-entry/session/[id]/EditSessionClient.tsx`
- Entry split mode UI: `src/app/data-entry/EntryForm.tsx`
- Session create/update sanitization: `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`
- Session metric option discovery: `src/app/api/leaderboard/session-metrics/route.ts`
- Leaderboard consumer: `src/app/leaderboard/LeaderboardClient.tsx`
- Historical component filtering helpers: `src/lib/historical-metric-filter.ts`, `src/lib/metric-utils.ts`

---

### Task 1: Add 20m fly split keys in metric registry (TDD start)

**Files:**
- Modify: `src/lib/metrics.json`
- Test: `src/lib/parser.test.ts`

**Step 1: Write failing parser test for new metric keys**

Add assertions that parsing can emit `20-40m_Split`, `30-50m_Split`, and `40-60m_Split` when cumulative distances include those windows. Include expected `velocity_mph` output rows with correct `metric_key`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: FAIL due to unknown/missing split metric definitions.

**Step 3: Add minimal metric definitions**

In `src/lib/metrics.json`, add:
- `20-40m_Split`
- `30-50m_Split`
- `40-60m_Split`

Use the same structure and conventions as existing split metrics (`single_interval`, display name pattern, units `velocity_mph`).

**Step 4: Run parser tests again**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: PASS for newly added expectations.

**Step 5: Commit**

```bash
git add src/lib/metrics.json src/lib/parser.test.ts
git commit -m "feat(metrics): add split-based Flying 20m metric keys"
```

---

### Task 2: Validate manual direct-entry path for new split keys

**Files:**
- Modify: `src/lib/parser.test.ts`
- Reference: `src/lib/parser.ts`

**Step 1: Write failing direct-entry test**

Add tests where each new split key is submitted as direct single-interval input and confirms one entry row is produced with that same `metric_key` and expected parsed display/value handling.

**Step 2: Run direct-entry tests**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: If any parser assumptions are too restrictive, tests fail.

**Step 3: Apply minimal parser change only if needed**

If tests fail, adjust parser logic in `parseSingleInterval`/metric lookup paths minimally to accept the new keys without special-case branching.

**Step 4: Re-run tests**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts
git commit -m "test(parser): cover direct entry for new 20m split metrics"
```

---

### Task 3: Validate derived-generation path from cumulative input

**Files:**
- Modify: `src/lib/parser.test.ts`
- Reference: `src/lib/parser.ts`

**Step 1: Write failing cumulative-derived test cases**

Add cases for cumulative distances that should generate:
- `20-40m_Split`
- `30-50m_Split`
- `40-60m_Split`

Also assert that existing `10-30m_Split` still generates correctly (regression check).

**Step 2: Run parser tests**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: FAIL if interval-window generation misses any new keys.

**Step 3: Implement minimal generation fix (if needed)**

Only if failing, update non-adjacent interval emission logic in `parseCumulative` so windows that already satisfy distance constraints emit when registry keys exist.

**Step 4: Re-run parser tests**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts
git commit -m "fix(parser): derive additional 20m split windows from cumulative input"
```

---

### Task 4: Data-entry split workflow for 20m fly (`10,10` default and `20` accepted)

**Files:**
- Modify: `src/app/data-entry/SessionForm.tsx`
- Modify: `src/app/data-entry/session/[id]/EditSessionClient.tsx`
- Modify: `src/app/data-entry/EntryForm.tsx`
- Modify/Verify: `src/app/api/sessions/route.ts`
- Modify/Verify: `src/app/api/sessions/[id]/route.ts`
- Test: `src/lib/parser.test.ts` (or relevant data-entry tests if present)

**Step 1: Write failing behavior tests/spec checks**

Add/extend tests to assert:
- For the chosen cumulative metric used to derive fly windows, session `day_splits` of `[10,10]` produces two segment inputs and derived `20-40m_Split`.
- Session `day_splits` of `[20]` is accepted and allows single-interval entry for the same fly window workflow.
- `segment` mode entry with two values converts to cumulative raw input correctly.

**Step 2: Run targeted tests**

Run: `npm test -- src/lib/parser.test.ts`  
Expected: FAIL if either split shape is unsupported for the selected metric path.

**Step 3: Implement minimal UI/API behavior changes**

Ensure session custom splits workflow supports this explicitly:
- when relevant cumulative metric is selected, custom-splits field is visible,
- placeholder/default communicates `10,10` as preferred split default,
- saved value `20` remains valid (positive numeric array with one element),
- entry form split toggle (`Cumulative`/`Segment`) works for both split-count patterns.

If needed, add a small helper text in session form clarifying this use case:
- `(10,10)` = two 10m segments (e.g., 20-30 and 30-40),
- `(20)` = one full 20m interval.

**Step 4: Manual validation scenario (required)**

Using your example setup:
- build at 20m, gates at 20/30/40,
- set session custom splits to `10,10`,
- enter segment values, confirm derived rows include `20-30m_Split`, `30-40m_Split`, and `20-40m_Split`.

Then switch custom splits to `20`:
- enter one interval value,
- confirm entry saves and `20-40m_Split` still appears for ranking/query.

**Step 5: Commit**

```bash
git add src/app/data-entry/SessionForm.tsx src/app/data-entry/session/[id]/EditSessionClient.tsx src/app/data-entry/EntryForm.tsx src/app/api/sessions/route.ts src/app/api/sessions/[id]/route.ts src/lib/parser.test.ts
git commit -m "feat(data-entry): support 20m fly split workflow with 10,10 default and 20 override"
```

---

### Task 5: API metric-option and queryability smoke coverage

**Files:**
- Reference/Modify (if tests exist): `src/app/api/leaderboard/session-metrics/route.ts`
- Reference: `src/app/api/leaderboard/route.ts`
- Reference: `src/app/leaderboard/LeaderboardClient.tsx`

**Step 1: Add focused route test(s) if test harness exists**

Verify `session-metrics` responses include new split keys when present in data and that leaderboard route accepts them as `metric` params.

**Step 2: If no route test harness, perform manual checks**

Run app and verify:
- new keys appear in leaderboard metric options,
- selecting each key returns data rows (or empty cleanly),
- no API 400 for valid new keys.

**Step 3: Capture any minimal fixes**

If any route-level filtering excludes new keys, patch with smallest change.

**Step 4: Verify**

Run: `npm test -- src/app/api/leaderboard` (if available) and/or manual endpoint checks with browser/network.

**Step 5: Commit**

```bash
git add src/app/api/leaderboard/session-metrics/route.ts src/app/api/leaderboard/route.ts src/app/leaderboard/LeaderboardClient.tsx
git commit -m "chore(leaderboard): expose and query new 20m split metrics"
```

---

### Task 6: Historical/PR behavior regression check

**Files:**
- Reference/Modify: `src/lib/historical-metric-filter.ts`
- Reference/Modify: `src/lib/metric-utils.ts`
- Reference: `src/app/api/leaderboard/historical/route.ts`
- Reference: `src/app/api/athletes/[id]/prs/route.ts`

**Step 1: Write failing tests or manual checks**

Confirm new split keys are treated as standalone metrics and are not inadvertently filtered by cumulative primary-component logic.

**Step 2: Run checks**

Run targeted tests if present; otherwise run manual API requests for historical and PR endpoints with new split keys.

**Step 3: Minimal fix if needed**

Adjust helper classification logic only if split keys are misclassified as cumulative/component-filtered metrics.

**Step 4: Re-verify**

Re-run tests/manual checks to confirm behavior.

**Step 5: Commit**

```bash
git add src/lib/historical-metric-filter.ts src/lib/metric-utils.ts src/app/api/leaderboard/historical/route.ts src/app/api/athletes/[id]/prs/route.ts
git commit -m "fix(historical): treat new 20m split metrics as first-class keys"
```

---

### Task 7: End-to-end verification and docs update

**Files:**
- Optional docs note: `docs/plans/2026-03-27-flying-20m-split-metrics-design.md`
- Any touched test files from previous tasks

**Step 1: Full verification run**

Run:
- `npm test`
- `npm run build`

Expected: green tests and successful production build.

**Step 2: Manual workflow verification**

Validate both paths:
- manual entry for each new split key,
- cumulative/segment entry that derives each new split key.

Confirm values appear in leaderboard and historical contexts.

**Step 3: Optional backfill decision**

Decide whether to create a separate script for historical row backfill. Keep out of this change unless explicitly requested.

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: support split-based Flying 20m windows across parser and leaderboard flows"
```

---

## Verification checklist (before merge)

- [ ] Parser tests cover direct + derived generation for new split keys.
- [ ] Session custom splits supports both `10,10` and `20` for the fly-entry workflow.
- [ ] Segment-mode entry converts correctly and produces expected derived split metrics.
- [ ] Existing `10-30m_Split` behavior remains unchanged.
- [ ] Leaderboard metric options and queries accept new split keys.
- [ ] Historical/PR routes treat new split keys correctly.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-27-flying-20m-split-metrics-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch a fresh subagent per task, review between tasks, and iterate quickly.

2. Parallel Session (separate) - Open a new session with executing-plans and run the plan with checkpoints.

Which approach?
