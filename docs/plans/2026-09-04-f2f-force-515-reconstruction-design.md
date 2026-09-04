# F2F Force 5–15 reconstruction — Design

**Date:** 2026-09-04  
**Status:** Validated  
**Companion:** [2026-09-03-force-to-form-design.md](./2026-09-03-force-to-form-design.md) · [2026-09-04-f2f-force-515-reconstruction-implementation.md](./2026-09-04-f2f-force-515-reconstruction-implementation.md)

**Goal:** Stop treating a journal `5-10yd` (5 yards) mph as Villani’s 5–15 fly (10 yards). When 5–10 and 10–20 both exist, reconstruct a hypothetical 5–15 **time**, look that time up on the XPE Force table, and store **mph** on the vertex for later force-velocity work.

---

## 1. Decisions

| Topic | Decision |
|--------|----------|
| Lookup key | Villani `fly-5-15.json` on **`time_s`**, not mph |
| mph | Computed and stored on the Force vertex; not the lookup key |
| Reconstruction | Constant acceleration from 5 to 20, fitted to both splits; read time to 10 yd from the 5yd mark |
| Display | Reconstructed fly is `projected: true`; `input` is the synthesized 5–15 time (plus mph) |
| In-season 15yd | Timed `5-15yd` (10-yard fly) is the top rung; not projected |
| Fallback ladder | Timed 5–15 → reconstructed 5–15 → 5–10 mph bridge → `0-20yd` stand-in |
| 0–5 | Not used in v1 |
| Form | Unchanged. `10-20yd` is Form proxy only when 20–40 / 30–40 / 20–30 are missing |

**Success criteria**

- A 0/5/10/20/40 battery produces a Force vertex from reconstructed 5–15 time, not from 5–10 mph.
- That reconstructed time is **slower** than `t(5–10) + ½ t(10–20)` when the athlete is still accelerating (`t(10–20) < 2 t(5–10)`).
- A timed `5-15yd` beats reconstruction. 5–10 without 10–20 still mph-bridges. Degenerate kinematics fall to the next rung.
- Stored mph equals `mphFromYardSplit(t_*, 10)` for the reconstructed (or timed) 10-yard fly.
- Form, sprint-anchor, court 20yd stand-in, gender, and themes behave as in the parent F2F design.

**Out of scope**

- Female XPE table, `/norms` editor, 0–5 in the fit
- Form model changes, live force-velocity charts, PDF triangles

---

## 2. Why the current mapping is harsh

Journal `5-10yd` is **5 yards**. Villani “5-10 Fly” is a **10-yard** fly from 5 to 15. We convert 5–10 to mph and read the Force mph curve 1:1.

Average speed over 5–10 is lower than average speed over 5–15 while the athlete is still accelerating. Force looks worse than Villani intended. Adding half of 10–20 would overcorrect (constant speed on 10–20). Constant *a* from 5–20 sits between those.

---

## 3. Kinematics

From the 5yd mark, \(x(t) = v_5 t + \tfrac12 a t^2\).

Let \(t_1 = t(5\text{–}10)\) (5 yd) and \(t_2 = t(10\text{–}20)\) (10 yd), \(T = t_1 + t_2\) (15 yd from 5, i.e. the 20yd mark).

\[
5 = v_5 t_1 + \tfrac12 a t_1^2, \qquad 15 = v_5 T + \tfrac12 a T^2
\]

Solve \(v_5, a\). Then \(t_*\) is the positive root of \(10 = v_5 t_* + \tfrac12 a t_*^2\) with \(t_1 < t_* < T\).

- If \(t_2 = 2 t_1\), then \(a = 0\) and \(t_* = 2 t_1\).
- If \(t_2 < 2 t_1\) (faster second interval), \(a > 0\) and \(t(10\text{–}15) > \tfrac12 t_2\).

mph of the fly: `mphFromYardSplit(t_*, 10)`.

**Degenerate → null** (caller takes the next ladder rung): non-finite or non-positive \(t_1, t_2\); \(v_5 \le 0\); \(t_*\) missing, non-finite, or not in \((t_1, T)\). Never throw.

---

## 4. Engine

Pure helper e.g. `reconstructFiveFifteen(t5to10, t10to20): { timeS, mph } | null` in `src/lib/norms/f2f/`. `pickForce` in `profile.ts` and the Force choice in `pick-marks.ts` share the same ladder.

**Ladder**

1. Timed `5-15yd` (10 yd) → interpolate Villani on `time_s` → `projected: false`
2. `5-10yd` + `10-20yd` in the **picked** entry set → reconstruct → Villani on `time_s` → `projected: true`, `input.component` `5-15yd`, `input.value` \(t_*\), `input.units` `"s"`, vertex `mph` set
3. `5-10yd` only → existing mph bridge into the Force curve → `projected: false`
4. `0-20yd` on 20yd or 40yd dash → stand-in (unchanged)

Same-session (or same picked set) **best** 5–10 with **best** 10–20. Do not reconstruct across sessions unless Best/Latest already placed both splits in `entries`.

Timed and reconstructed 5–15 both look up **time**, not mph. React/PDF still do not invent `predicted_40`.

**Vertex:** keep `predicted_40`, `projected`, `extrapolated`, `input`, `session_date`; add optional `mph`. Cards already mute projected vertices.

**Form** is independent. On a 0/5/10/20/40 battery, Form uses 20–40; 10–20 only feeds Force reconstruction.

Fail-open of the parent F2F engine is unchanged.

---

## 5. Tests

In `src/lib/norms/f2f/`:

- Accelerating fixture (e.g. \(t_1=0.70\), \(t_2=1.30\)): \(t_* > 0.70 + 0.65\), \(t_* < T\); lookup uses time; mph matches `mphFromYardSplit`.
- Constant speed: \(t_2 = 2 t_1\) → \(t_* = 2 t_1\).
- Degenerate times → `null`; `pickForce` mph-bridges 5–10.
- Ladder: timed 5–15 wins; reconstruction beats 5–10-only; 5–10-only still mph-bridges.
- Existing sprint-anchor and court 20yd tests still pass.

---

## 6. Implementation order (suggested)

1. Helper + unit tests (reconstruction, degenerate, mph).
2. Villani Force lookup by `time_s` for timed and reconstructed 5–15; 5–10-only stays mph.
3. Wire `pickForce` ladder; vertex `mph` + projected input.
4. Align `pick-marks` / athlete modes so reconstruction only runs when both splits are picked.
5. Regression on profile, board, PDF; one-line parent design note.
