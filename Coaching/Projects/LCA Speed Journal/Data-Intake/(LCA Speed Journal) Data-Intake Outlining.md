---
topic:
  - "[[+LCA Speed Journal]]"
tags:
related:
  - "[[(LCA Speed Journal) Data-Intake Implementation Plan]]"
  - "[[(LCA Speed Journal) Data-Intake Implementation]]"
---
created: 2026-01-02 06:19
modified: 2026-01-02 06:19
___
# Track & Field Metric Intake & Processing System

**Project Outline (Developer Documentation)**

## 1. Project Purpose

This project implements a **Streamlit-based data entry system** for Track & Field performance and health metrics. The system prioritizes:

- fast, low-friction data entry (desktop + mobile)
    
- structured, analysis-ready data storage
    
- flexible handling of complex metrics (splits, intervals, paired components)
    
- output to a centralized Google Sheet for downstream analysis
    

The system transforms **simple coach-entered values** into **fully enriched row-level data**, with explicit metadata describing session context, metric structure, and derived values.

---

## 2. High-Level Architecture

```
Streamlit App
│
├── Setup Page (Session Context)
│
├── Data Entry Page (Athlete + Metric + Values)
│
├── Metric Registry (static config)
│
├── Parsing & Expansion Engine
│
└── Google Sheets Output (append-only)
```

Core principle:

> **One output row = one meaningful, fully interpretable data point**

---

## 3. Metric Registry (Static Configuration)

The metric registry defines **what can be logged** and **how inputs are interpreted**.

### Metric Registry Schema

Each metric is defined with:

- `display_name` (string, unique key)
    
- `category` (Speed | X-Factor | Lactic)
    
- `subcategory` (Acceleration, MaxV, Vertical Jump, etc.)
    
- `input_units` (e.g. s, cm, N)
    
- `display_units` (e.g. mph, ft, %)
    
- `conversion_formula` (semantic identifier, not eval’d code)
    
- `input_structure` (controls parsing behavior)
    
- `default_splits` (optional, for cumulative metrics)
    

### Supported `input_structure` Values

|Structure|Description|
|---|---|
|`single_interval`|One scalar value applies to one interval or movement|
|`cumulative`|Pipe-separated cumulative values that expand into multiple intervals|
|`paired_components`|Pipe-separated component values (e.g. Left \| Right) with derived comparisons|

The metric registry is treated as **authoritative**; the app logic never hardcodes metric behavior.
(see also: [[(LCA Speed Journal) Current Metrics]])

---

## 4. Session Context (Per-Workout Metadata)

Session context is defined once per workout and **applied verbatim to every output row**.

### Session Context Schema

- `session_id` (string, auto-generated but editable)
    
- `session_date` (ISO date)
    
- `phase` (Preseason | Preparation | Competition | Championship)
    
- `phase_week` (int, 1–5)
    
- `day_categories` (pipe-delimited string)
    
- `day_metrics` (pipe-delimited list of metric keys)
    
- `day_metric_count` (int, derived)
    
- `day_splits` (JSON dict: metric_key → list[int], overrides defaults)
    
- `day_components` (JSON dict: metric_key → list[str], for paired metrics)
    
- `session_notes` (free text)
    

Session context is **immutable after setup** and is denormalized into every output row for analysis simplicity.
(see also: [[(LCA Speed Journal) Current Session-Context Schema]])

---

## 5. Streamlit UI Design

### Page 1 — Setup

- Session metadata (date, phase, week)
    
- Metric category selection
    
- “Metrics of Today” multi-select (filtered by category)
    
- Optional overrides:
    
    - split distances (per cumulative metric)
        
    - component labels (per paired metric)
        
- Session notes
    

### Page 2 — Data Entry

Repeated fast-entry loop:

- Athlete selector
    
- Metric selector (constrained to “Metrics of Today”)
    
- Value input (pipe-separated)
    
- Submit → immediate expansion & write to Google Sheet
    (see also: [[(LCA Speed Journal) Current Data-Entry Row-Schema]])

The UI never exposes metric logic; it only enforces structure.

---

## 6. Parsing & Expansion Engine (Core Logic)

The parser consumes:

- Session context
    
- Metric definition
    
- Athlete metadata
    
- Raw input values
    

### Expansion Rules

#### `single_interval`

- Generates **1 row**
    
- Interval metadata populated if applicable
    

#### `cumulative`

- Uses default or session-level splits
    
- Expands into:
    
    - cumulative subtotals (e.g. 0–10, 0–20)
        
    - discrete splits (e.g. 10–20)
        
    - multi-segment aggregates (e.g. 10–30)
        
- Generates **N rows per entry**
    

#### `paired_components`

- Expands into:
    
    - one row per component (e.g. L, R)
        
    - one derived comparison row (e.g. asymmetry %)
        
- No distance metadata applied
    

All conversions are performed via **predefined functions**, keyed by `conversion_formula`.

---

## 7. Google Sheet Row Schema (Final Output)

Each row contains:

### Session Metadata

- `session_id`
    
- `session_date`
    
- `phase`
    
- `phase_week`
    
- `day_categories`
    
- `session_notes`
    

### Athlete Metadata

- `athlete_name`
    
- `athlete_gender`
    

### Metric Metadata

- `metric_key`
    
- `metric_category`
    
- `metric_subcategory`
    
- `input_structure`
    

### Interval Metadata (distance-based metrics)

- `interval_start_m`
    
- `interval_end_m`
    
- `interval_distance_m`
    
- `interval_label`
    

### Component Metadata (paired metrics)

- `component_label` (e.g. L, R, L-R)
    
- `component_role` (primary | comparison)
    

### Values & Units

- `input_units`
    
- `display_units`
    
- `conversion_type`
    
- `input_value`
    
- `display_value`
    

### Provenance (optional but recommended)

- `entry_timestamp`
    
- `entered_by`
    

No row requires reconstruction to be understood in isolation.

---

## 8. Design Principles Enforced

- **Explicit over implicit** (intervals, components, units stored)
    
- **Denormalized for analysis**
    
- **No eval-based formulas**
    
- **Metric-driven logic**
    
- **Coach-facing simplicity, backend rigor**
    

---

## 9. Extensibility

This architecture supports future additions without schema changes:

- new metric types
    
- additional components (e.g. injured vs uninjured)
    
- new conversion formulas
    
- automated flags (e.g. asymmetry thresholds)
    
- dashboarding & longitudinal analysis
    

---

## 10. Current Project State

- Metric registry: defined
    
- Session context schema: defined
    
- Row schema: defined
    
- Parsing logic: specified (pending implementation)
    
- Streamlit UI: ready to implement
    

The project is now at the **implementation-ready** stage, with no unresolved data-model decisions.

---

If you want next, we can:

- translate this directly into module-level Python docstrings
    
- draft the parsing/expansion functions in pseudocode
    
- or design the Google Sheets append interface
    

Just say where you want to go next.