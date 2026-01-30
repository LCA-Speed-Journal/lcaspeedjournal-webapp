---
topic:
  - "[[+LCA Speed Journal]]"
tags:
  - "#implementation-plan"
related:
  - "[[(LCA Speed Journal) Leaderboard Outlining]]"
  - "[[(LCA Speed Journal) Current Data-Entry Row-Schema]]"
  - "[[(LCA Speed Journal) Current Session-Context Schema]]"
---
created: 2026-01-02
modified: 2026-01-02
___

# Leaderboard Visualization Module Implementation Plan

## Overview

This plan implements the leaderboard visualization module for the LCA Speed Journal project. The system will be a Streamlit-based application that reads performance data from Google Sheets, processes it to identify best attempts per athlete, ranks athletes within gender groups, and displays Top 9 leaderboards in a 3×3 grid format with rank-based visual encoding.

## Architecture Overview

The leaderboard visualization module follows a clear separation of concerns:

```
Streamlit App (app.py)
├── Data Loading → Google Sheets Reader
├── Data Processing → Leaderboard Engine
│   ├── Grouping by Leaderboard Key
│   ├── Best Attempt Reduction
│   ├── Gender Splitting
│   └── Ranking & Top 9 Selection
├── Unit-to-Sort-Direction Mapping
├── Visual Rendering → Card Grid Generator
└── Configuration → Config Loader
```

## Module Structure

### Core Files to Create

1. **`src/lca_speed_journal/leaderboard_vis/app.py`**
   - Main Streamlit application entry point
   - Session filter UI (date, phase, week selection)
   - Metric/category filter UI
   - Renders expandable sections per leaderboard
   - Handles UI layout and user interaction

2. **`src/lca_speed_journal/leaderboard_vis/data_loader.py`**
   - Google Sheets data reading interface
   - Reuses `sheets.py` client initialization patterns
   - Loads all rows from configured worksheet
   - Returns pandas DataFrame with all row schema columns

3. **`src/lca_speed_journal/leaderboard_vis/processor.py`**
   - Core leaderboard processing engine
   - Implements leaderboard key grouping logic
   - Handles best attempt reduction per athlete
   - Implements gender-based splitting and ranking
   - Top 9 selection per gender
   - Returns processed leaderboard data structures

4. **`src/lca_speed_journal/leaderboard_vis/sort_direction.py`**
   - Unit-to-sort-direction mapping
   - Determines ascending (time-based) vs descending (distance/speed-based)
   - Maps `display_units` to sort direction
   - Helper functions for determining best attempt selection

5. **`src/lca_speed_journal/leaderboard_vis/renderer.py`**
   - Visual rendering functions
   - Generates 3×3 grid layouts for each gender
   - Card styling with rank-based colors
   - Gender-colored text for athlete names
   - Formats display values with units

6. **`src/lca_speed_journal/leaderboard_vis/config.py`**
   - Configuration loading from `config/config.json`
   - Google Sheets connection parameters
   - Worksheet name configuration
   - Caching configuration

## Data Models

### Leaderboard Key
Groups rows that share:
- `session_id`
- `metric_key`
- `interval_label`
- `display_units`

### Processed Leaderboard Structure
After processing, each leaderboard contains:
- Leaderboard metadata (session, metric, interval, units)
- Boys leaderboard: List of Top 9 athlete rows (ranked)
- Girls leaderboard: List of Top 9 athlete rows (ranked)
- Sort direction (ascending/descending)

### Rank-Based Color Mapping
- Rank 1: Gold
- Rank 2: Silver
- Rank 3: Bronze
- Rank 4: Green
- Row 2 (ranks 4-6): Purple
- Row 3 (ranks 7-9): Blue

## Key Implementation Details

### Data Loading
- Read all rows from Google Sheet using existing `sheets.py` patterns
- Convert to pandas DataFrame
- Filter by selected session/date range
- No upstream filtering needed (load all, filter in-memory)

### Leaderboard Grouping
- Group DataFrame by `LEADERBOARD_KEY = ["session_id", "metric_key", "interval_label", "display_units"]`
- Each group represents one leaderboard to render

### Best Attempt Reduction
Within each leaderboard group:
1. Group by `athlete_name`
2. Determine sort direction from `display_units` (first row's units)
3. Select best attempt:
   - Time-based units → `idxmin(display_value)` (lowest time)
   - Distance/speed-based units → `idxmax(display_value)` (highest value)
4. Keep only the best row per athlete

### Gender-Based Ranking
After reduction:
1. Split into Boys (`athlete_gender == "M"`) and Girls (`athlete_gender == "F"`)
2. Sort within each gender by `display_value` (direction from units)
3. Assign ranks (1, 2, 3, ...)
4. Select Top 9 per gender
5. Pad to 9 if fewer athletes (empty slots)

### Visual Rendering
Each leaderboard expander contains:
- Title: `<metric_key> — <interval_label> (<display_units>)`
- Two-column layout (Boys left, Girls right)
- Each column: 3×3 grid of cards
- Card content:
  - Primary: `display_value + display_units` (large, centered)
  - Rank: small, upper-right corner
  - Athlete name: bottom, gender-colored (boys=dark blue, girls=dark pink)
- Card background: rank-based color

### Unit-to-Sort-Direction Mapping
Time-based units (ascending/lower is better):
- `s`, `ms`, `min`, `h`

Distance/speed/power units (descending/higher is better):
- `m`, `cm`, `ft`, `in`, `mph`, `m/s`, `W`, `kg`, `N`

## Implementation Phases

### Phase 1: Foundation
**Goal**: Establish data loading and configuration infrastructure

1. Create configuration loader (`config.py`)
   - Load Google Sheets config from `config/config.json`
   - Extract spreadsheet_id, worksheet_name, credentials_path
   - Provide configuration access functions

2. Implement data loader (`data_loader.py`)
   - Reuse `sheets.py` client initialization patterns
   - Read all rows from Google Sheets worksheet
   - Convert to pandas DataFrame with proper column types
   - Return full dataset for processing

3. Implement unit-to-sort-direction mapping (`sort_direction.py`)
   - Create mapping function from `display_units` to sort direction
   - Handle time-based units (ascending)
   - Handle distance/speed/power units (descending)
   - Provide helper function for best attempt selection logic

**Checkpoint**: Can load data from Google Sheets and determine sort direction for any unit type.

### Phase 2: Core Processing
**Goal**: Implement leaderboard grouping, reduction, and ranking logic

1. Implement leaderboard grouping logic (`processor.py`)
   - Group DataFrame by LEADERBOARD_KEY
   - Handle empty groups gracefully
   - Return grouped data structure

2. Implement best attempt reduction
   - Group by `athlete_name` within each leaderboard
   - Use sort direction to determine best attempt
   - Select single best row per athlete
   - Preserve all row metadata

3. Implement gender splitting and ranking
   - Split reduced data into Boys and Girls
   - Sort within each gender by `display_value`
   - Assign ranks (1, 2, 3, ...)
   - Select Top 9 per gender
   - Handle edge cases (fewer than 9 athletes, ties)

**Checkpoint**: Can process raw data into ranked leaderboards with best attempts per athlete, split by gender.

### Phase 3: Visualization
**Goal**: Build visual rendering components and Streamlit UI

1. Implement card rendering functions (`renderer.py`)
   - Create function to render individual athlete card
   - Format display_value with units
   - Style rank indicator
   - Apply gender-colored text for athlete name

2. Implement rank-based color mapping
   - Map rank positions to background colors
   - Gold (1), Silver (2), Bronze (3), Green (4)
   - Purple (row 2: ranks 4-6), Blue (row 3: ranks 7-9)

3. Implement 3×3 grid layout
   - Arrange cards in 3×3 grid (3 rows × 3 columns)
   - Handle empty slots (pad to 9 if needed)
   - Ensure consistent card sizing

4. Build Streamlit UI with filters (`app.py`)
   - Session date/phase/week filter UI
   - Metric category filter UI
   - Metric key filter UI (optional)
   - Apply filters to loaded data

5. Build expandable leaderboard sections
   - Create `st.expander` per leaderboard
   - Title format: `<metric_key> — <interval_label> (<display_units>)`
   - Two-column layout (Boys left, Girls right)
   - Integrate grid rendering

**Checkpoint**: Can display filtered leaderboards in Streamlit with proper visual encoding and layout.

### Phase 4: Polish & Testing
**Goal**: Add error handling, optimization, and comprehensive testing

1. Add error handling and loading states
   - Handle Google Sheets API errors gracefully
   - Show loading indicators during data fetch
   - Display empty states when no data matches filters
   - User-friendly error messages

2. Add performance optimization
   - Implement Streamlit caching for data loading
   - Optimize DataFrame operations (use vectorized operations)
   - Efficient filtering logic
   - Cache processed leaderboards when filters unchanged

3. Test with sample data
   - Test across all metric types (single_interval, cumulative, paired_components)
   - Test with various unit types (time, distance, speed)
   - Test edge cases: ties, fewer than 9 athletes, no data
   - Test filter combinations

4. User experience improvements
   - Add session context display (date, phase, week in header)
   - Improve card visual design (spacing, typography)
   - Add tooltips or help text
   - Ensure responsive layout

**Checkpoint**: Production-ready leaderboard visualization with robust error handling and optimal performance.

## Implementation Todos

1. **Create config loader** - Implement `config.py` to load Google Sheets configuration from `config/config.json`, including spreadsheet_id, worksheet_name, and credentials_path

2. **Implement data loader** - Implement `data_loader.py` to read all rows from Google Sheets using gspread, convert to pandas DataFrame, and return full dataset (depends on: create_config_loader)

3. **Implement sort direction mapping** - Implement `sort_direction.py` with unit-to-sort-direction mapping function that determines ascending (time) vs descending (distance/speed) from display_units string

4. **Implement leaderboard grouping** - Implement `processor.py` grouping logic that groups DataFrame rows by LEADERBOARD_KEY (session_id, metric_key, interval_label, display_units) (depends on: implement_data_loader)

5. **Implement best attempt reduction** - Implement `processor.py` best attempt reduction that groups by athlete_name within each leaderboard and selects best display_value based on sort direction (depends on: implement_leaderboard_grouping, implement_sort_direction_mapping)

6. **Implement gender splitting and ranking** - Implement `processor.py` gender-based splitting, sorting, ranking, and Top 9 selection per gender (depends on: implement_best_attempt_reduction)

7. **Implement card renderer** - Implement `renderer.py` with functions to render individual athlete cards with rank, display_value+units, and athlete name (depends on: implement_gender_splitting_and_ranking)

8. **Implement grid layout** - Implement `renderer.py` 3×3 grid layout generator that arranges cards in rows and columns with rank-based background colors (depends on: implement_card_renderer)

9. **Implement Streamlit filters** - Implement Streamlit UI in `app.py` with session date/phase/week filters and metric/category filters (depends on: implement_data_loader)

10. **Implement Streamlit leaderboards** - Implement Streamlit UI in `app.py` with expandable sections per leaderboard, two-column gender layout, and integrated grid rendering (depends on: implement_streamlit_filters, implement_grid_layout)

11. **Add error handling** - Add error handling, loading states, empty state messages, and user feedback throughout the application (depends on: implement_streamlit_leaderboards)

12. **Add performance optimization** - Add DataFrame operation optimizations, Streamlit caching for data loading, and efficient filtering (depends on: implement_streamlit_leaderboards)

## Configuration Requirements

- Google Sheets API credentials (service account JSON) - reuse from data_intake
- Spreadsheet ID and worksheet name configuration - from `config/config.json`
- Same Google Sheet as data_intake module (read-only access)

## Dependencies

All required dependencies are already in `requirements.txt`:
- `streamlit` (UI framework)
- `gspread` (Google Sheets API)
- `google-auth` (authentication)
- `pandas` (data manipulation)

No additional dependencies needed.

## Design Principles Enforced

- **Read-only visualization**: No data modification, only reads from Google Sheets
- **Fair comparison**: Gender-separated leaderboards ensure fair ranking
- **Best performance focus**: Only best attempt per athlete per leaderboard
- **Visual clarity**: Rank-based colors and gender-colored text for quick recognition
- **Coach-friendly**: Simple filters, clear layout, minimal cognitive load
- **Efficient processing**: In-memory DataFrame operations, minimal API calls

## Data Flow

```
Google Sheets → data_loader.py → pandas DataFrame
    ↓
DataFrame → processor.py → Grouped Leaderboards
    ↓
Each Leaderboard → Best Attempt Reduction → Gender Split → Ranking → Top 9
    ↓
Processed Leaderboards → renderer.py → Streamlit Cards
    ↓
app.py → Display in Expandable Sections
```

## Sprint Planning Notes

This implementation can be broken down into roughly 12 distinct tasks that can be estimated individually. The dependencies create a natural workflow:

- **Foundation tasks** (1-3) can be started immediately and worked on in parallel
- **Core processing** (4-6) builds on the foundation and can be done sequentially
- **Visualization tasks** (7-10) require the core processing to be complete
- **Polish** (11-12) comes after all core functionality is in place

Estimated complexity per task: 2-4 hours for foundation/core tasks, 4-6 hours for visualization tasks, 2-4 hours for polish.

## Phase Checkpoints

### Phase 1 Checkpoint
- ✅ Configuration can be loaded from `config/config.json`
- ✅ Data can be read from Google Sheets and converted to DataFrame
- ✅ Sort direction can be determined from any `display_units` value

### Phase 2 Checkpoint
- ✅ Data can be grouped into leaderboards by LEADERBOARD_KEY
- ✅ Best attempt per athlete can be identified within each leaderboard
- ✅ Athletes can be ranked within gender groups and Top 9 selected

### Phase 3 Checkpoint
- ✅ Individual athlete cards can be rendered with proper styling
- ✅ 3×3 grids can be generated for each gender
- ✅ Streamlit UI displays filtered leaderboards in expandable sections

### Phase 4 Checkpoint
- ✅ All error cases are handled gracefully
- ✅ Performance is optimized with caching
- ✅ Application works correctly with real data across all metric types

