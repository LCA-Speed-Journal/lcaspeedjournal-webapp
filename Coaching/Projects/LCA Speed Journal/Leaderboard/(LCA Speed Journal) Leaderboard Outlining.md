---
topic:
  - "[[+LCA Speed Journal]]"
tags:
related:
  - "[[(LCA Speed Journal) Leaderboard Implementation Plan]]"
---
created: 2026-01-02 06:21
modified: 2026-01-02 06:21
___
(as pasted from generated-content)
# Track & Field Metric Leaderboard Visualization
## 1. Project Purpose
This project implements a Streamlit-based visualization tool for Track & Field performance data. The application reads metric data from a Google Sheet and displays session-based leaderboards that rank athletes by their **best performance** in each metric.

The primary goals are:
- Clear, coach-friendly visualization of performance metrics
- Fair comparison by ranking athletes **within gender**
- Emphasis on best marks rather than raw attempt volume
- Minimal downstream computation (data is leaderboard-ready on ingestion)
---
## 2. Data Source & Assumptions
### 2.1 Source
- Google Sheet (accessed via Google Sheets API / `gspread`)
- Each row represents **one attempt-derived metric value** for one athlete
### 2.2 Key Assumptions
- `display_value` is **always present** and is the value used for ranking
- Unit conversions and split calculations are handled upstream
- Multiple attempts per athlete per metric may exist
- Sorting direction is derived from `display_units` (not explicitly stored)
---
## 3. Data Model (Row-Level Schema)
Each row contains:
### Session Context
- `session_id`  
- `session_date`
- `phase`, `phase_week`
- `day_categories`
- `session_notes`
### Metric Metadata
- `metric_category`
- `metric_subcategory`
- `metric_key`
- `metric_structure` (single-interval vs cumulative; metadata only)
### Interval Metadata
- `interval_label`
- `interval_start_m`, `interval_end_m`, `interval_distance_m`
### Units & Conversions
- `input_units`
- `display_units`
- `conversion_type`
### Athlete Metadata
- `athlete_name`
- `athlete_gender`
- `athlete_grade`
### Values
- `input_value`
- `display_value`
### Entry Context
- `entry_timestamp`
- `entered_by`

---

## 4. Leaderboard Definition

A **leaderboard** is defined as a group of rows sharing the following key:

```python
LEADERBOARD_KEY = [
    "session_id",
    "metric_key",
    "interval_label",
    "display_units"
]
```

Each leaderboard corresponds to:

- One metric
    
- One interval (if applicable)
    
- One session/day
    
- One unit context
    

---

## 5. Ranking Rules

### 5.1 Value Used for Ranking

- Rankings **always** use `display_value`
    
- `input_value` is ignored for visualization purposes
    

### 5.2 Sorting Direction

Derived from `display_units`:

- Time-based units (e.g. `s`, `ms`) → lower is better (ascending)
    
- Speed, distance, power units (e.g. `mph`, `m`, `cm`) → higher is better (descending)
    

This logic is implemented via a unit-to-sort-direction mapping.

---

## 6. Multiple Attempts Handling

Athletes may have multiple attempts per metric in a session.

**Rule:**

> Each athlete may appear at most once per leaderboard, represented by their single best attempt.

### Reduction Logic

Within each leaderboard group:

1. Group rows by `athlete_name`
    
2. Select the best row per athlete:
    
    - `idxmin(display_value)` for time-based units
        
    - `idxmax(display_value)` for distance/speed-based units
        
3. Discard all other attempts
    

After reduction:

- Each leaderboard contains **one row per athlete**
    
- Rankings are computed on this reduced dataset
    

---

## 7. Gender-Based Leaderboards

Leaderboards are split by gender to ensure fair comparison and visual clarity.

For each leaderboard:

1. Split reduced data into:
    
    - Boys (`athlete_gender == "M"`)
        
    - Girls (`athlete_gender == "F"`)
        
2. Rank athletes **within gender**
    
3. Select the **Top 9** athletes per gender
    

Each gender is rendered as a separate 3×3 grid.

---

## 8. Streamlit UI Structure

### 8.1 Page-Level Layout

- Session header (date, phase, week)
    
- Optional filters (session, category, gender)
    
- One collapsible section (`st.expander`) per leaderboard
    

### 8.2 Metric Sections

Each metric leaderboard is rendered inside an `st.expander` titled with:

```
<metric_key> — <interval_label> (<display_units>)
```

---

## 9. Leaderboard Visualization

### 9.1 Layout

Inside each expander:

- Two-column layout:
    
    - Left: Boys leaderboard (Top 9)
        
    - Right: Girls leaderboard (Top 9)
        

Each leaderboard:

- Fixed **3×3 grid**
    
- Rank order: left → right, top → bottom
    

### 9.2 Card Content

Each athlete card displays:

- **Primary value**: `display_value + display_units` (large, centered)
    
- **Rank**: small, upper-right corner
    
- **Athlete name**: bottom, gender-colored text
    

---

## 10. Visual Encoding Rules

### 10.1 Rank-Based Card Coloring

Card background color is determined by rank position:

|Rank / Row|Color|
|---|---|
|Rank 1|Gold|
|Rank 2|Silver|
|Rank 3|Bronze|
|Rank 4|Green|
|Row 2|Purple|
|Row 3|Blue|

This emphasizes placement without relying on numeric rank labels.

### 10.2 Gender Indication

Gender is indicated **only via athlete name text color**:

- Boys → dark blue
    
- Girls → dark pink
    

Rank and gender are intentionally encoded separately.

---

## 11. Data Processing Pipeline (End-to-End)

1. Read Google Sheet into pandas DataFrame
    
2. Filter by selected session/date
    
3. Group rows by `LEADERBOARD_KEY`
    
4. For each group:
    
    - Reduce to best attempt per athlete
        
    - Split by gender
        
    - Sort and rank within gender
        
    - Select Top 9
        
5. Render leaderboard grids in Streamlit
    

---

## 12. Design Philosophy

- Rows represent **attempt-derived metrics**
    
- Leaderboards represent **best performances**
    
- Visualization layer is intentionally “dumb”
    
- All heavy logic (splits, conversions, derivations) happens upstream
    
- UI prioritizes clarity, fairness, and motivation for athletes
    

---