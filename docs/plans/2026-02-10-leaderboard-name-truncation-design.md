# Leaderboard Name Truncation — Design

**Date:** 2026-02-10  
**Goal:** Truncate staff names to first-initial format (e.g., "J. Vaala") in leaderboard displays. On mobile, truncate all names to the same format to shorten text per card.

---

## 1. Overview and rules

**Scope:** Live leaderboard cards, Historical leaderboard cards, and Historical bar chart X-axis labels.

**Rules:**
1. **Staff:** Always display as first initial + last name (e.g., "Jon Vaala" → "J. Vaala") on all screen sizes.
2. **Athletes and alumni:** On desktop, show full name (e.g., "Sarah Johnson").
3. **Mobile:** On mobile, everyone uses first-initial format (e.g., "S. Johnson") regardless of athlete type.

**Format logic:** Given `first_name`, `last_name`, `athlete_type`, and `isMobile`:
- If staff → use `"X. LastName"`.
- Else if mobile → use `"X. LastName"` for everyone.
- Else → use `"FirstName LastName"`.

**Mobile breakpoint:** Use the same breakpoint as the card grid (`sm`, 640px): below 640px = mobile, above = desktop.

**Edge cases:**
- Empty `first_name`: display only `last_name` (e.g., "Smith").
- Empty `last_name`: display full `first_name` (e.g., "Jon").
- Both empty: return `""`.
- Null/undefined `athlete_type`: treat as `'athlete'` for backward compatibility.

---

## 2. API and data layer

**LeaderboardRow extension:** Add `athlete_type?: 'athlete' | 'staff' | 'alumni'` to `LeaderboardRow` in `src/types/index.ts`. Optional to maintain backward compatibility.

**API changes:**

1. **GET /api/leaderboard** (`src/app/api/leaderboard/route.ts`)
   - Add `a.athlete_type` to the SELECT in both CTEs (sortAsc and sortDesc).
   - Include `athlete_type: r.athlete_type ?? 'athlete'` when building `leaderboardRows`.

2. **GET /api/leaderboard/historical** (`src/app/api/leaderboard/historical/route.ts`)
   - Add `a.athlete_type` to the SELECT in both the Max Velocity and regular metric queries.
   - Ensure every returned row includes `athlete_type`.

**SQL:** The athletes table already has `athlete_type`; the CTEs join `athletes a`, so adding `a.athlete_type` to the SELECT list suffices. No migration required.

---

## 3. UI implementation

**Shared utility:** Create `formatLeaderboardName()` in `src/lib/display-names.ts`:

```ts
function formatLeaderboardName(
  first_name: string,
  last_name: string,
  athlete_type: 'athlete' | 'staff' | 'alumni' | undefined,
  isMobile: boolean
): string
```

- Staff → return `"X. LastName"`.
- Non-staff + mobile → same format.
- Non-staff + desktop → return `"FirstName LastName"`.
- Handle empty first/last names without producing invalid strings.

**Mobile detection:** Use a `useIsMobile()` hook that matches `(max-width: 639px)` (Tailwind `sm`). Place in `src/hooks/useMediaQuery.ts` or similar.

**Application points:**

1. **Live leaderboard** — `LeaderboardClient.tsx`: In `LeaderboardCard`, replace `{row.first_name} {row.last_name}` with `formatLeaderboardName(row.first_name, row.last_name, row.athlete_type, isMobile)`.
2. **Historical page** — `HistoricalClient.tsx`: Replace inline name concatenation with `formatLeaderboardName` for card-style name displays.
3. **Historical bar chart** — `HistoricalLeaderboardBar.tsx`: Replace `shortLabel()` with `formatLeaderboardName()`. Accept `isMobile` as a prop from the parent `HistoricalClient`.

**Accessibility:** When the displayed name is truncated, add `title={fullName}` so hover reveals the full name.

---

## 4. Edge cases and testing

**Edge cases:**
- Empty `first_name` → display only `last_name`.
- Empty `last_name` → display full `first_name`.
- Both empty → return `""`.
- Null/undefined `athlete_type` → treat as `'athlete'`.

**Testing:**
- Unit tests for `formatLeaderboardName`: staff vs athlete vs alumni, mobile vs desktop, empty names, null athlete_type.
- Integration: Verify `/api/leaderboard` and `/api/leaderboard/historical` return `athlete_type` for staff rows.
- Manual: Verify Live and Historical leaderboards on desktop and mobile with staff and athletes; verify bar chart labels and tooltips.

---

## 5. Files to modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `athlete_type` to `LeaderboardRow` |
| `src/app/api/leaderboard/route.ts` | Include `athlete_type` in SQL and response |
| `src/app/api/leaderboard/historical/route.ts` | Include `athlete_type` |
| `src/lib/display-names.ts` | New: `formatLeaderboardName` |
| `src/hooks/useMediaQuery.ts` | New: `useIsMobile` |
| `src/app/leaderboard/LeaderboardClient.tsx` | Use formatter in `LeaderboardCard` |
| `src/app/historical/HistoricalClient.tsx` | Use formatter for card names; pass `isMobile` to bar chart |
| `src/app/historical/HistoricalLeaderboardBar.tsx` | Use formatter for bar labels; accept `isMobile` prop |

---

## Summary

| Decision | Choice |
|----------|--------|
| Staff truncation | Always first initial + last name |
| Alumni truncation | Full name (no truncation by type) |
| Mobile truncation | All names truncated below 640px |
| Breakpoint | 640px (Tailwind `sm`) |
| API | Add `athlete_type` to leaderboard and historical responses |
| Tooltips | Add `title` with full name when truncated |
