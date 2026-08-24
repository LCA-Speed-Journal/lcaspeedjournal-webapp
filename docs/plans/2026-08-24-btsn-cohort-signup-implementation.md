# Back to School Night Cohort Signup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public gym TV page that shows remaining Fall S&C spots (starting at 12) and a coach-PIN intake page that records names (grade/email optional), unnamed +1/−1 taps, and a waitlist in signup order.

**Architecture:** One ordered `cohort_signups` table plus a single `cohort_config` row (`capacity` + `title`). Claimed vs waitlist is derived: the first `capacity` rows by `created_at` are in the cohort; the rest are waitlist. `/cohort` is a public kiosk (counts only, SWR poll ~2s). `/cohort/intake` is coach-only writes. No websockets, no parent QR form, no athlete-roster import.

**Tech Stack:** Next.js App Router (this repo uses Next 16), React 19, Tailwind CSS, SWR, NextAuth credentials (coach PIN), Vercel Postgres (`sql` from `src/lib/db.ts`), Vitest.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`, remote `LCA-Speed-Journal/lcaspeedjournal-webapp`). Run `npm test` and `npm run dev` from the repo root. Paths in tasks are relative to that root.

**Do not:** expose names or waitlist size on the public API/TV; snap remaining to 0 on fetch error; create athlete records; add CSV export, QR self-signup, or multiple cohorts.

**Reference:** Brainstorming locked 2026-08-24. Patterns: `src/app/api/athletes/route.ts` (auth + `{ data }`/`{ error }`), `src/app/data-entry/page.tsx` (PIN redirect), `src/app/leaderboard/LeaderboardClient.tsx` (SWR fetcher), `src/app/leaderboard/leaderboardDiff.test.ts` (Vitest style). Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

---

### Task 1: `deriveCohort` — failing tests then implementation

**Files:**
- Create: `src/lib/cohort.ts`
- Test: `src/lib/cohort.test.ts`

**Step 1: Write the failing test**

Create `src/lib/cohort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveCohort, DEFAULT_CAPACITY, DEFAULT_TITLE } from "./cohort";
import type { CohortSignup } from "./cohort";

function signup(
  overrides: Partial<CohortSignup> & Pick<CohortSignup, "id" | "created_at">
): CohortSignup {
  return {
    display_name: null,
    grade: null,
    email: null,
    ...overrides,
  };
}

describe("deriveCohort", () => {
  it("returns empty claimed and full remaining when there are no signups", () => {
    const result = deriveCohort([], 12, DEFAULT_TITLE);
    expect(result.capacity).toBe(12);
    expect(result.claimed).toBe(0);
    expect(result.remaining).toBe(12);
    expect(result.inCohort).toEqual([]);
    expect(result.waitlist).toEqual([]);
    expect(result.title).toBe(DEFAULT_TITLE);
  });

  it("places everyone in cohort when count is under capacity", () => {
    const rows = [
      signup({ id: "a", display_name: "Ana", created_at: "2026-08-24T18:00:00.000Z" }),
      signup({ id: "b", display_name: "Ben", created_at: "2026-08-24T18:01:00.000Z" }),
    ];
    const result = deriveCohort(rows, 12);
    expect(result.claimed).toBe(2);
    expect(result.remaining).toBe(10);
    expect(result.inCohort.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.waitlist).toEqual([]);
    expect(result.inCohort.every((s) => s.in_cohort && s.waitlist_position === null)).toBe(true);
  });

  it("puts overflow on the waitlist in signup order", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const result = deriveCohort(rows, 2);
    expect(result.claimed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(result.inCohort.map((s) => s.id)).toEqual(["1", "2"]);
    expect(result.waitlist.map((s) => s.id)).toEqual(["3"]);
    expect(result.waitlist[0].waitlist_position).toBe(1);
    expect(result.waitlist[0].in_cohort).toBe(false);
  });

  it("treats unnamed placeholders like named rows for order", () => {
    const rows = [
      signup({ id: "u", display_name: null, created_at: "2026-08-24T18:00:00.000Z" }),
      signup({ id: "n", display_name: "Named", created_at: "2026-08-24T18:01:00.000Z" }),
    ];
    const result = deriveCohort(rows, 1);
    expect(result.inCohort[0].id).toBe("u");
    expect(result.waitlist[0].id).toBe("n");
  });

  it("promotes waitlist into cohort when capacity increases", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const at12 = deriveCohort(rows, 2);
    expect(at12.waitlist.map((s) => s.id)).toEqual(["3"]);
    const bumped = deriveCohort(rows, 3);
    expect(bumped.claimed).toBe(3);
    expect(bumped.remaining).toBe(0);
    expect(bumped.waitlist).toEqual([]);
    expect(bumped.inCohort.map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  it("demotes last claimed onto waitlist when capacity decreases (does not drop rows)", () => {
    const rows = [1, 2, 3].map((n) =>
      signup({
        id: String(n),
        display_name: `P${n}`,
        created_at: `2026-08-24T18:0${n}:00.000Z`,
      })
    );
    const result = deriveCohort(rows, 1);
    expect(result.claimed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(result.inCohort.map((s) => s.id)).toEqual(["1"]);
    expect(result.waitlist.map((s) => s.id)).toEqual(["2", "3"]);
    expect(result.waitlist.map((s) => s.waitlist_position)).toEqual([1, 2]);
  });

  it("sorts by created_at even if input is unordered", () => {
    const rows = [
      signup({ id: "b", display_name: "B", created_at: "2026-08-24T18:02:00.000Z" }),
      signup({ id: "a", display_name: "A", created_at: "2026-08-24T18:00:00.000Z" }),
    ];
    const result = deriveCohort(rows, DEFAULT_CAPACITY);
    expect(result.inCohort.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("clamps capacity below 1 up to 1", () => {
    const result = deriveCohort([], 0);
    expect(result.capacity).toBe(1);
    expect(result.remaining).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/cohort.test.ts`

Expected: FAIL — `Cannot find module './cohort'` (or `deriveCohort` is not exported).

**Step 3: Write minimal implementation**

Create `src/lib/cohort.ts`:

```ts
export const COHORT_CONFIG_ID = "fall-sc";
export const DEFAULT_CAPACITY = 12;
export const DEFAULT_TITLE = "Fall Strength & Conditioning";

export type CohortSignup = {
  id: string;
  display_name: string | null;
  grade: string | null;
  email: string | null;
  created_at: string;
};

export type DerivedSignup = CohortSignup & {
  in_cohort: boolean;
  waitlist_position: number | null;
};

export type DerivedCohort = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
  inCohort: DerivedSignup[];
  waitlist: DerivedSignup[];
  signups: DerivedSignup[];
};

export function deriveCohort(
  signups: CohortSignup[],
  capacity: number,
  title: string = DEFAULT_TITLE
): DerivedCohort {
  const cap = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : DEFAULT_CAPACITY;
  const ordered = [...signups].toSorted(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const withFlags: DerivedSignup[] = ordered.map((s, i) => ({
    ...s,
    in_cohort: i < cap,
    waitlist_position: i < cap ? null : i - cap + 1,
  }));
  const inCohort = withFlags.filter((s) => s.in_cohort);
  const waitlist = withFlags.filter((s) => !s.in_cohort);
  return {
    title,
    capacity: cap,
    claimed: inCohort.length,
    remaining: cap - inCohort.length,
    inCohort,
    waitlist,
    signups: withFlags,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/cohort.test.ts`

Expected: PASS (all `deriveCohort` tests).

**Step 5: Commit**

```bash
git add src/lib/cohort.ts src/lib/cohort.test.ts
git commit -m "feat(cohort): derive claimed vs waitlist from signup order and capacity"
```

---

### Task 2: Public payload and request parsers (TDD)

**Files:**
- Modify: `src/lib/cohort.ts`
- Modify: `src/lib/cohort.test.ts`

These helpers keep API routes thin and make the “no names on the TV payload” rule testable without hitting Postgres.

**Step 1: Append failing tests** to `src/lib/cohort.test.ts`:

```ts
import {
  deriveCohort,
  toPublicCohortPayload,
  parseCapacity,
  parseSignupBody,
  DEFAULT_CAPACITY,
  DEFAULT_TITLE,
} from "./cohort";

describe("toPublicCohortPayload", () => {
  it("returns only title, capacity, claimed, remaining", () => {
    const derived = deriveCohort(
      [signup({ id: "a", display_name: "Secret", email: "x@y.z", created_at: "2026-08-24T18:00:00.000Z" })],
      12
    );
    const publicPayload = toPublicCohortPayload(derived);
    expect(publicPayload).toEqual({
      title: DEFAULT_TITLE,
      capacity: 12,
      claimed: 1,
      remaining: 11,
    });
    expect(publicPayload).not.toHaveProperty("waitlist");
    expect(publicPayload).not.toHaveProperty("inCohort");
    expect(publicPayload).not.toHaveProperty("signups");
    expect(JSON.stringify(publicPayload)).not.toContain("Secret");
    expect(JSON.stringify(publicPayload)).not.toContain("x@y.z");
  });
});

describe("parseCapacity", () => {
  it("accepts integers >= 1", () => {
    expect(parseCapacity(12)).toBe(12);
    expect(parseCapacity("15")).toBe(15);
  });

  it("rejects non-integers and values below 1", () => {
    expect(parseCapacity(0)).toBeNull();
    expect(parseCapacity(1.5)).toBeNull();
    expect(parseCapacity("nope")).toBeNull();
    expect(parseCapacity(null)).toBeNull();
  });
});

describe("parseSignupBody", () => {
  it("accepts unnamed tap as a null name", () => {
    expect(parseSignupBody({ unnamed: true })).toEqual({
      ok: true,
      display_name: null,
      grade: null,
      email: null,
    });
  });

  it("requires a non-blank name when not unnamed", () => {
    expect(parseSignupBody({}).ok).toBe(false);
    expect(parseSignupBody({ display_name: "  " }).ok).toBe(false);
    expect(parseSignupBody({ display_name: "Jordan" })).toEqual({
      ok: true,
      display_name: "Jordan",
      grade: null,
      email: null,
    });
  });

  it("trims optional grade and email", () => {
    expect(
      parseSignupBody({ display_name: "Jordan", grade: " 10 ", email: " a@b.c " })
    ).toEqual({
      ok: true,
      display_name: "Jordan",
      grade: "10",
      email: "a@b.c",
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/cohort.test.ts`

Expected: FAIL — `toPublicCohortPayload` / `parseCapacity` / `parseSignupBody` are not exported.

**Step 3: Add implementations** to `src/lib/cohort.ts`:

```ts
export type PublicCohortPayload = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
};

export function toPublicCohortPayload(derived: DerivedCohort): PublicCohortPayload {
  return {
    title: derived.title,
    capacity: derived.capacity,
    claimed: derived.claimed,
    remaining: derived.remaining,
  };
}

export function parseCapacity(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export type ParsedSignup =
  | { ok: true; display_name: string | null; grade: string | null; email: string | null }
  | { ok: false; error: string };

function optionalTrimmed(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export function parseSignupBody(body: unknown): ParsedSignup {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;
  if (b.unnamed === true) {
    return {
      ok: true,
      display_name: null,
      grade: optionalTrimmed(b.grade),
      email: optionalTrimmed(b.email),
    };
  }
  const name = optionalTrimmed(b.display_name);
  if (!name) {
    return { ok: false, error: "Name is required" };
  }
  return {
    ok: true,
    display_name: name,
    grade: optionalTrimmed(b.grade),
    email: optionalTrimmed(b.email),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/cohort.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/cohort.ts src/lib/cohort.test.ts
git commit -m "feat(cohort): public payload strips names; parse capacity and signup body"
```

---

### Task 3: Postgres migration

**Files:**
- Create: `scripts/migrate-cohort-signups.sql`
- Modify: `DEPLOY.md` (add a bullet under “Run database migrations”)

There is no Vitest harness for SQL. Treat “file exists and is safe to re-run” as the check. Production: Vercel → Storage → Postgres → Query, paste this file. Local: same against `POSTGRES_URL`.

**Step 1: Write the migration**

```sql
-- Fall S&C Back to School Night cohort signups
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS cohort_config (
  id TEXT PRIMARY KEY,
  capacity INTEGER NOT NULL DEFAULT 12,
  title TEXT NOT NULL DEFAULT 'Fall Strength & Conditioning',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cohort_config (id, capacity, title)
VALUES ('fall-sc', 12, 'Fall Strength & Conditioning')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cohort_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  grade TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_signups_created_at
  ON cohort_signups (created_at);
```

**Step 2: Document in DEPLOY.md**

After the existing progression-index bullet, add:

```markdown
**Back to School Night cohort widget:** Run `scripts/migrate-cohort-signups.sql` to add `cohort_config` and `cohort_signups`. Without this, `/cohort` and `/api/cohort` will 500.
```

**Step 3: Commit**

```bash
git add scripts/migrate-cohort-signups.sql DEPLOY.md
git commit -m "chore(db): add cohort_config and cohort_signups migration"
```

**Step 4: Run the SQL** against the database you will use for `npm run dev` before Task 4. If tables are missing, later API tests/manual checks will 500.

---

### Task 4: Shared DB loader + public GET `/api/cohort`

**Files:**
- Create: `src/lib/cohort-db.ts`
- Create: `src/app/api/cohort/route.ts`

No new unit tests (I/O). Routes must call `toPublicCohortPayload` so Task 2’s guarantee holds. Match `src/app/api/athletes/route.ts`: try/catch, `{ data }` / `{ error }`, parameterized `sql`.

**Step 1: Create `src/lib/cohort-db.ts`**

```ts
import { sql } from "@/lib/db";
import {
  COHORT_CONFIG_ID,
  DEFAULT_CAPACITY,
  DEFAULT_TITLE,
  deriveCohort,
  type CohortSignup,
  type DerivedCohort,
} from "@/lib/cohort";

export async function ensureCohortConfig(): Promise<{ capacity: number; title: string }> {
  await sql`
    INSERT INTO cohort_config (id, capacity, title)
    VALUES (${COHORT_CONFIG_ID}, ${DEFAULT_CAPACITY}, ${DEFAULT_TITLE})
    ON CONFLICT (id) DO NOTHING
  `;
  const { rows } = await sql`
    SELECT capacity, title
    FROM cohort_config
    WHERE id = ${COHORT_CONFIG_ID}
    LIMIT 1
  `;
  const row = rows[0] as { capacity: number; title: string } | undefined;
  return {
    capacity: Number(row?.capacity ?? DEFAULT_CAPACITY),
    title: String(row?.title ?? DEFAULT_TITLE),
  };
}

export async function listCohortSignups(): Promise<CohortSignup[]> {
  const { rows } = await sql`
    SELECT id, display_name, grade, email, created_at
    FROM cohort_signups
    ORDER BY created_at ASC
  `;
  return (rows as CohortSignup[]).map((r) => ({
    id: String(r.id),
    display_name: r.display_name ?? null,
    grade: r.grade ?? null,
    email: r.email ?? null,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  }));
}

export async function loadDerivedCohort(): Promise<DerivedCohort> {
  const [config, signups] = await Promise.all([
    ensureCohortConfig(),
    listCohortSignups(),
  ]);
  return deriveCohort(signups, config.capacity, config.title);
}
```

**Step 2: Create `src/app/api/cohort/route.ts` (GET only in this task; PATCH is Task 7)**

```ts
import { NextResponse } from "next/server";
import { loadDerivedCohort } from "@/lib/cohort-db";
import { toPublicCohortPayload } from "@/lib/cohort";

export async function GET() {
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("GET /api/cohort:", err);
    return NextResponse.json({ error: "Failed to load cohort" }, { status: 500 });
  }
}
```

**Step 3: Verify**

Run: `npm test`

Expected: existing tests still PASS.

Run: `npm run dev`, then in another shell:

```bash
curl -s http://localhost:3000/api/cohort
```

Expected JSON like `{ "data": { "title": "Fall Strength & Conditioning", "capacity": 12, "claimed": 0, "remaining": 12 } }`. Keys must not include names or waitlist.

**Step 4: Commit**

```bash
git add src/lib/cohort-db.ts src/app/api/cohort/route.ts
git commit -m "feat(cohort): public GET /api/cohort returns remaining spots only"
```

---

### Task 5: Auth GET + POST `/api/cohort/signups`

**Files:**
- Create: `src/app/api/cohort/signups/route.ts`

Copy the auth gate from `src/app/api/athletes/route.ts` POST: `getServerSession(authOptions)` → 401 `{ error: "Unauthorized" }`.

**Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadDerivedCohort } from "@/lib/cohort-db";
import { parseSignupBody } from "@/lib/cohort";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({
      data: {
        title: derived.title,
        capacity: derived.capacity,
        claimed: derived.claimed,
        remaining: derived.remaining,
        in_cohort: derived.inCohort,
        waitlist: derived.waitlist,
        signups: derived.signups,
      },
    });
  } catch (err) {
    console.error("GET /api/cohort/signups:", err);
    return NextResponse.json({ error: "Failed to load signups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const parsed = parseSignupBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { rows } = await sql`
      INSERT INTO cohort_signups (display_name, grade, email)
      VALUES (${parsed.display_name}, ${parsed.grade}, ${parsed.email})
      RETURNING id, display_name, grade, email, created_at
    `;
    const derived = await loadDerivedCohort();
    return NextResponse.json(
      { data: { signup: rows[0], remaining: derived.remaining, claimed: derived.claimed } },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/cohort/signups:", err);
    return NextResponse.json({ error: "Failed to add signup" }, { status: 500 });
  }
}
```

**Step 2: Verify**

```bash
curl -s -o NUL -w "%{http_code}" http://localhost:3000/api/cohort/signups
```

Expected: `401`.

Log in via `/login` in the browser (PIN from `COACH_PIN` or `1234`), then POST with the session cookie is easiest from the intake UI in Task 9. For now, 401 without a cookie is the gate check.

**Step 3: Commit**

```bash
git add src/app/api/cohort/signups/route.ts
git commit -m "feat(cohort): authenticated list and add signups"
```

---

### Task 6: PATCH + DELETE `/api/cohort/signups/[id]`

**Files:**
- Create: `src/app/api/cohort/signups/[id]/route.ts`

PATCH attaches a name (and optional grade/email) to a placeholder. DELETE removes one row. Intake −1 will DELETE the last item in `signups` (already ordered oldest→newest).

**Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseSignupBody } from "@/lib/cohort";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = parseSignupBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { rows } = await sql`
      UPDATE cohort_signups
      SET
        display_name = ${parsed.display_name},
        grade = ${parsed.grade},
        email = ${parsed.email}
      WHERE id = ${id}
      RETURNING id, display_name, grade, email, created_at
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    console.error("PATCH /api/cohort/signups/[id]:", err);
    return NextResponse.json({ error: "Failed to update signup" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { rows } = await sql`
      DELETE FROM cohort_signups
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error("DELETE /api/cohort/signups/[id]:", err);
    return NextResponse.json({ error: "Failed to delete signup" }, { status: 500 });
  }
}
```

Note: PATCH uses `parseSignupBody`, so attaching a name to a placeholder requires `display_name` (not `unnamed: true`). That is intentional.

**Step 2: Verify** unauthenticated:

```bash
curl -s -o NUL -w "%{http_code}" -X DELETE http://localhost:3000/api/cohort/signups/00000000-0000-0000-0000-000000000000
```

Expected: `401`.

**Step 3: Commit**

```bash
git add src/app/api/cohort/signups/[id]/route.ts
git commit -m "feat(cohort): update placeholder names and delete signups"
```

---

### Task 7: PATCH `/api/cohort` (capacity)

**Files:**
- Modify: `src/app/api/cohort/route.ts`

**Step 1: Add PATCH** to the existing file (keep GET). Full file after edit:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadDerivedCohort, ensureCohortConfig } from "@/lib/cohort-db";
import { COHORT_CONFIG_ID, parseCapacity, toPublicCohortPayload } from "@/lib/cohort";

export async function GET() {
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("GET /api/cohort:", err);
    return NextResponse.json({ error: "Failed to load cohort" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const capacity = parseCapacity(body?.capacity);
    if (capacity == null) {
      return NextResponse.json({ error: "capacity must be an integer >= 1" }, { status: 400 });
    }
    await ensureCohortConfig();
    await sql`
      UPDATE cohort_config
      SET capacity = ${capacity}, updated_at = NOW()
      WHERE id = ${COHORT_CONFIG_ID}
    `;
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("PATCH /api/cohort:", err);
    return NextResponse.json({ error: "Failed to update capacity" }, { status: 500 });
  }
}
```

Public GET still uses `toPublicCohortPayload`. PATCH returns the same public shape (TV-safe). Intake should re-GET `/api/cohort/signups` after a capacity change so lists update.

**Step 2: Verify**

```bash
curl -s -o NUL -w "%{http_code}" -X PATCH http://localhost:3000/api/cohort -H "Content-Type: application/json" -d "{\"capacity\":15}"
```

Expected: `401`.

GET `/api/cohort` still public and 200.

**Step 3: Commit**

```bash
git add src/app/api/cohort/route.ts
git commit -m "feat(cohort): allow coach to bump capacity"
```

---

### Task 8: Hide ThemeBar chrome + TV kiosk page

**Files:**
- Modify: `src/app/components/ThemeBar.tsx`
- Create: `src/app/cohort/page.tsx`
- Create: `src/app/cohort/CohortDisplayClient.tsx`

Hide Home + theme toggle only when `pathname === "/cohort"` (not `/cohort/intake`). Force dark on the TV page so gym lights don’t wash it to light theme. SWR `refreshInterval: 2000`. On error, keep last successful data; if there is no data yet, show “Connecting…” — never render remaining as 0 from a failed fetch.

Bar fill = `claimed / capacity`. Copy: if `remaining > 0`, giant number + “spots remaining”; if `remaining === 0`, “Cohort full” and “Waitlist open at the table”. No waitlist count.

Color: remaining `> 6` → `text-accent` / `bg-accent`; `<= 6` and `> 3` → `text-gold`; `<= 3` → `text-danger`. Animate bar with CSS `transition-[width] duration-500` (framer-motion already in the app; CSS is enough).

**Step 1: ThemeBar**

Replace `src/app/components/ThemeBar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/app/components/ThemeToggle";

export function ThemeBar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname === "/cohort";

  return (
    <>
      {hideChrome ? null : (
        <div className="fixed top-0 right-0 z-[100] flex items-center gap-3 p-3">
          <ThemeToggle />
          <Link
            href="/"
            className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 hover:bg-surface"
          >
            Home
          </Link>
        </div>
      )}
      <div className="min-h-screen">{children}</div>
    </>
  );
}
```

**Step 2: Display client**

Create `src/app/cohort/CohortDisplayClient.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { PublicCohortPayload } from "@/lib/cohort";

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function remainingTone(remaining: number): string {
  if (remaining <= 0) return "text-danger";
  if (remaining <= 3) return "text-danger";
  if (remaining <= 6) return "text-gold";
  return "text-accent";
}

function barTone(remaining: number): string {
  if (remaining <= 0) return "bg-danger";
  if (remaining <= 3) return "bg-danger";
  if (remaining <= 6) return "bg-gold";
  return "bg-accent";
}

export function CohortDisplayClient() {
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    html.classList.add("dark");
    return () => {
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);

  const { data, error } = useSWR<{ data: PublicCohortPayload }>("/api/cohort", fetcher, {
    refreshInterval: 2000,
  });
  const payload = data?.data;

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground-muted">
        {error ? "Reconnecting…" : "Connecting…"}
      </div>
    );
  }

  const { title, capacity, claimed, remaining } = payload;
  const fillPct = capacity > 0 ? Math.min(100, (claimed / capacity) * 100) : 0;
  const full = remaining <= 0;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-8 py-12">
      {error ? (
        <p className="absolute top-4 text-sm text-foreground-muted">Reconnecting…</p>
      ) : null}
      <p className="text-center text-sm font-medium uppercase tracking-[0.3em] text-foreground-muted">
        Back to School Night
      </p>
      <h1 className="mt-3 text-center text-2xl font-semibold text-foreground md:text-4xl">
        {title}
      </h1>
      {full ? (
        <>
          <p className={`mt-12 text-center text-6xl font-bold tracking-tight md:text-8xl ${remainingTone(0)}`}>
            Cohort full
          </p>
          <p className="mt-4 text-center text-xl text-foreground-muted md:text-3xl">
            Waitlist open at the table
          </p>
        </>
      ) : (
        <>
          <p
            className={`mt-12 text-center font-bold leading-none tracking-tight ${remainingTone(remaining)}`}
            style={{ fontSize: "clamp(6rem, 22vw, 14rem)" }}
          >
            {remaining}
          </p>
          <p className="mt-4 text-center text-xl text-foreground-muted md:text-3xl">
            {remaining === 1 ? "spot remaining" : "spots remaining"}
          </p>
        </>
      )}
      <div className="mt-16 h-4 w-full max-w-3xl overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barTone(remaining)}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-foreground-muted">
        {claimed} of {capacity} claimed
      </p>
    </div>
  );
}
```

`{claimed} of {capacity} claimed` is not a waitlist count; it is the scarcity bar label. Keep it.

**Step 3: Page**

Create `src/app/cohort/page.tsx`:

```tsx
import { CohortDisplayClient } from "./CohortDisplayClient";

export default function CohortDisplayPage() {
  return <CohortDisplayClient />;
}
```

**Step 4: Verify in browser**

- Open `http://localhost:3000/cohort` — no Home button, no theme toggle, giant 12 (if empty).
- Open `http://localhost:3000/` — Home + theme toggle still present.
- Stop Postgres or block `/api/cohort` after a successful load: number must not jump to 0; “Reconnecting…” may show.

**Step 5: Commit**

```bash
git add src/app/components/ThemeBar.tsx src/app/cohort/page.tsx src/app/cohort/CohortDisplayClient.tsx
git commit -m "feat(cohort): kiosk TV display for remaining spots"
```

---

### Task 9: Coach intake page

**Files:**
- Create: `src/app/cohort/intake/page.tsx`
- Create: `src/app/cohort/intake/IntakeClient.tsx`

Server page copies `src/app/data-entry/page.tsx`: `getServerSession` → `redirect("/login?callbackUrl=/cohort/intake")`. Client is mobile-first: remaining count, name field (Enter submits), “More details” for optional grade/email, +1 / −1, capacity stepper, two lists.

−1: DELETE last `signups` row. If that row has `display_name`, `window.confirm("Remove {name}?")`. Unnamed: no confirm.

+1: POST `{ unnamed: true }`.

After every write: `mutate("/api/cohort/signups")` and `mutate("/api/cohort")` so the TV poll is not the only refresh on this phone.

**Step 1: Server page**

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { IntakeClient } from "./IntakeClient";

export const dynamic = "force-dynamic";

export default async function CohortIntakePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/cohort/intake");
  }
  return <IntakeClient />;
}
```

**Step 2: Client — create `src/app/cohort/intake/IntakeClient.tsx`**

```tsx
"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import type { DerivedSignup } from "@/lib/cohort";

type IntakePayload = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
  in_cohort: DerivedSignup[];
  waitlist: DerivedSignup[];
  signups: DerivedSignup[];
};

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

async function refreshCohort() {
  await Promise.all([globalMutate("/api/cohort/signups"), globalMutate("/api/cohort")]);
}

function SignupRow({
  row,
  onNamed,
  onDelete,
}: {
  row: DerivedSignup;
  onNamed: (id: string, name: string) => void;
  onDelete: (id: string, name: string | null) => void;
}) {
  const [name, setName] = useState("");
  const unnamed = !row.display_name;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">
            {row.display_name ?? "Unnamed spot"}
          </p>
          {row.grade || row.email ? (
            <p className="text-sm text-foreground-muted">
              {[row.grade, row.email].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {row.waitlist_position != null ? (
            <p className="text-xs text-foreground-muted">Waitlist #{row.waitlist_position}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="text-sm text-danger"
          onClick={() => onDelete(row.id, row.display_name)}
        >
          Remove
        </button>
      </div>
      {unnamed ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onNamed(row.id, name.trim());
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add name"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
          <button type="submit" className="rounded bg-accent px-3 py-1 text-sm font-medium text-background">
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}

export function IntakeClient() {
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState("");
  const [email, setEmail] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, error: loadError, isLoading } = useSWR<{ data: IntakePayload }>(
    "/api/cohort/signups",
    fetcher
  );
  const payload = data?.data;

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/cohort/intake";
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Request failed");
        return;
      }
      await refreshCohort();
    } catch {
      setError("Network error — retry");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(() =>
      fetch("/api/cohort/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          grade: showMore ? grade : undefined,
          email: showMore ? email : undefined,
        }),
      })
    ).then(() => {
      setDisplayName("");
      setGrade("");
      setEmail("");
    });
  }

  function handlePlus() {
    void run(() =>
      fetch("/api/cohort/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unnamed: true }),
      })
    );
  }

  function handleMinus() {
    const last = payload?.signups[payload.signups.length - 1];
    if (!last) return;
    if (last.display_name && !window.confirm(`Remove ${last.display_name}?`)) return;
    void run(() => fetch(`/api/cohort/signups/${last.id}`, { method: "DELETE" }));
  }

  function handleNamed(id: string, name: string) {
    void run(() =>
      fetch(`/api/cohort/signups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
      })
    );
  }

  function handleDelete(id: string, name: string | null) {
    if (name && !window.confirm(`Remove ${name}?`)) return;
    void run(() => fetch(`/api/cohort/signups/${id}`, { method: "DELETE" }));
  }

  function bumpCapacity(next: number) {
    if (next < 1) return;
    void run(() =>
      fetch("/api/cohort", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: next }),
      })
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 md:px-8">
      <PageBackground />
      <div className="relative z-10 mx-auto flex max-w-lg flex-col gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Coach intake
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {payload?.title ?? "Fall Strength & Conditioning"}
          </h1>
          <p className="mt-2 text-4xl font-bold text-accent">
            {payload ? payload.remaining : "—"}{" "}
            <span className="text-lg font-medium text-foreground-muted">remaining</span>
          </p>
        </header>

        {loadError ? (
          <p className="text-sm text-danger" role="alert">
            Could not load signups. Retry by refreshing.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/90 p-4">
          <label className="text-sm font-medium text-foreground">
            Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-3 text-lg text-foreground"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="text-left text-sm text-accent"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? "Hide details" : "More details"}
          </button>
          {showMore ? (
            <div className="flex flex-col gap-2">
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Grade (optional)"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-foreground"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-foreground"
              />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy || !displayName.trim()}
            className="rounded-xl bg-accent py-3 font-semibold text-background disabled:opacity-50"
          >
            Add signup
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handlePlus}
              className="rounded-xl border-2 border-accent py-4 text-2xl font-bold text-accent"
            >
              +1
            </button>
            <button
              type="button"
              disabled={busy || !payload?.signups.length}
              onClick={handleMinus}
              className="rounded-xl border-2 border-danger py-4 text-2xl font-bold text-danger disabled:opacity-40"
            >
              −1
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-surface/90 p-4">
          <p className="text-sm font-medium text-foreground">Capacity</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-foreground"
              disabled={busy || (payload?.capacity ?? 1) <= 1}
              onClick={() => bumpCapacity((payload?.capacity ?? 1) - 1)}
            >
              −
            </button>
            <span className="text-2xl font-bold text-foreground">{payload?.capacity ?? "—"}</span>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-foreground"
              disabled={busy}
              onClick={() => bumpCapacity((payload?.capacity ?? 12) + 1)}
            >
              +
            </button>
            <span className="text-sm text-foreground-muted">spots</span>
          </div>
        </section>

        {isLoading ? <p className="text-foreground-muted">Loading…</p> : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            In the cohort ({payload?.in_cohort.length ?? 0})
          </h2>
          <ul className="flex flex-col gap-2">
            {(payload?.in_cohort ?? []).map((row) => (
              <SignupRow key={row.id} row={row} onNamed={handleNamed} onDelete={handleDelete} />
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 pb-8">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Waitlist ({payload?.waitlist.length ?? 0})
          </h2>
          <ul className="flex flex-col gap-2">
            {(payload?.waitlist ?? []).map((row) => (
              <SignupRow key={row.id} row={row} onNamed={handleNamed} onDelete={handleDelete} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
```

Fix the submit-then-clear race: `handleSubmit` currently always clears the name field even if POST fails. Change `handleSubmit` to only clear after `res.ok`. Implementer: do not `.then` clear unconditionally — fold clear into `run` via a success callback, or check a returned boolean.

Correct `handleSubmit`:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setError("");
  try {
    const res = await fetch("/api/cohort/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName,
        grade: showMore ? grade : undefined,
        email: showMore ? email : undefined,
      }),
    });
    if (res.status === 401) {
      window.location.href = "/login?callbackUrl=/cohort/intake";
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Request failed");
      return;
    }
    setDisplayName("");
    setGrade("");
    setEmail("");
    await refreshCohort();
  } catch {
    setError("Network error — retry");
  } finally {
    setBusy(false);
  }
}
```

Use this version instead of the `run().then(clear)` sketch above.

**Step 3: Verify in browser**

- Logged out: `/cohort/intake` redirects to login, then back.
- Add “Test Kid” — appears under In the cohort; TV remaining drops within ~2s.
- +1 — unnamed row; TV drops again.
- −1 on unnamed — no confirm; row gone.
- −1 on named — confirm dialog.
- Fill 12+, 13th is Waitlist #1.
- Capacity + — waitlist #1 moves into cohort; TV remaining increases.
- Optional grade/email behind More details.

**Step 4: Commit**

```bash
git add src/app/cohort/intake/page.tsx src/app/cohort/intake/IntakeClient.tsx
git commit -m "feat(cohort): coach intake with names, tap fallback, and waitlist"
```

---

### Task 10: Home link + night-of checklist

**Files:**
- Modify: `src/app/page.tsx` (Manage links, ~lines 50–68)
- Modify: `docs/plans/2026-08-24-btsn-cohort-signup-implementation.md` (this file already contains the checklist below)

**Step 1: Add intake link** under Manage, after Data entry, before Coach login. Do not add a prominent TV/display CTA on the home hero.

```tsx
<Link
  href="/cohort/intake"
  className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
>
  Cohort intake
</Link>
```

**Step 2: Run full tests**

Run: `npm test`

Expected: PASS, including `src/lib/cohort.test.ts`.

**Step 3: Night-of / QA checklist** (do this before calling the task done)

1. Run `scripts/migrate-cohort-signups.sql` on the DB the TV will use.
2. TV browser: bookmark `https://<app>/cohort`. Full screen. Confirm no Home button.
3. Phone: log in, open `/cohort/intake`.
4. Add a named signup → TV remaining decrements, bar grows.
5. +1 → unnamed appears, TV updates.
6. Attach a name to the unnamed row.
7. −1 named → confirm; TV remaining increments.
8. Add until remaining is 0 → TV shows “Cohort full” / “Waitlist open at the table” with no waitlist number.
9. Next signup lands on Waitlist #1.
10. Capacity +1 → that person moves In the cohort; TV remaining becomes 1.
11. Kill wifi on the TV (or stop the API) after a good load → remaining does **not** flash 0.

**Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(cohort): add coach intake link on home"
```

---

## Out of scope (do not build)

- Parent/athlete QR self-signup
- Waitlist count on the TV or public GET
- Creating rows in `athletes`
- CSV export, SMS, payments
- Websockets / SSE
- Multiple named cohorts
