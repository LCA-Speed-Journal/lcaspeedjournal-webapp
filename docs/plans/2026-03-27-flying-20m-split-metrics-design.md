# Design: Split-based Flying 20m metrics

**Date:** 2026-03-27  
**Project:** `lcaspeedjournal-webapp-clean`  
**Scope:** Add split-based Flying 20m support with manual + derived paths; keep YAGNI on schema and parser architecture.

## 1. Problem framing, goals, and decision

The current metrics registry supports `10-30m_Split` but does not register `20-40m_Split`, `30-50m_Split`, or `40-60m_Split`. Because parser emission of dedicated split rows is registry-driven, these missing keys prevent first-class 20m fly windows from being stored and surfaced consistently, even when cumulative inputs contain the underlying segment data. In practice, this creates inconsistent behavior: coaches can sometimes infer fly windows from components, but cannot reliably query, compare, or rank them as explicit split metrics across all API/UI paths.

Design decision (validated): treat Flying 20m as split-based metrics only (no dedicated `20m_Fly` metric key), and support both direct manual entry and parser-derived generation from cumulative/segment input. This preserves existing usage patterns, avoids dual-concept drift (`20m_Fly` vs `20-40m_Split`), and uses the current parser architecture rather than introducing a new metric type.  

Goals:
- Add explicit support for `20-40m_Split`, `30-50m_Split`, `40-60m_Split`.
- Keep compatibility with current `10-30m_Split` behavior.
- Ensure derived rows appear when cumulative inputs provide valid distances.
- Ensure manual entry remains valid for these keys.

Non-goals:
- Introducing a new canonical fly metric family.
- Database schema migration.
- Large historical backfill as part of initial rollout.

## 2. Approaches considered and recommended path

**Recommended approach: registry-first expansion with parser test hardening.**  
Add the missing split keys to `src/lib/metrics.json`, keep parser logic unchanged unless tests reveal a gap, and expand tests to codify both generation paths. This is the smallest high-confidence change because `parseCumulative` already computes adjacent and non-adjacent split intervals and then conditionally emits dedicated `*_Split` rows when keys exist. Making keys explicit allows existing endpoints/UI to treat the new fly windows as first-class metrics.

**Alternative A: derived-only 20m fly windows.**  
Only allow parser-generated split rows from cumulative inputs. This could improve data consistency but breaks current user workflow where coaches may enter fly splits directly and would require additional UI/API validation logic to block manual entry.

**Alternative B: dedicated `20m_Fly` key with mapping.**  
Create a new metric family and map to split windows. This adds model complexity, duplication in analytics/labels, and migration ambiguity (which source of truth wins when both exist). It is not needed for current goals.

Why recommended:
- Minimal code surface area.
- Aligns with existing split key semantics.
- Avoids introducing additional query normalization.
- Easier to test deterministically.

## 3. Architecture, data flow, risks, and verification strategy

Data flow remains unchanged structurally:
1. Entry UI submits direct split metric values or cumulative/segment values.
2. `src/lib/parser.ts` emits normalized entry rows.
3. `entries` rows are stored with `metric_key`, `component`, `interval_index`.
4. Leaderboard/session/historical endpoints read these rows.
5. UI renders metric options and results from endpoint payloads.

The design change is to widen the metric registry so parser emission and downstream consumers recognize the new split keys as explicit metrics rather than only parent-metric components. This is important because several historical/PR paths apply primary-component filtering for cumulative parents; first-class split metrics avoid accidental suppression that can happen when relying only on component rows.

Primary risks:
- Labeling inconsistencies in dropdowns if display names are not aligned with existing split naming.
- Test blind spots where non-adjacent 20m windows may not be generated for certain split configs.
- Potential confusion if old sessions have no derived rows for newly supported keys.

Verification focus:
- Parser unit tests for manual and derived pathways.
- API smoke checks for metric discovery and leaderboard queryability.
- Historical/PR path checks to confirm split metrics appear as standalone keys.

Follow-up (optional, separate from MVP): a backfill script to derive and insert missing historical 20m split rows from existing cumulative entries.
