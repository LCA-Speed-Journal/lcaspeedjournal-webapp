# BTSN On-the-Spot Athlete Create Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let data-entry staff type a name that is not on the roster, create that person from an inline panel (first/last, M/F, alumni/staff, optional grade 9–12), then log the jump as usual.

**Architecture:** Pure helpers in `src/lib/quick-athlete.ts` own name parsing, school-year grade conversion, create payload, and listbox “Add” indexing. `POST /api/athletes` already inserts roster rows; relax the graduating-class requirement so walk-up current athletes can omit it. `EntryForm` adds an always-visible Add option and an inline panel that POSTs, mutates SWR athlete lists, and selects the new person. Leaderboard, metrics, and Manage Athletes stay unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, SWR, NextAuth credentials (coach PIN), Vercel Postgres (`sql` from `src/lib/db.ts`), Vitest.

**Working directory / git root:** this repo (`lcaspeedjournal-webapp-clean`, remote `LCA-Speed-Journal/lcaspeedjournal-webapp`). Run `npm test` and `npm run dev` from the repo root. Paths in tasks are relative to that root.

**Do not:** add a guest table or `athlete_type`; add a BTSN mode toggle; create the athlete only when the jump is saved; hide Add when matches exist; require graduating class in the quick panel; change leaderboard APIs; change Manage Athletes to make class year optional; auto-select Vertical Jump.

**Reference:** Design [docs/plans/2026-08-25-btsn-quick-athlete-create-design.md](./2026-08-25-btsn-quick-athlete-create-design.md). Patterns: `src/app/api/athletes/route.ts` (auth + `{ data }` / `{ error }`), `src/app/data-entry/EntryForm.tsx` (athlete combobox + SWR), `src/lib/display-names.test.ts` (Vitest style), `src/lib/leaderboard-sections.ts` (alumni = alumni or staff). Skills: @superpowers:test-driven-development @superpowers:executing-plans @vercel-react-best-practices

**School-year rule:** JavaScript months are 0-indexed. August–December (`month >= 7`) → school year ends `year + 1`. January–July → school year ends `year`. `graduating_class = schoolYearEnd + (12 - grade)`. Frozen example: 2026-08-25 → grade 12 = 2027, grade 9 = 2030.

---

### Task 1: Quick-athlete helpers (TDD)

**Files:**
- Create: `src/lib/quick-athlete.ts`
- Test: `src/lib/quick-athlete.test.ts`

**Step 1: Write the failing test**

Create `src/lib/quick-athlete.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseNameFromQuery,
  gradeToGraduatingClass,
  resolveGraduatingClass,
  buildAthleteCreatePayload,
  addOptionVisible,
  pickerOptionCount,
  isAddOptionIndex,
  nextHighlightIndex,
} from "./quick-athlete";

describe("parseNameFromQuery", () => {
  it("splits on the first space", () => {
    expect(parseNameFromQuery("Jordan Smith")).toEqual({
      first: "Jordan",
      last: "Smith",
    });
  });

  it("leaves last empty for a one-word name", () => {
    expect(parseNameFromQuery("Jordan")).toEqual({
      first: "Jordan",
      last: "",
    });
  });

  it("puts remaining words in last after the first space", () => {
    expect(parseNameFromQuery("Mary Ann Smith")).toEqual({
      first: "Mary",
      last: "Ann Smith",
    });
  });

  it("trims the query and each part", () => {
    expect(parseNameFromQuery("  Jordan   Smith  ")).toEqual({
      first: "Jordan",
      last: "Smith",
    });
  });

  it("returns empty parts for blank input", () => {
    expect(parseNameFromQuery("   ")).toEqual({ first: "", last: "" });
  });
});

describe("gradeToGraduatingClass", () => {
  const btsnNight = new Date("2026-08-25T18:00:00");

  it("maps 9–12 for August 2026 (school year ending 2027)", () => {
    expect(gradeToGraduatingClass(12, btsnNight)).toBe(2027);
    expect(gradeToGraduatingClass(11, btsnNight)).toBe(2028);
    expect(gradeToGraduatingClass(10, btsnNight)).toBe(2029);
    expect(gradeToGraduatingClass(9, btsnNight)).toBe(2030);
  });

  it("keeps the same school-year end in January of the following calendar year", () => {
    expect(gradeToGraduatingClass(12, new Date("2027-01-15T12:00:00"))).toBe(2027);
    expect(gradeToGraduatingClass(9, new Date("2027-01-15T12:00:00"))).toBe(2030);
  });

  it("returns null for grades outside 9–12", () => {
    expect(gradeToGraduatingClass(8, btsnNight)).toBeNull();
    expect(gradeToGraduatingClass(13, btsnNight)).toBeNull();
  });
});

describe("resolveGraduatingClass", () => {
  it("returns null for alumni regardless of class year", () => {
    expect(resolveGraduatingClass("alumni", 2027)).toBeNull();
  });

  it("returns null when a current athlete omits class year", () => {
    expect(resolveGraduatingClass("athlete", null)).toBeNull();
    expect(resolveGraduatingClass("athlete", "")).toBeNull();
    expect(resolveGraduatingClass("athlete", undefined)).toBeNull();
  });

  it("parses a numeric class year for current athletes", () => {
    expect(resolveGraduatingClass("athlete", 2029)).toBe(2029);
    expect(resolveGraduatingClass("athlete", "2029")).toBe(2029);
  });

  it("returns null for non-numeric class year", () => {
    expect(resolveGraduatingClass("athlete", "nope")).toBeNull();
  });
});

describe("buildAthleteCreatePayload", () => {
  const now = new Date("2026-08-25T18:00:00");

  it("builds an athlete without graduating_class when grade is omitted", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: " Jordan ",
        lastName: " Smith ",
        gender: "F",
        alumniStaff: false,
        grade: null,
        now,
      })
    ).toEqual({
      first_name: "Jordan",
      last_name: "Smith",
      gender: "F",
      athlete_type: "athlete",
    });
  });

  it("adds graduating_class from grade 9–12 for current athletes", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: "Jordan",
        lastName: "Smith",
        gender: "M",
        alumniStaff: false,
        grade: 10,
        now,
      }).graduating_class
    ).toBe(2029);
  });

  it("stores alumni and ignores grade", () => {
    expect(
      buildAthleteCreatePayload({
        firstName: "Pat",
        lastName: "Lee",
        gender: "M",
        alumniStaff: true,
        grade: 12,
        now,
      })
    ).toEqual({
      first_name: "Pat",
      last_name: "Lee",
      gender: "M",
      athlete_type: "alumni",
    });
  });
});

describe("athlete picker add option", () => {
  it("hides Add when the query is blank", () => {
    expect(addOptionVisible("")).toBe(false);
    expect(addOptionVisible("   ")).toBe(false);
    expect(pickerOptionCount(5, "")).toBe(5);
    expect(isAddOptionIndex(5, 5, "")).toBe(false);
  });

  it("appends Add after matches when the query has text", () => {
    expect(addOptionVisible("Jordan")).toBe(true);
    expect(pickerOptionCount(2, "Jordan")).toBe(3);
    expect(isAddOptionIndex(2, 2, "Jordan")).toBe(true);
    expect(isAddOptionIndex(0, 2, "Jordan")).toBe(false);
  });

  it("treats Add as index 0 when there are no matches", () => {
    expect(pickerOptionCount(0, "Jordan")).toBe(1);
    expect(isAddOptionIndex(0, 0, "Jordan")).toBe(true);
  });

  it("wraps highlight indexes over matches plus Add", () => {
    expect(nextHighlightIndex(0, 3, 1)).toBe(1);
    expect(nextHighlightIndex(2, 3, 1)).toBe(0);
    expect(nextHighlightIndex(0, 3, -1)).toBe(2);
    expect(nextHighlightIndex(0, 0, 1)).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/quick-athlete.test.ts`

Expected: FAIL with cannot find module `./quick-athlete` (or named exports missing).

**Step 3: Write minimal implementation**

Create `src/lib/quick-athlete.ts`:

```ts
export type AthleteCreateGender = "M" | "F";

export function parseNameFromQuery(query: string): { first: string; last: string } {
  const trimmed = query.trim();
  if (!trimmed) return { first: "", last: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { first: trimmed, last: "" };
  return {
    first: trimmed.slice(0, space).trim(),
    last: trimmed.slice(space + 1).trim(),
  };
}

export function schoolYearEnd(now: Date): number {
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? year + 1 : year;
}

export function gradeToGraduatingClass(
  grade: number,
  now: Date = new Date()
): number | null {
  if (grade !== 9 && grade !== 10 && grade !== 11 && grade !== 12) return null;
  return schoolYearEnd(now) + (12 - grade);
}

export function resolveGraduatingClass(
  athleteType: string,
  graduatingClass: unknown
): number | null {
  if (athleteType !== "athlete") return null;
  if (graduatingClass == null || graduatingClass === "") return null;
  const n = Number(graduatingClass);
  return Number.isFinite(n) ? n : null;
}

export function buildAthleteCreatePayload(input: {
  firstName: string;
  lastName: string;
  gender: AthleteCreateGender;
  alumniStaff: boolean;
  grade: number | null;
  now?: Date;
}): {
  first_name: string;
  last_name: string;
  gender: AthleteCreateGender;
  athlete_type: "athlete" | "alumni";
  graduating_class?: number;
} {
  const athlete_type = input.alumniStaff ? "alumni" : "athlete";
  const payload: {
    first_name: string;
    last_name: string;
    gender: AthleteCreateGender;
    athlete_type: "athlete" | "alumni";
    graduating_class?: number;
  } = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    gender: input.gender,
    athlete_type,
  };
  if (athlete_type === "athlete") {
    const grad =
      input.grade == null
        ? null
        : gradeToGraduatingClass(input.grade, input.now ?? new Date());
    if (grad != null) payload.graduating_class = grad;
  }
  return payload;
}

export function addOptionVisible(query: string): boolean {
  return query.trim().length > 0;
}

export function pickerOptionCount(matchCount: number, query: string): number {
  return matchCount + (addOptionVisible(query) ? 1 : 0);
}

export function isAddOptionIndex(
  highlightedIndex: number,
  matchCount: number,
  query: string
): boolean {
  return addOptionVisible(query) && highlightedIndex === matchCount;
}

export function nextHighlightIndex(
  current: number,
  optionCount: number,
  direction: 1 | -1
): number {
  if (optionCount <= 0) return 0;
  return (current + direction + optionCount) % optionCount;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/quick-athlete.test.ts`

Expected: PASS (all tests in that file).

**Step 5: Commit**

```bash
git add src/lib/quick-athlete.ts src/lib/quick-athlete.test.ts
git commit -m "feat: add BTSN quick-athlete name, grade, and picker helpers"
```

---

### Task 2: Allow POST `/api/athletes` without graduating_class

**Files:**
- Modify: `src/app/api/athletes/route.ts` (POST handler, lines 86–145)
- Use: `src/lib/quick-athlete.ts` (`resolveGraduatingClass`)

Manage Athletes still sends `graduating_class` for `athlete_type === "athlete"`. Do not change `src/app/athletes/AthleteForm.tsx`.

**Step 1: Replace the graduating_class gate and Number() call**

In `src/app/api/athletes/route.ts`, add the import at the top (after existing imports):

```ts
import { resolveGraduatingClass } from "@/lib/quick-athlete";
```

Delete this block from `POST`:

```ts
    if (type === "athlete" && (graduating_class == null || graduating_class === "")) {
      return NextResponse.json(
        { error: "Athletes require graduating_class" },
        { status: 400 }
      );
    }

    const gradClass =
      type === "athlete" ? Number(graduating_class) : null;
```

Replace with:

```ts
    const gradClass = resolveGraduatingClass(type, graduating_class);
```

Keep the existing required-field check for `first_name`, `last_name`, `gender`. Keep `INSERT ... athlete_type, active` with `gradClass` (now allowed to be `null`). Keep the legacy fallback that only runs when `type === "athlete" && gradClass != null` — unmigrated DBs cannot insert a class-less athlete, and we are not adding a second fallback (YAGNI; production already has `athlete_type`).

The POST body after the required-field check should read:

```ts
    const type = athlete_type ?? "athlete";

    if (!first_name || !last_name || !gender) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, gender" },
        { status: 400 }
      );
    }

    const gradClass = resolveGraduatingClass(type, graduating_class);

    try {
      const { rows } = await sql`
        INSERT INTO athletes (first_name, last_name, gender, graduating_class, athlete_type, active)
        VALUES (${first_name}, ${last_name}, ${gender}, ${gradClass}, ${type}, true)
        RETURNING id, first_name, last_name, gender, graduating_class, athlete_type, active, created_at
      `;
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (insertErr) {
      // existing legacy fallback unchanged
```

**Step 2: Run unit tests**

Run: `npm test -- src/lib/quick-athlete.test.ts`

Expected: PASS. There is no route-level Vitest harness; `resolveGraduatingClass` is the regression net for this API change.

**Step 3: Commit**

```bash
git add src/app/api/athletes/route.ts
git commit -m "feat: allow creating athletes without graduating class"
```

---

### Task 3: Always-visible Add row + inline panel (no POST yet)

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx`

This task wires the dropdown and panel shell. Create is still a no-op until Task 4 — but the Create button should exist and be `type="button"` so it never submits the jump form. Prefer implementing Create in Task 4 immediately after this; do not ship a session with a dead Create button.

**Step 1: Import helpers and add panel state**

At the top of `EntryForm.tsx`, extend the existing imports:

```ts
import {
  addOptionVisible,
  isAddOptionIndex,
  nextHighlightIndex,
  parseNameFromQuery,
  pickerOptionCount,
} from "@/lib/quick-athlete";
```

Inside `EntryForm`, after `listboxRef`, add:

```ts
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickFirst, setQuickFirst] = useState("");
  const [quickLast, setQuickLast] = useState("");
  const [quickGender, setQuickGender] = useState<"M" | "F">("M");
  const [quickAlumni, setQuickAlumni] = useState(false);
  const [quickGrade, setQuickGrade] = useState<"" | "9" | "10" | "11" | "12">("");
```

After `filteredAthletes`, add:

```ts
  const showAddOption = addOptionVisible(athleteQuery);
  const optionCount = pickerOptionCount(filteredAthletes.length, athleteQuery);
  const addHighlighted = isAddOptionIndex(
    highlightedIndex,
    filteredAthletes.length,
    athleteQuery
  );
```

**Step 2: Open / close the panel**

Add callbacks next to `selectAthlete`:

```ts
  const closeQuickCreate = useCallback(() => {
    setQuickCreateOpen(false);
    setQuickFirst("");
    setQuickLast("");
    setQuickGender("M");
    setQuickAlumni(false);
    setQuickGrade("");
  }, []);

  const openQuickCreate = useCallback(() => {
    const parsed = parseNameFromQuery(athleteQuery);
    setQuickFirst(parsed.first);
    setQuickLast(parsed.last);
    setQuickGender("M");
    setQuickAlumni(false);
    setQuickGrade("");
    setQuickCreateOpen(true);
    setDropdownOpen(false);
    setHighlightedIndex(0);
  }, [athleteQuery]);
```

When the search `onChange` fires, close the panel (staff are searching again):

```ts
            onChange={(e) => {
              setAthleteQuery(e.target.value);
              setSelectedAthlete(null);
              setDropdownOpen(true);
              setQuickCreateOpen(false);
            }}
```

**Step 3: Keyboard — wrap over matches + Add; Enter on Add opens the panel**

Replace the ArrowDown / ArrowUp / Enter handlers with:

```ts
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((i) => nextHighlightIndex(i, optionCount, 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((i) => nextHighlightIndex(i, optionCount, -1));
                return;
              }
              if (e.key === "Enter") {
                if (addHighlighted) {
                  e.preventDefault();
                  openQuickCreate();
                  return;
                }
                if (filteredAthletes[highlightedIndex]) {
                  e.preventDefault();
                  selectAthlete(filteredAthletes[highlightedIndex]);
                }
              }
```

`optionCount` and `addHighlighted` / `openQuickCreate` are in the component body; the `onKeyDown` closure sees the latest render. That is enough — do not extract a `useCallback` that would stale-close over `filteredAthletes`.

Update `aria-activedescendant`:

```ts
            aria-activedescendant={
              dropdownOpen && addHighlighted
                ? "entry_athlete_option_add"
                : dropdownOpen && filteredAthletes[highlightedIndex]
                  ? `entry_athlete_option_${filteredAthletes[highlightedIndex].id}`
                  : undefined
            }
```

Update the scroll-into-view effect so Add can scroll into view:

```ts
  useEffect(() => {
    const id = addHighlighted
      ? "entry_athlete_option_add"
      : filteredAthletes[highlightedIndex]
        ? `entry_athlete_option_${filteredAthletes[highlightedIndex].id}`
        : null;
    if (!id) return;
    const el = listboxRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, filteredAthletes, addHighlighted]);
```

**Step 4: Render matches, empty hint, and Add**

Replace the listbox children (`filteredAthletes.length === 0 ? empty : map`) with:

```ts
              {filteredAthletes.length === 0 ? (
                <li className="px-3 py-2 text-sm text-foreground-muted" role="presentation">
                  No athletes match
                </li>
              ) : (
                filteredAthletes.map((a, i) => (
                  <li
                    key={a.id}
                    id={`entry_athlete_option_${a.id}`}
                    role="option"
                    aria-selected={selectedAthlete?.id === a.id}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      i === highlightedIndex
                        ? "bg-accent/20 text-foreground"
                        : "text-foreground hover:bg-surface"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectAthlete(a);
                    }}
                  >
                    {athleteDisplayName(a)}
                  </li>
                ))
              )}
              {showAddOption ? (
                <li
                  id="entry_athlete_option_add"
                  role="option"
                  aria-selected={addHighlighted}
                  className={`cursor-pointer px-3 py-2 text-sm font-medium ${
                    addHighlighted
                      ? "bg-accent/20 text-foreground"
                      : "text-accent hover:bg-surface"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    openQuickCreate();
                  }}
                >
                  Add {athleteQuery.trim()}…
                </li>
              ) : null}
```

`onMouseDown` + `preventDefault` is required so the existing 150ms `onBlur` close does not steal the click.

**Step 5: Render the inline panel under the combobox `</div>` (still inside the Athlete `<div>`)**

Insert after the combobox relative wrapper closes, still inside the Athlete field section, before the Metric block:

```tsx
        {quickCreateOpen ? (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface-elevated p-3">
            <p className="text-sm font-medium text-foreground">New athlete</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="quick_first" className="mb-1 block text-xs text-foreground-muted">
                  First name
                </label>
                <input
                  id="quick_first"
                  type="text"
                  value={quickFirst}
                  onChange={(e) => setQuickFirst(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="quick_last" className="mb-1 block text-xs text-foreground-muted">
                  Last name
                </label>
                <input
                  id="quick_last"
                  type="text"
                  value={quickLast}
                  onChange={(e) => setQuickLast(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="quick_gender" className="mb-1 block text-xs text-foreground-muted">
                  M / F
                </label>
                <select
                  id="quick_gender"
                  value={quickGender}
                  onChange={(e) => setQuickGender(e.target.value as "M" | "F")}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
                <input
                  type="checkbox"
                  checked={quickAlumni}
                  onChange={() => {
                    setQuickAlumni((v) => {
                      const next = !v;
                      if (next) setQuickGrade("");
                      return next;
                    });
                  }}
                  className="rounded border-border bg-surface text-accent focus:ring-accent"
                />
                <span className="text-sm text-foreground">Alumni/staff</span>
              </label>
              {!quickAlumni ? (
                <div className="col-span-2">
                  <label htmlFor="quick_grade" className="mb-1 block text-xs text-foreground-muted">
                    Grade (optional)
                  </label>
                  <select
                    id="quick_grade"
                    value={quickGrade}
                    onChange={(e) =>
                      setQuickGrade(e.target.value as "" | "9" | "10" | "11" | "12")
                    }
                    className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  >
                    <option value="">Skip</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                  </select>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!quickFirst.trim() || !quickLast.trim()}
                className="min-h-[44px] flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={closeQuickCreate}
                className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
```

**Step 6: Run unit tests (helpers unchanged)**

Run: `npm test -- src/lib/quick-athlete.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/app/data-entry/EntryForm.tsx
git commit -m "feat: add inline Add-athlete panel on data-entry search"
```

---

### Task 4: Panel Create POSTs and selects the new athlete

**Files:**
- Modify: `src/app/data-entry/EntryForm.tsx`

**Step 1: Import payload helper and add create state**

Add `buildAthleteCreatePayload` to the existing `@/lib/quick-athlete` import.

Add state:

```ts
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState("");
```

Reset `quickCreateError` in `openQuickCreate` and `closeQuickCreate`.

**Step 2: Implement `submitQuickCreate`**

Place this function in `EntryForm` (after `selectAthlete` / `openQuickCreate`):

```ts
  async function submitQuickCreate() {
    const first = quickFirst.trim();
    const last = quickLast.trim();
    if (!first || !last || quickCreating) return;
    setQuickCreateError("");
    setQuickCreating(true);
    try {
      const payload = buildAthleteCreatePayload({
        firstName: first,
        lastName: last,
        gender: quickGender,
        alumniStaff: quickAlumni,
        grade: quickAlumni || quickGrade === "" ? null : Number(quickGrade),
      });
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setQuickCreateError(json.error ?? "Failed to create athlete");
        return;
      }
      const created = json.data as AthleteItem;
      selectAthlete(created);
      closeQuickCreate();
      void globalMutate("/api/athletes");
      void globalMutate("/api/athletes?active=true");
    } catch {
      setQuickCreateError("Network error");
    } finally {
      setQuickCreating(false);
    }
  }
```

`closeQuickCreate` currently clears fields; call `selectAthlete` **before** `closeQuickCreate` so the selected name remains. If `closeQuickCreate` is in the same tick after `selectAthlete`, that is fine — it does not clear `selectedAthlete`.

**Step 3: Prevent jump-save when the panel is open**

Replace `handleSubmit`:

```ts
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quickCreateOpen) {
      void submitQuickCreate();
      return;
    }
    void submitEntry();
  }
```

Wire the Create button:

```tsx
              <button
                type="button"
                disabled={
                  quickCreating || !quickFirst.trim() || !quickLast.trim()
                }
                onClick={() => void submitQuickCreate()}
                className="min-h-[44px] flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
              >
                {quickCreating ? "Creating…" : "Create"}
              </button>
```

Show errors above the buttons:

```tsx
            {quickCreateError ? (
              <p className="text-sm text-danger" role="alert">
                {quickCreateError}
              </p>
            ) : null}
```

**Step 4: Run tests**

Run: `npm test`

Expected: PASS (full suite, including `src/lib/quick-athlete.test.ts`).

**Step 5: Commit**

```bash
git add src/app/data-entry/EntryForm.tsx
git commit -m "feat: create walk-up athletes from data-entry and select them"
```

---

### Task 5: Browser smoke test (data-entry + live leaderboard)

**Files:** none (manual). Uses existing `/data-entry` and `/leaderboard`.

EntryForm is also mounted from `src/app/data-entry/session/[id]/EditSessionClient.tsx` — one of the two surfaces is enough if the same component is confirmed.

**Step 1: Start the app**

Run: `npm run dev`

Log in with the coach PIN. Open `/data-entry`. Pick (or create) a session that includes **Vertical Jump**.

**Step 2: Existing search still works**

- Type a roster name. Matches appear. Enter / click selects them. Clear works. Active only still filters.

**Step 3: Add appears even when matches exist**

- Type a last name that already matches someone. Confirm the last row is `Add {query}…`.

**Step 4: Create a current athlete (no grade)**

- Type a unique name (e.g. `Btsn Walkup`). Open Add. Confirm First/Last prefill. Leave grade as Skip. Choose F. Create.
- Confirm the Athlete field shows `Btsn Walkup`, panel closes, metric/value are untouched.
- Enter a Vertical Jump value and Save. Open `/leaderboard` for that session, Vertical Jump, Group by gender on. Confirm they appear in **Girls** (Athletes, not Alumni).

**Step 5: Create with grade 10**

- Add `Grade Ten`. Grade 10, M. Create. In Manage Athletes (`/athletes`) confirm they exist, active, gender M. Class year should be 2029 if today is still in the 2026–27 school year (August 2026–July 2027).

**Step 6: Create alumni**

- Add `Alumni Parent`. Check Alumni/staff (grade hidden). Create. Save a jump. Leaderboard with Split alumni on: they appear under **Alumni**, not Athletes.

**Step 7: Cancel and validation**

- Open Add, tap Cancel — no new roster row. Create stays disabled until both names are filled. A one-word query leaves Last blank until filled.

**Step 8: No commit unless a bugfix was required**

If a bug was found, fix it, re-run `npm test`, re-verify the failed path, then commit the fix with a message that says why (e.g. `fix: keep Add click from blurring the athlete combobox`).

---

## Execution notes

- TDD applies to Task 1 (and the `resolveGraduatingClass` coverage that protects Task 2). Tasks 3–4 are UI on an untested client component; keep logic in `quick-athlete.ts` rather than duplicating parse/grade rules in JSX.
- React 19: no `forwardRef`. Do not add `useMemo` around `parseNameFromQuery` or `pickerOptionCount` — they are cheap primitives (@vercel-react-best-practices 5.3).
- Do not use `{count && <X/>}` in the panel; grade options are strings.
- Duplicate full names are allowed; there is no unique index on `athletes` names.
)
