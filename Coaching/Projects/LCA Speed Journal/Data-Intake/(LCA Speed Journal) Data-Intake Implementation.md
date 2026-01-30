---
topic:
  - "[[+LCA Speed Journal]]"
tags:
related:
  - "[[(LCA Speed Journal) Data-Intake Outlining]]"
  - "[[(LCA Speed Journal) Data-Intake Implementation Plan]]"
---
created: 2026-01-02
modified: 2026-01-02
___
# Track & Field Metric Intake & Processing System - Implementation Documentation

**Implementation Status: Complete**

This document describes the **implemented** data-intake system for the LCA Speed Journal project. For architectural design and design principles, see [[(LCA Speed Journal) Data-Intake Outlining]].

---

## 1. Project Structure

The data-intake module is implemented in `src/lca_speed_journal/data_intake/` with the following modules:

### Core Modules

- **`app.py`**: Streamlit application with Setup and Data Entry pages
- **`registry.py`**: Metric registry loader and validation
- **`session.py`**: SessionContext data model (Pydantic) with Streamlit integration
- **`parser.py`**: Parsing and expansion engine for all input structures
- **`conversions.py`**: Unit conversion functions
- **`sheets.py`**: Google Sheets API integration

### Utility Modules

- **`utils/athletes.py`**: Athlete registry loading and lookup functions

---

## 2. Metric Registry Implementation (`registry.py`)

### Overview

The metric registry loads metrics from `config/metrics.json` and provides lookup/filtering functions. The registry is cached after first load.

### Key Functions

#### `load_metric_registry() -> Dict[str, Dict[str, Any]]`

Loads and validates the metric registry from JSON. Caches results in module-level `_metric_registry`. Validates all metrics on load using `validate_metric()`.

**Raises:**
- `FileNotFoundError`: If config/metrics.json doesn't exist
- `json.JSONDecodeError`: If JSON is malformed
- `ValueError`: If any metric fails validation

#### `validate_metric(metric: Dict[str, Any], display_name: Optional[str] = None) -> None`

Validates a metric dictionary has all required fields and valid values:

- Required fields: `display_name`, `category`, `subcategory`, `input_units`, `display_units`, `conversion_formula`, `input_structure`, `default_splits`
- Validates `input_structure` is one of: `single_interval`, `cumulative`, `paired_components`
- Validates `category` is one of: `Speed`, `X-Factor`, `Lactic`
- Validates `default_splits` type matches `input_structure` (int list for cumulative, str list for paired_components)

#### `get_metric(display_name: str) -> Optional[Dict[str, Any]]`

Retrieves a single metric by display_name. Returns None if not found.

#### `get_metrics_by_category(category: str) -> Dict[str, Dict[str, Any]]`

Filters metrics by category. Returns dictionary keyed by display_name.

#### `get_all_metrics() -> Dict[str, Dict[str, Any]]`

Returns the complete metric registry dictionary.

---

## 3. Session Context Implementation (`session.py`)

### Overview

Session context is implemented using Pydantic models for validation and type safety. Integrated with Streamlit session state for persistence.

### SessionContext Model

**Class:** `SessionContext(BaseModel)`

Pydantic model with the following fields:

- `session_id: str` (default: auto-generated UUID)
- `session_date: date`
- `phase: Literal["Preseason", "Preparation", "Competition", "Championship"]`
- `phase_week: int` (validated: 1-5)
- `day_categories: List[str]` (validated against allowed set)
- `day_metrics: List[str]` (validated against metric registry)
- `day_splits: Dict[str, List[int]]` (metric_key → split distances)
- `day_components: Dict[str, List[str]]` (metric_key → component labels)
- `session_notes: Optional[str]`

**Validators:**
- `validate_phase_week`: Ensures 1-5 range
- `validate_day_categories`: Ensures categories are from allowed set
- `validate_day_metrics`: Ensures metrics exist in registry (on model validation)

### Key Functions

#### `create_empty_session_context() -> SessionContext`

Creates a new empty session context with defaults (UUID, today's date, Preseason phase, week 1).

#### `load_session_context() -> Optional[SessionContext]`

Loads session context from Streamlit session state. Returns None if not found. Handles date string deserialization.

**Raises:** `ImportError` if Streamlit not available

#### `save_session_context(context: SessionContext) -> None`

Saves session context to Streamlit session state as JSON-serialized dictionary.

**Raises:** `ImportError` if Streamlit not available

#### `clear_session_context() -> None`

Clears session context from Streamlit session state.

**Raises:** `ImportError` if Streamlit not available

---

## 4. Streamlit UI Implementation (`app.py`)

### Overview

Two-page Streamlit application: Setup and Data Entry. Uses Streamlit session state for context persistence and pending rows management.

### Page 1: Setup (`setup_page()`)

**Purpose:** Configure session context (date, phase, metrics, splits, components)

**UI Components:**

1. **Session Metadata Form:**
   - Session ID (text input, auto-generated if empty)
   - Session Date (date picker, defaults to today)
   - Phase (selectbox: Preseason, Preparation, Competition, Championship)
   - Phase Week (number input: 1-5)

2. **Day Categories:**
   - Multi-select: Speed, X-Factor, Lactic

3. **Metrics Selection:**
   - Multi-select filtered by selected categories
   - Shows all metrics if no categories selected

4. **Session Notes:**
   - Text area for free-form notes

5. **Split & Component Configuration:**
   - Dynamic input fields for cumulative metrics (split distances)
   - Dynamic input fields for paired_components metrics (component labels)
   - Accepts comma, pipe (|), or whitespace-separated values
   - Shows defaults from metric registry as placeholders

**Key Functions:**

- `parse_split_input(input_str: str, is_components: bool = False) -> List[Union[int, str]]`: Parses flexible separator formats
- `get_input_format_hint(metric: Dict[str, Any]) -> str`: Generates format hints for value inputs

**Validation:**
- Requires at least one day category
- Requires at least one metric
- Validates split/component inputs can be parsed

**State Management:**
- Saves to Streamlit session state via `save_session_context()`
- Allows clearing existing session context

### Page 2: Data Entry (`data_entry_page()`)

**Purpose:** Fast data entry workflow for athlete metrics

**Prerequisites:** Session context must exist (shows warning if not)

**UI Components:**

1. **Session Context Display:**
   - Expandable section showing current session metadata (read-only)

2. **Data Entry Form:**
   - Athlete selector (dropdown from athlete registry)
   - Metric selector (filtered to day_metrics from session context)
   - Value input (text input with format hint based on metric structure)
   - Submit button

3. **Recent Entries Table:**
   - Shows last 10 entries (athlete, metric, value, rows generated, timestamp)
   - Uses pandas DataFrame if available, falls back to table

4. **Export Section:**
   - Shows pending row count
   - "Export to Google Sheets" button (disabled if no pending rows)
   - Clears pending rows and recent entries after successful export

**Key Functions:**

- `load_config() -> Dict[str, Any]`: Loads config from config/config.json or config.example.json
- `get_input_format_hint(metric: Dict[str, Any]) -> str`: Generates input format hints

**Workflow:**

1. User selects athlete and metric
2. User enters value(s) (format depends on metric structure)
3. On submit:
   - Parses entry using `parse_entry()` from parser module
   - Adds generated rows to `st.session_state["pending_rows"]`
   - Adds entry to `st.session_state["recent_entries"]`
   - Shows success message with row count

4. User clicks "Export to Google Sheets":
   - Validates Google Sheets configuration
   - Calls `append_rows_to_sheet()` from sheets module
   - Clears pending rows and recent entries on success

### Main Entry Point

#### `main()`

Sets up sidebar navigation (Setup, Data Entry) and routes to appropriate page function.

---

## 5. Parsing & Expansion Engine Implementation (`parser.py`)

### Overview

Core parsing engine that transforms coach-entered values into fully enriched row-level data. Supports all three input structures with appropriate expansion logic.

### Main Entry Point

#### `parse_entry(...) -> List[Dict[str, Any]]`

Main dispatch function that routes to appropriate parser based on metric's `input_structure`.

**Parameters:**
- `session_context: SessionContext`
- `metric: Dict[str, Any]`
- `athlete_first_name: str`
- `athlete_last_name: str`
- `athlete_gender: str`
- `athlete_graduating_class: int`
- `input_values: str`
- `entry_timestamp: Optional[datetime]`
- `entered_by: Optional[str]`

**Returns:** List of output row dictionaries

**Raises:** `ValueError` if input_structure is invalid or input values are malformed

### Helper Functions

#### `_build_base_row(...) -> Dict[str, Any]`

Builds a base output row with session, athlete, and metric metadata. All fields initialized (None/empty for fields populated by specific parsers).

**Key fields populated:**
- Session metadata (session_id, session_date, phase, phase_week, day_categories, session_notes)
- Athlete metadata (athlete_name, athlete_gender, athlete_graduating_class)
- Metric metadata (metric_key, metric_category, metric_subcategory, metric_structure)
- Units and conversion metadata (input_units, display_units, conversion_type)
- Provenance (entry_timestamp, entered_by)
- Interval/component fields (initialized to None/empty)

#### `_apply_conversion(input_value: float, conversion_formula: str, interval_distance_m: Optional[float] = None) -> float`

Applies unit conversion using conversion module. Handles special case for `velocity_mph` which requires `interval_distance_m`.

#### `_extract_interval_from_name(display_name: str) -> Optional[Tuple[int, int]]`

Extracts interval information from metric display_name using regex. Supports patterns like "5-10m_Split" or "10-20m_Light-Sled". Returns (start_m, end_m) tuple or None.

#### `_format_interval_label(start_m: int, end_m: int) -> str`

Generates interval label string (e.g., "5-10m").

#### `_generate_velocity_row_for_split(...) -> Optional[Dict[str, Any]]`

Generates a velocity row for a split interval by looking up the corresponding Split metric in the registry. Creates a new row with Split metric metadata and velocity conversion. Returns None if Split metric not found.

#### `_detect_additional_10m_intervals(cumulative_distances: List[int], cumulative_values: List[float]) -> List[Tuple[int, int, float]]`

Detects additional 10m (or multiple of 10m) intervals that span non-consecutive gates. Used in cumulative parser to generate additional interval rows beyond consecutive splits.

### Parsers by Input Structure

#### `parse_single_interval(...) -> List[Dict[str, Any]]`

**Generates:** 1 row

**Logic:**
1. Parses input value as float
2. Builds base row
3. Extracts interval metadata from metric name if available
4. Applies conversion
5. Sets input_value and display_value

**Returns:** List with single row dictionary

#### `parse_cumulative(...) -> List[Dict[str, Any]]`

**Generates:** N cumulative rows + (N-1) consecutive split rows + additional 10m interval rows + velocity rows

**Logic:**
1. Parses pipe-separated cumulative values as floats
2. Gets splits from session context or metric defaults
3. Validates count matches
4. Calculates cumulative distances (starting at 0)
5. Generates cumulative rows (0-5m, 0-10m, 0-20m, etc.)
6. Generates consecutive discrete split rows (5-10m, 10-20m, etc.)
7. For each non-zero-start split, generates velocity row (if Split metric exists)
8. Detects and generates additional 10m intervals (non-consecutive)
9. For each additional interval, generates time row and velocity row

**Special Features:**
- Velocity rows automatically generated for discrete splits (uses Split metric registry lookup)
- Additional 10m intervals detected and expanded (e.g., 10-30m from 5, 10, 20, 30m gates)

**Returns:** List of row dictionaries (cumulative + splits + velocity + additional intervals)

#### `parse_paired_components(...) -> List[Dict[str, Any]]`

**Generates:** N component rows + 1 comparison row (if 2 components)

**Logic:**
1. Parses pipe-separated component values as floats
2. Gets component labels from session context or metric defaults
3. Validates count matches
4. Generates component rows (one per component with role="primary")
5. If exactly 2 components, generates comparison row:
   - Calculates absolute difference as input_value
   - Calculates asymmetry percentage as display_value
   - Sets component_label="L-R", component_role="comparison"
   - Sets display_units="%"

**Returns:** List of row dictionaries (components + comparison if applicable)

---

## 6. Unit Conversions Implementation (`conversions.py`)

### Overview

Predefined conversion functions for transforming input values to display values. All conversions are pure functions with no side effects.

### Conversion Functions

#### `velocity_mph(distance_m: float, time_s: float) -> float`

Converts velocity from m/s to mph. Formula: `(distance_m / time_s) * 2.237`

**Raises:** `ZeroDivisionError` if time_s is zero

#### `distance_ft_from_cm(distance_cm: float) -> float`

Converts distance from centimeters to feet. Formula: `distance_cm / 30.48`

#### `distance_ft_from_m(distance_m: float) -> float`

Converts distance from meters to feet. Formula: `distance_m / 3.281`

#### `pass_through(value: float) -> float`

Pass-through conversion (no transformation). Returns value unchanged.

### Conversion Registry

#### `_CONVERSION_FUNCTIONS: Dict[str, Callable[..., float]]`

Mapping of conversion formula identifiers to functions:
- `"velocity_mph"` → `velocity_mph`
- `"distance_ft_from_cm"` → `distance_ft_from_cm`
- `"distance_ft_from_m"` → `distance_ft_from_m`
- `""` (empty string) → `pass_through`

### Public Interface

#### `convert_value(input_value: float, conversion_formula: str, **kwargs: Any) -> float`

Main conversion function that dispatches to appropriate conversion function.

**Parameters:**
- `input_value`: Value to convert
- `conversion_formula`: Semantic identifier for conversion
- `**kwargs`: Additional arguments (e.g., `distance_m`, `time_s` for velocity_mph)

**Returns:** Converted value in display units

**Special Handling:**
- `velocity_mph`: Requires `distance_m` and `time_s` in kwargs
- Distance conversions: Use `input_value` directly
- Unknown formulas: Default to pass-through

#### `get_conversion_function(conversion_formula: str) -> Callable[..., float]`

Returns the conversion function for a given formula identifier. Returns `pass_through` if unknown.

---

## 7. Google Sheets Integration Implementation (`sheets.py`)

### Overview

Handles Google Sheets API integration using gspread with service account authentication. Provides batch append functionality with retry logic and header management.

### Row Schema

**Column Order:** Defined in `ROW_SCHEMA_COLUMNS` list (27 columns):

1. Session metadata (session_id, session_date, phase, phase_week, day_categories, session_notes)
2. Metric metadata (metric_category, metric_subcategory, metric_key, metric_structure)
3. Interval metadata (interval_start_m, interval_end_m, interval_label, interval_distance_m)
4. Units and conversion (input_units, display_units, conversion_type)
5. Athlete metadata (athlete_name, athlete_gender, athlete_graduating_class)
6. Values (input_value, display_value)
7. Provenance (entry_timestamp, entered_by)
8. Component metadata (component_label, component_role)

### Key Functions

#### `initialize_sheets_client(credentials_path: str) -> gspread.Client`

Initializes gspread client with service account credentials.

**Parameters:**
- `credentials_path`: Path to service account JSON credentials file

**Returns:** Authenticated gspread Client instance

**Raises:**
- `ImportError`: If gspread not installed
- `FileNotFoundError`: If credentials file doesn't exist
- Exception: If authentication fails

**Scopes:** `spreadsheets`, `drive`

#### `get_worksheet(client: gspread.Client, spreadsheet_id: str, worksheet_name: str) -> gspread.Worksheet`

Gets or creates a worksheet in the specified spreadsheet.

**Parameters:**
- `client`: Authenticated gspread Client
- `spreadsheet_id`: Google Sheets spreadsheet ID
- `worksheet_name`: Name of worksheet

**Returns:** gspread Worksheet instance

**Behavior:**
- Tries to get existing worksheet
- Creates new worksheet if not found (1000 rows, columns matching schema)

**Raises:**
- `gspread.exceptions.SpreadsheetNotFound`: If spreadsheet doesn't exist
- `gspread.exceptions.APIError`: If API call fails

#### `ensure_headers(worksheet: gspread.Worksheet, headers: List[str]) -> None`

Ensures worksheet has correct header row. Creates headers if worksheet is empty. Validates existing headers but doesn't overwrite (logs warning if mismatch).

#### `validate_row_schema(row: Dict[str, Any]) -> bool`

Validates that a row dictionary contains all required schema fields. Returns False if any column missing (logs warning).

#### `_row_to_list(row: Dict[str, Any]) -> List[Any]`

Converts row dictionary to list in correct column order. Converts None values to empty strings for Google Sheets compatibility.

#### `append_rows(worksheet: gspread.Worksheet, rows: List[Dict[str, Any]], max_retries: int = 3, retry_delay: float = 1.0) -> None`

Batch appends rows to worksheet with retry logic and exponential backoff.

**Parameters:**
- `worksheet`: gspread Worksheet instance
- `rows`: List of row dictionaries
- `max_retries`: Maximum retry attempts (default: 3)
- `retry_delay`: Initial delay between retries in seconds (default: 1.0)

**Behavior:**
- Validates all rows before appending
- Retries on rate limit (429) or server errors (5xx)
- Uses exponential backoff (delay * 2^attempt)
- Raises immediately on non-retryable errors

**Raises:**
- `ValueError`: If rows fail validation
- `gspread.exceptions.APIError`: If API call fails after retries

#### `append_rows_to_sheet(credentials_path: str, spreadsheet_id: str, worksheet_name: str, rows: List[Dict[str, Any]]) -> None`

Convenience function that handles full workflow: client initialization, worksheet access, header creation, and row appending.

**Parameters:**
- `credentials_path`: Path to service account JSON credentials
- `spreadsheet_id`: Google Sheets spreadsheet ID
- `worksheet_name`: Name of worksheet
- `rows`: List of row dictionaries to append

**Raises:** Various exceptions from underlying functions

---

## 8. Athlete Registry Implementation (`utils/athletes.py`)

### Overview

Manages athlete data loading and lookup functions. Uses Pydantic models for validation. Supports extensibility (additional fields beyond required fields).

### Athlete Model

**Class:** `Athlete(BaseModel)`

Pydantic model with required fields:
- `first_name: str`
- `last_name: str`
- `gender: str`
- `graduating_class: int`

**Configuration:** `extra="allow"` (allows additional fields for future expansion)

### Key Functions

#### `load_athletes(athletes_path: Optional[Path] = None) -> List[Athlete]`

Loads athletes from JSON file. Caches results in module-level `_athletes_cache`.

**Parameters:**
- `athletes_path`: Optional path to athletes.json (defaults to config/athletes.json)

**Returns:** List of Athlete objects

**JSON Format:** `{"athletes": [...]}`

**Behavior:**
- Caches results after first load
- Returns empty list if file not found (logs warning)
- Validates all athletes with Pydantic
- Logs error for invalid athlete data

**Raises:**
- `FileNotFoundError`: If file doesn't exist (only if path explicitly provided)
- `json.JSONDecodeError`: If JSON is malformed
- `ValueError`: If athlete data validation fails

#### `get_athlete_by_name(name: str) -> Optional[Athlete]`

Lookup athlete by name (case-insensitive). Searches:
1. Full name match ("First Last")
2. First name match
3. Last name match

**Returns:** Athlete object if found, None otherwise

#### `get_athlete_metadata(athlete: Athlete) -> Dict[str, Any]`

Extracts only required metadata fields (first_name, last_name, gender, graduating_class) for data entry. Ignores additional fields. Isolates data entry module from future schema expansions.

**Returns:** Dictionary with required fields

#### `get_all_athlete_names() -> List[str]`

Returns sorted list of all athlete names in "First Last" format.

#### `validate_athlete_data(athlete_data: Dict[str, Any]) -> bool`

Validates that athlete data contains required fields and correct types. Returns False if validation fails (logs warnings).

#### `clear_athletes_cache() -> None`

Clears athletes cache to force reload on next access. Useful for testing or when athletes.json is updated.

---

## 9. Implementation Status

### Completed Features

✅ **Metric Registry**
- JSON-based metric definitions
- Validation and lookup functions
- Category/subcategory filtering

✅ **Session Context**
- Pydantic data model with validation
- Streamlit session state integration
- Auto-generated session IDs
- Metric registry validation

✅ **Streamlit UI**
- Setup page with full session configuration
- Data Entry page with fast workflow
- Recent entries tracking
- Pending rows management
- Export to Google Sheets integration

✅ **Parsing Engine**
- Single interval parser
- Cumulative parser with full expansion (cumulative + splits + velocity + additional intervals)
- Paired components parser with comparison rows
- Automatic velocity row generation for splits

✅ **Unit Conversions**
- Velocity (m/s → mph)
- Distance (cm → ft, m → ft)
- Pass-through for no conversion

✅ **Google Sheets Integration**
- Service account authentication
- Batch append with retry logic
- Header management
- Row schema validation

✅ **Athlete Registry**
- JSON-based athlete data
- Lookup functions
- Extensible schema

### Design Principles Enforced

✅ **Explicit over implicit**: All metadata (intervals, components, units) stored explicitly in output rows

✅ **Denormalized for analysis**: Session context denormalized into every row

✅ **No eval-based formulas**: All conversions use predefined functions

✅ **Metric-driven logic**: App logic never hardcodes metric behavior; uses registry as authoritative source

✅ **Coach-facing simplicity, backend rigor**: Simple UI, rigorous data model and validation

---

## 10. Configuration Files

### Required Configuration

1. **`config/metrics.json`**: Metric registry definitions
2. **`config/athletes.json`**: Athlete registry data (format: `{"athletes": [...]}`)
3. **`config/config.json`**: Application configuration:
   ```json
   {
     "google_sheets": {
       "credentials_path": "path/to/credentials.json",
       "spreadsheet_id": "spreadsheet-id",
       "worksheet_name": "Data"
     }
   }
   ```

### Optional Configuration

- **`config/config.example.json`**: Example configuration template (used as fallback if config.json not found)

---

## 11. Usage Workflow

### Setup Workflow

1. Navigate to Setup page
2. Enter session metadata (date, phase, week)
3. Select day categories
4. Select metrics for today
5. Configure splits/components if needed
6. Add session notes (optional)
7. Save session context

### Data Entry Workflow

1. Navigate to Data Entry page (requires existing session context)
2. Select athlete from dropdown
3. Select metric from filtered list (day_metrics)
4. Enter value(s) according to format hint
5. Submit entry (generates rows, adds to pending)
6. Repeat steps 2-5 for additional entries
7. Click "Export to Google Sheets" when ready
8. Verify export success (pending rows cleared)

---

## 12. Key Implementation Details

### Session State Management

- Session context stored in `st.session_state["session_context"]` as JSON dict
- Pending rows stored in `st.session_state["pending_rows"]` as list of dicts
- Recent entries stored in `st.session_state["recent_entries"]` as list of dicts (max 10)

### Error Handling

- Validation errors shown as Streamlit error/warning messages
- API errors (Google Sheets) use retry logic with exponential backoff
- Invalid data prevents submission (validated before parsing)

### Performance Considerations

- Metric registry cached after first load
- Athletes cache after first load
- Batch append to Google Sheets (all pending rows in one API call)
- Retry logic prevents rate limit issues

### Extensibility

- Athlete model supports additional fields (extra="allow")
- Conversion functions can be added to `_CONVERSION_FUNCTIONS` mapping
- New input structures can be added by implementing new parser functions
- Metric registry is JSON-based (easy to extend)

---

## 13. Future Enhancements (Not Yet Implemented)

- User authentication/identification for `entered_by` field
- Real-time validation feedback in UI
- Undo/redo for recent entries
- Bulk import from CSV/Excel
- Session context templates
- Metric/athlete management UI
- Data validation rules (e.g., asymmetry thresholds)
- Export preview before submission

---

For architectural design and design principles, see [[(LCA Speed Journal) Data-Intake Outlining]].

