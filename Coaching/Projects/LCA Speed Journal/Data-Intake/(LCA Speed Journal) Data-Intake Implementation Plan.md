---
topic:
  - "[[+LCA Speed Journal]]"
tags:
  - "#implementation-plan"
related:
  - "[[(LCA Speed Journal) Data-Intake Outlining]]"
  - "[[(LCA Speed Journal) Current Metrics]]"
  - "[[(LCA Speed Journal) Current Session-Context Schema]]"
  - "[[(LCA Speed Journal) Current Data-Entry Row-Schema]]"
---
created: 2026-01-02
modified: 2026-01-02
___

# Data Intake Module Implementation Plan

## Overview

This plan implements the data-intake module for the LCA Speed Journal project. The system will be a Streamlit-based application that handles fast, low-friction data entry for Track & Field performance metrics, with intelligent parsing, expansion, and output to Google Sheets.

## Architecture Overview

The data-intake module follows a clear separation of concerns:

```
Streamlit App (app.py)
├── Setup Page → Session Context Management
├── Data Entry Page → Athlete/Metric/Value Input
├── Metric Registry (config/metrics.json)
├── Parser & Expansion Engine (parser.py)
├── Unit Conversion Functions (conversions.py)
├── Google Sheets Interface (sheets.py)
└── Utilities (athletes.py, session.py)
```

## Module Structure

### Core Files to Create

1. **`src/lca_speed_journal/data_intake/app.py`**
   - Main Streamlit application entry point
   - Two-page interface: Setup and Data Entry
   - Handles UI logic and user interaction

2. **`src/lca_speed_journal/data_intake/registry.py`**
   - Loads and validates metric registry from config
   - Provides metric lookup and filtering functions
   - Handles metric metadata (categories, subcategories, input structures)

3. **`src/lca_speed_journal/data_intake/session.py`**
   - Session context data model (Pydantic or dataclass)
   - Session context persistence (Streamlit session state)
   - Validation and default value handling

4. **`src/lca_speed_journal/data_intake/parser.py`**
   - Core parsing and expansion engine
   - Handles three input structures:
     - `single_interval`: 1 row output
     - `cumulative`: N rows (cumulative + discrete splits)
     - `paired_components`: Component rows + comparison row
   - Generates interval metadata and component labels

5. **`src/lca_speed_journal/data_intake/conversions.py`**
   - Unit conversion functions (predefined, no eval)
   - Functions like `velocity_mph()`, `distance_ft()`, etc.
   - Maps conversion_formula identifiers to functions

6. **`src/lca_speed_journal/data_intake/sheets.py`**
   - Google Sheets API integration (gspread)
   - Row schema validation
   - Batch append operations
   - Error handling and retries

7. **`src/lca_speed_journal/utils/athletes.py`**
   - Athlete registry management
   - Load athlete metadata (name, gender, grade)
   - Validation and lookup functions

8. **`config/metrics.json`**
   - Metric registry as JSON (parsed from Current Metrics.md table)
   - All 71 metrics with complete metadata
   - Source of truth for metric definitions

## Data Models

### Session Context Schema
- `session_id`: str (auto-generated UUID or user-editable)
- `session_date`: date (ISO format)
- `phase`: enum["Preseason", "Preparation", "Competition", "Championship"]
- `phase_week`: int (1-5)
- `day_categories`: List[str] (filtered from ["Speed", "X-Factor", "Lactic"])
- `day_metrics`: List[str] (metric keys from registry)
- `day_splits`: Dict[str, List[int]] (metric_key → split distances in meters)
- `day_components`: Dict[str, List[str]] (metric_key → component labels)
- `session_notes`: str (optional free text)

### Output Row Schema
Based on `(LCA Speed Journal) Current Data-Entry Row-Schema.md`, each row contains:
- Session metadata: session_id, session_date, phase, phase_week, day_categories, session_notes
- Athlete metadata: athlete_name, athlete_gender, athlete_grade
- Metric metadata: metric_key, metric_category, metric_subcategory, input_structure
- Interval metadata: interval_start_m, interval_end_m, interval_distance_m, interval_label
- Component metadata: component_label, component_role
- Values: input_units, display_units, conversion_type, input_value, display_value
- Provenance: entry_timestamp, entered_by

## Key Implementation Details

### Parsing & Expansion Logic

**Single Interval** (`single_interval`):
- Input: scalar value
- Output: 1 row with interval metadata if applicable
- No split expansion needed

**Cumulative** (`cumulative`):
- Input: pipe-separated cumulative times (e.g., "1.2|2.1|3.5")
- Uses `day_splits[metric_key]` or `default_splits` from registry
- Expands into:
  - Cumulative rows (0-10m, 0-20m, etc.)
  - Discrete split rows (10-20m, 20-30m, etc.)
  - Optional multi-segment aggregates

**Paired Components** (`paired_components`):
- Input: pipe-separated component values (e.g., "450|420")
- Uses `day_components[metric_key]` or defaults from registry
- Expands into:
  - One row per component (L, R)
  - One comparison row (L-R difference, asymmetry %)

### Unit Conversions

All conversions use predefined functions (no eval):
- `velocity_mph = (distance_m / time_s) * 2.237`
- `distance_ft = distance_cm / 30.48`
- `distance_ft = distance_m / 3.281`
- Pass-through (no conversion): return input value

### Google Sheets Integration

- Use `gspread` library for API access
- Configuration for spreadsheet ID and worksheet name
- Row schema matches output row schema exactly
- Append-only writes (no updates/deletes)
- Batch operations for efficiency

## Implementation Phases

### Phase 1: Foundation
1. Create metric registry JSON from Current Metrics.md
2. Implement metric registry loader (`registry.py`)
3. Implement unit conversion functions (`conversions.py`)
4. Create session context data model (`session.py`)

### Phase 2: Core Processing
1. Implement parsing engine for single_interval (`parser.py`)
2. Implement cumulative expansion logic
3. Implement paired_components expansion logic
4. Add interval metadata generation

### Phase 3: Integration
1. Implement Google Sheets interface (`sheets.py`)
2. Create athlete registry utilities (`utils/athletes.py`)
3. Build Streamlit Setup page (session context form)
4. Build Streamlit Data Entry page (athlete/metric/value input loop)

### Phase 4: Polish & Testing
1. Add input validation and error handling
2. Implement session state persistence
3. Add user feedback (success/error messages)
4. Test with sample data across all metric types

## Implementation Todos

1. **Create metric registry** - Create `config/metrics.json` from Current Metrics.md table with all 71 metrics including display_name, category, subcategory, input_units, display_units, conversion_formula, input_structure, and default_splits

2. **Implement registry loader** - Implement `registry.py` to load and validate metric registry JSON, provide lookup functions, and filter by category/subcategory (depends on: create_metric_registry)

3. **Implement conversions** - Implement `conversions.py` with predefined functions for velocity_mph, distance_ft (from cm/m), and pass-through conversions

4. **Implement session model** - Implement `session.py` with SessionContext data model (Pydantic/dataclass) including validation, defaults, and session state helpers

5. **Implement parser single** - Implement `parser.py` single_interval expansion logic that generates 1 row with appropriate interval metadata (depends on: implement_registry_loader)

6. **Implement parser cumulative** - Implement `parser.py` cumulative expansion logic that generates cumulative, discrete split, and multi-segment rows using default or session-level splits (depends on: implement_parser_single)

7. **Implement parser paired** - Implement `parser.py` paired_components expansion logic that generates component rows (L, R) and comparison row (asymmetry) (depends on: implement_parser_single)

8. **Implement sheets interface** - Implement `sheets.py` with Google Sheets API integration, row schema validation, batch append operations, and error handling

9. **Implement athlete utils** - Implement `utils/athletes.py` for athlete registry management, metadata loading (name, gender, grade), and lookup functions

10. **Implement Streamlit setup** - Implement Streamlit Setup page in `app.py` for session context input (date, phase, week, categories, metrics, splits, components, notes) (depends on: implement_session_model, implement_registry_loader)

11. **Implement Streamlit entry** - Implement Streamlit Data Entry page in `app.py` with athlete selector, metric selector, value input, and submit-to-sheets flow (depends on: implement_streamlit_setup, implement_parser_paired, implement_sheets_interface, implement_athlete_utils)

12. **Add validation & error handling** - Add input validation, error handling, user feedback messages, and session state persistence throughout the application (depends on: implement_streamlit_entry)

## Configuration Requirements

- Google Sheets API credentials (service account JSON)
- Spreadsheet ID and worksheet name configuration
- Athlete registry data source (JSON file or Google Sheet)
- Metric registry JSON file

## Dependencies to Add

Update `requirements.txt`:
- `streamlit` (UI framework)
- `gspread` (Google Sheets API)
- `google-auth` (authentication)
- `pandas` (data manipulation)
- `pydantic` or `dataclasses` (data validation)
- `python-dateutil` (date parsing)

## Design Principles Enforced

- **Explicit over implicit**: All metadata stored explicitly
- **Denormalized for analysis**: Each row is self-contained
- **No eval-based formulas**: All conversions are predefined functions
- **Metric-driven logic**: No hardcoded metric behavior
- **Coach-facing simplicity**: Complex logic hidden behind simple UI

## Sprint Planning Notes

This implementation can be broken down into roughly 12 distinct tasks that can be estimated individually. The dependencies create a natural workflow:

- **Foundation tasks** (1-4) can be started immediately and worked on in parallel
- **Core processing** (5-7) builds on the registry loader and can be done sequentially
- **Integration tasks** (8-11) require the foundation and core processing to be mostly complete
- **Polish** (12) comes after all core functionality is in place

Estimated complexity per task: 2-4 hours for foundation/core tasks, 4-8 hours for integration tasks, 2-4 hours for polish.


