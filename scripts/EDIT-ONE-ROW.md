# Editing a single entry row

Use `UPDATE entries SET ... WHERE id = '...'` in your Postgres Query tab (Neon SQL Editor or Vercel Postgres).

## Example: Triple-Broad row

Row:

- `id`: `02192278-ea19-4368-86d2-3f99876fdfe5`
- `value`: 22.38, `display_value`: 6.82, `units`: ft, `raw_input`: 22.38

`6.82` is 22.38 ÷ 3.28, so the stored display value is wrong. Pick the case that matches how the jump was measured:

### Case A: The jump was **22.38 feet** (entered as feet)

**Option 1 — Store in feet (recommended):** value, display_value, raw_input, and units all agree.

```sql
UPDATE entries
SET display_value = 22.38,
    value = 22.38
WHERE id = '02192278-ea19-4368-86d2-3f99876fdfe5';
```

**Option 2 — Keep display_value 6.82 and label as meters:** 6.82 m = 22.38 ft, so if the leaderboard uses the entry’s `units` for display, it will show "6.82 m" (correct). value and raw_input stay 22.38 (feet). Only change units:

```sql
UPDATE entries
SET units = 'm'
WHERE id = '02192278-ea19-4368-86d2-3f99876fdfe5';
```

(If the leaderboard always shows the metric’s display_units (e.g. "ft" for Triple-Broad), use Option 1 so the number is correct in feet.)

### Case B: The jump was **22.38 meters** (entered as meters; convert to feet)

Use (3.281 matches `src/lib/conversions.ts`):

```sql
UPDATE entries
SET display_value = ROUND((22.38 * 3.281)::numeric, 4),
    value = 22.38
WHERE id = '02192278-ea19-4368-86d2-3f99876fdfe5';
```

Result: `display_value` ≈ 73.42 ft, `value` = 22.38 (meters kept for audit).

---

## Generic pattern

- **By id:**  
  `UPDATE entries SET display_value = <number>, value = <number>, units = '<ft|s|mph|...>' WHERE id = '<uuid>';`
- **By session + athlete + metric:**  
  `UPDATE entries SET display_value = <number>, value = <number>, units = '<units>' WHERE session_id = '<uuid>' AND athlete_id = '<uuid>' AND metric_key = '<key>';`

Run in a transaction if you want to check first:

```sql
BEGIN;
UPDATE entries SET ... WHERE id = '...';
-- SELECT * FROM entries WHERE id = '...';  -- verify
COMMIT;   -- or ROLLBACK;
```
