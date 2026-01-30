---
topic:
  - "[[+LCA Speed Journal]]"
tags:
  - "#implementation-plan"
related:
  - "[[(LCA Speed Journal) Detailed Visualization Outlining]]"
  - "[[(LCA Speed Journal) Current Data-Entry Row-Schema]]"
  - "[[(LCA Speed Journal) Current Session-Context Schema]]"
---
created: 2026-01-02
modified: 2026-01-02
___

# Detailed Visualization Module Implementation Plan

## Overview

This plan implements the detailed visualization module for the LCA Speed Journal project. The system will be a Streamlit-based application that provides comprehensive analytical views and reporting capabilities for track and field performance data, enabling athletes and coaches to understand performance trends, track progress, identify achievements, and detect potential issues over time.

## Architecture Overview

The detailed visualization module follows a clear separation of concerns:

```
Streamlit App (app.py)
├── Navigation → Multi-page interface
├── Data Loading → Google Sheets Reader (reuse from leaderboard_vis)
├── Data Processing → Aggregation & Analysis Engine
│   ├── Time-based aggregations (daily, weekly, by-phase)
│   ├── Metric grouping by category/subcategory
│   ├── Athlete grouping by gender/class
│   └── Historical data segmentation
├── Visualization Components
│   ├── Progression Charts (Altair - line/area charts)
│   ├── Leaderboard Bar Charts (Altair - horizontal/vertical bars)
│   ├── Dashboard Widgets
│   └── Report Generators
└── Configuration → Config Loader (reuse from leaderboard_vis)
```

## Module Structure

### Core Files to Create

1. **`src/lca_speed_journal/detailed_viz/app.py`**
   - Main Streamlit application entry point
   - Multi-page navigation (Progression, Leaders, Dashboards, Reports)
   - Filter UI components (date range, phase, athlete, metric)
   - Page routing and layout management

2. **`src/lca_speed_journal/detailed_viz/data_loader.py`**
   - Google Sheets data reading interface
   - Reuses patterns from `leaderboard_vis/data_loader.py`
   - Loads all historical data from configured worksheet
   - Returns pandas DataFrame with all row schema columns
   - Optional caching for performance

3. **`src/lca_speed_journal/detailed_viz/aggregator.py`**
   - Data aggregation engine
   - Time-based aggregations (daily, weekly, by-phase)
   - Metric grouping by category/subcategory
   - Athlete grouping by gender/class
   - Best attempt selection per time period
   - Average/trend calculations

4. **`src/lca_speed_journal/detailed_viz/progression_charts.py`**
   - Progression chart generation
   - Individual metric line/area charts
   - Multi-metric dashboard views
   - Phase-based progressions
   - Practice context views
   - Reference line generation (PBs, team averages, benchmarks)

5. **`src/lca_speed_journal/detailed_viz/leaders.py`**
   - Leaderboard processing for all-time and by-phase
   - All-time best identification per athlete/metric
   - Phase-specific best identification
   - Ranking and sorting logic
   - Gender-separated views
   - Historical context tracking
   - Bar chart generation using Altair (horizontal/vertical based on metric type)
   - Rank-based color scale generation

6. **`src/lca_speed_journal/detailed_viz/dashboards.py`**
   - Individual athlete dashboard generation
   - Team dashboard generation (coach view)
   - Performance summary cards
   - Progress indicators
   - Attendance tracking
   - Comparison widgets

7. **`src/lca_speed_journal/detailed_viz/reports.py`**
   - Progress report generation
   - Phase-end reports
   - Custom date range reports
   - PDF export functionality
   - Report content assembly

8. **`src/lca_speed_journal/detailed_viz/risk_indicators.py`**
   - Injury risk detection logic
   - Performance decline alerts
   - Asymmetry detection (for paired components)
   - Attendance pattern analysis
   - Multi-metric risk scoring
   - Alert dashboard generation

9. **`src/lca_speed_journal/detailed_viz/filters.py`**
   - Filter UI components
   - Date range selection
   - Phase/week selection
   - Athlete selection (single/multi)
   - Metric/category selection
   - Filter state management

10. **`src/lca_speed_journal/detailed_viz/config.py`**
    - Configuration loading (reuse from leaderboard_vis)
    - Google Sheets connection parameters
    - Visualization settings
    - Export settings

## Data Models

### Time-Based Aggregations
- **Daily**: Best/average per metric per athlete per day
- **Weekly**: Best/average per metric per athlete per week
- **By-Phase**: Best/average per metric per athlete per phase
- **By-Phase-Week**: Best/average per metric per athlete per phase week

### Progression Data Structure
- Time axis: date, phase_week, or week_within_phase
- Metric values: display_value per time point
- Athlete grouping: individual or team aggregate
- Reference data: PBs, team averages, benchmarks

### Leaderboard Data Structure
- All-time: Best display_value per athlete per metric (across all time)
- By-phase: Best display_value per athlete per metric per phase
- Ranking: Sorted by display_value with gender separation
- Metadata: Date achieved, phase achieved, athlete class at time

### Dashboard Data Structure
- Personal bests: All-time, phase-specific, current phase
- Progress indicators: Improvement percentages, trend direction
- Attendance: Practice participation rates and patterns
- Comparisons: vs. team average, vs. personal bests

## Visualization Library Choice: Altair

**Altair** is selected as the primary visualization library for this module because:

1. **Fine-grained control**: Declarative grammar of graphics allows precise control over every visual element (colors, scales, axes, annotations)

2. **Leaderboard bar charts**: Perfect for creating bar charts that show magnitude comparisons with rank-based color encoding - essential for leaderboard visualizations

3. **Progression charts**: Excellent for layering multiple data series, reference lines (PBs, team averages), and annotations on line/area charts

4. **Pandas integration**: Seamless integration with pandas DataFrames - the primary data structure used throughout the module

5. **Streamlit compatibility**: Works perfectly with `st.altair_chart()` for interactive displays

6. **Interactivity**: Built-in tooltips, zoom, and pan capabilities without additional configuration

7. **Layering**: Easy to combine multiple chart types (bars + reference lines + annotations) using Altair's layering syntax

8. **Color encoding**: Simple rank-based color scales for leaderboard visualizations (gold/silver/bronze, gradients)

9. **Maintainability**: Declarative syntax makes charts easier to read, modify, and extend

10. **Performance**: Efficient rendering even with moderate-sized datasets

## Key Implementation Details

### Data Loading
- Read all rows from Google Sheet (same source as leaderboard_vis)
- Convert to pandas DataFrame
- Filter by selected date range/phase/athlete/metric
- Efficient filtering using pandas operations

### Time-Based Aggregations
- Group by time period (date, week, phase, phase_week)
- For each group, select best attempt per athlete per metric
- Calculate averages for team-level views
- Handle missing data gracefully

### Progression Charts
- Use **Altair** as primary visualization library for fine-grained control and declarative grammar of graphics
- Support multiple time axis options (chronological, phase week, week within phase)
- Overlay multiple athletes for comparison with color encoding
- Add reference lines (PBs, team averages, benchmarks) using Altair's layering capabilities
- Filter by metric, athlete, date range, phase
- Interactive tooltips and zoom/pan capabilities via Altair's built-in interactivity

### Leaderboards
- All-time: Group all data, find best per athlete per metric
- By-phase: Group by phase, find best per athlete per metric per phase
- Sort by display_value (direction from units, reuse from leaderboard_vis)
- Gender-separated views
- Show historical context (when achieved, athlete class)
- **Visualization**: Use Altair bar charts (horizontal or vertical) to show magnitude of each data point in context to others
- Rank-based color encoding (gold/silver/bronze for top 3, then gradient or categorical colors)
- Bar charts allow clear visual comparison of performance magnitudes across athletes

### Dashboards
- Individual: Aggregate all metrics for one athlete
- Team: Aggregate across all athletes
- Generate summary cards with key metrics
- Calculate progress indicators (improving/declining/stable)
- Track attendance patterns

### Risk Indicators
- Performance decline: Compare recent performance to baseline
- Asymmetry: For paired_components metrics, calculate L-R differences
- Attendance flags: Identify irregular practice patterns
- Risk scoring: Composite indicators based on multiple factors

## Implementation Phases

### Phase 1: Foundation & Data Infrastructure
**Goal**: Establish data loading, configuration, and basic aggregation capabilities

1. Create configuration loader (`config.py`)
   - Reuse from leaderboard_vis or create new
   - Load Google Sheets config from `config/config.json`
   - Extract spreadsheet_id, worksheet_name, credentials_path

2. Implement data loader (`data_loader.py`)
   - Reuse patterns from `leaderboard_vis/data_loader.py`
   - Read all rows from Google Sheets worksheet
   - Convert to pandas DataFrame with proper column types
   - Add optional caching with Streamlit

3. Implement basic aggregator (`aggregator.py`)
   - Time-based grouping functions (by date, week, phase)
   - Best attempt selection per time period (reuse sort_direction logic)
   - Average calculations for team views
   - Basic filtering helpers

4. Create filter UI components (`filters.py`)
   - Date range picker
   - Phase/week selectors
   - Athlete selector (single/multi)
   - Metric/category selectors
   - Filter state management

**Checkpoint**: Can load all historical data, perform basic time-based aggregations, and apply filters.

### Phase 2: Progression Charts - Individual Metrics
**Goal**: Implement single-metric progression charts with basic features

1. Implement progression chart generator (`progression_charts.py`)
   - Single metric line chart function
   - Time axis options (chronological date, phase week, week within phase)
   - Single athlete progression
   - Basic styling and layout

2. Integrate with Streamlit UI (`app.py`)
   - Create "Progression Charts" page
   - Filter UI (metric, athlete, date range, phase)
   - Chart display with Altair using `st.altair_chart()`
   - Basic interactivity (tooltips, zoom/pan via Altair)

3. Add reference lines
   - Personal best markers
   - Team average line
   - Phase-specific benchmarks (optional)

**Checkpoint**: Can display individual metric progression charts for a single athlete with reference lines.

### Phase 3: Progression Charts - Multi-Athlete & Advanced Features
**Goal**: Extend progression charts to support multiple athletes and advanced views

1. Extend chart generator for multi-athlete overlay
   - Multiple athletes on same chart
   - Color coding by athlete
   - Legend and tooltips

2. Implement multi-metric dashboard views
   - Category progression panels (Speed, X-Factor, Lactic)
   - Subcategory comparisons (related metrics side-by-side)
   - Grid layout for multiple charts

3. Implement phase-based progressions
   - Phase-to-phase comparisons
   - Seasonal progression (same phase across years)
   - Phase-specific trend lines

4. Implement practice context views
   - Session-over-session trends
   - Weekly aggregates
   - Practice frequency indicators

**Checkpoint**: Can display multi-athlete progression charts, multi-metric dashboards, and phase-based views.

### Phase 4: All-Time Leaders
**Goal**: Implement all-time leaderboard functionality

1. Implement all-time leaders processor (`leaders.py`)
   - Find best attempt per athlete per metric across all time
   - Handle multiple intervals per metric
   - Gender-separated ranking
   - Historical context tracking (date achieved, phase, class)

2. Create all-time leaders UI
   - "All-Time Leaders" page in Streamlit
   - Metric-specific leaderboards displayed as **bar charts** (Altair)
   - Bar charts show magnitude of each athlete's performance relative to others
   - Horizontal or vertical bars based on metric type and preference
   - Rank-based color encoding (gold/silver/bronze for top 3, gradient for others)
   - Sortable/filterable views (metric, gender)
   - Achievement markers (records, PBs) as annotations on bars

3. Add multi-metric composite rankings (optional)
   - Aggregate performance across multiple metrics
   - Weighted or unweighted scoring

**Checkpoint**: Can display all-time leaderboards with proper ranking, gender separation, and historical context.

### Phase 5: By-Phase Leaders
**Goal**: Implement phase-specific leaderboard functionality

1. Implement by-phase leaders processor (`leaders.py`)
   - Find best attempt per athlete per metric per phase
   - Phase week comparisons
   - Current phase standings
   - Phase progression rankings

2. Create by-phase leaders UI
   - "By-Phase Leaders" page or section
   - Phase selector
   - Phase-specific leaderboards displayed as **bar charts** (Altair)
   - Bar charts show magnitude comparisons within each phase
   - Phase week comparison views (multiple bar charts or grouped bars)
   - Current phase standings with visual magnitude representation

**Checkpoint**: Can display phase-specific leaderboards with phase comparisons and current standings.

### Phase 6: Individual Athlete Dashboards
**Goal**: Implement comprehensive individual athlete dashboard views

1. Implement athlete dashboard generator (`dashboards.py`)
   - Personal overview with key metrics
   - Performance summary cards (current PBs, phase bests, all-time bests)
   - Progress indicators (improvement percentages, trends)
   - Attendance tracking
   - Metric category panels

2. Create athlete dashboard UI
   - "Athlete Dashboards" page
   - Athlete selector
   - Dashboard layout with summary cards
   - Progression charts integration
   - Comparison widgets (vs. team average, vs. PBs)

**Checkpoint**: Can display comprehensive individual athlete dashboards with all key information.

### Phase 7: Team Dashboards (Coach View)
**Goal**: Implement team-level dashboard views for coaches

1. Implement team dashboard generator (`dashboards.py`)
   - Team overview metrics (average performance, participation rates)
   - Top performers spotlight
   - Team progression trends
   - Participation heatmaps
   - Metric distribution charts

2. Create team dashboard UI
   - "Team Dashboard" page (coach view)
   - Team-level aggregations
   - Top performers section
   - Team trends visualization
   - Participation patterns

**Checkpoint**: Can display team dashboards with team-level metrics and trends.

### Phase 8: Progress Reports
**Goal**: Implement progress report generation and export

1. Implement report generator (`reports.py`)
   - Phase-end report assembly
   - Mid-season report assembly
   - Custom date range reports
   - Report content: summaries, charts, comparisons

2. Create report UI and export
   - Report generation interface
   - Date range/phase selection
   - Report preview
   - PDF export functionality (using reportlab or similar)
   - CSV/Excel data exports

**Checkpoint**: Can generate and export progress reports in PDF and data formats.

### Phase 9: Injury Risk Indicators
**Goal**: Implement injury risk detection and alert system

1. Implement risk detection logic (`risk_indicators.py`)
   - Performance decline detection (compare to baseline)
   - Asymmetry detection for paired_components metrics
   - Attendance pattern analysis
   - Multi-metric risk scoring

2. Create risk indicators UI
   - "Risk Indicators" page (coach view)
   - Alert dashboard
   - Individual athlete risk flags
   - Historical context for risk indicators
   - Risk scoring display

**Checkpoint**: Can detect and display injury risk indicators with proper alerts and context.

### Phase 10: Polish, Optimization & Testing
**Goal**: Add error handling, performance optimization, and comprehensive testing

1. Add error handling and loading states
   - Handle Google Sheets API errors gracefully
   - Show loading indicators during data operations
   - Display empty states when no data matches filters
   - User-friendly error messages

2. Add performance optimization
   - Implement Streamlit caching for data loading and aggregations
   - Optimize DataFrame operations (vectorized operations)
   - Efficient filtering and grouping logic
   - Progressive loading for complex visualizations

3. Test with sample data
   - Test across all metric types
   - Test with various time ranges and phases
   - Test edge cases: no data, single athlete, single metric
   - Test filter combinations
   - Test export functionality

4. User experience improvements
   - Improve visual design (spacing, typography, colors)
   - Add tooltips and help text
   - Ensure responsive layout
   - Add navigation improvements
   - Print-friendly layouts for reports

**Checkpoint**: Production-ready detailed visualization module with robust error handling and optimal performance.

## Implementation Todos

1. **Create config loader** - Implement or reuse `config.py` to load Google Sheets configuration from `config/config.json`

2. **Implement data loader** - Implement `data_loader.py` to read all rows from Google Sheets, convert to pandas DataFrame, and add optional caching (depends on: create_config_loader)

3. **Implement basic aggregator** - Implement `aggregator.py` with time-based grouping, best attempt selection, and average calculations (depends on: implement_data_loader)

4. **Create filter UI components** - Implement `filters.py` with date range, phase/week, athlete, and metric selectors (depends on: implement_data_loader)

5. **Implement single-metric progression charts** - Implement `progression_charts.py` with single metric line charts using Altair and time axis options (depends on: implement_basic_aggregator, create_filter_ui_components)

6. **Integrate progression charts UI** - Create "Progression Charts" page in `app.py` with filters and chart display (depends on: implement_single_metric_progression_charts)

7. **Add reference lines to charts** - Add personal best markers, team average lines, and benchmarks to progression charts (depends on: integrate_progression_charts_ui)

8. **Extend charts for multi-athlete** - Add multi-athlete overlay support to progression charts with color coding (depends on: add_reference_lines_to_charts)

9. **Implement multi-metric dashboards** - Add category progression panels and subcategory comparisons to progression charts (depends on: extend_charts_for_multi_athlete)

10. **Implement phase-based progressions** - Add phase-to-phase comparisons and seasonal progression views (depends on: extend_charts_for_multi_athlete)

11. **Implement practice context views** - Add session-over-session trends and weekly aggregates to progression charts (depends on: extend_charts_for_multi_athlete)

12. **Implement all-time leaders processor** - Implement `leaders.py` to find best attempts per athlete per metric across all time with gender separation (depends on: implement_basic_aggregator)

13. **Create all-time leaders UI** - Create "All-Time Leaders" page with bar charts (Altair) showing magnitude comparisons, sortable leaderboards, and filters (depends on: implement_all_time_leaders_processor)

14. **Implement by-phase leaders processor** - Extend `leaders.py` to find best attempts per athlete per metric per phase (depends on: implement_all_time_leaders_processor)

15. **Create by-phase leaders UI** - Create by-phase leaders page with bar charts (Altair) showing magnitude comparisons, phase selector, and phase comparisons (depends on: implement_by_phase_leaders_processor)

16. **Implement athlete dashboard generator** - Implement `dashboards.py` to generate individual athlete dashboards with summary cards and progress indicators (depends on: implement_basic_aggregator)

17. **Create athlete dashboard UI** - Create "Athlete Dashboards" page with athlete selector and dashboard layout (depends on: implement_athlete_dashboard_generator)

18. **Implement team dashboard generator** - Extend `dashboards.py` to generate team-level dashboards with aggregations and trends (depends on: implement_athlete_dashboard_generator)

19. **Create team dashboard UI** - Create "Team Dashboard" page with team-level metrics and visualizations (depends on: implement_team_dashboard_generator)

20. **Implement report generator** - Implement `reports.py` to assemble progress reports with summaries, charts, and comparisons (depends on: implement_athlete_dashboard_generator, implement_progression_charts)

21. **Create report UI and export** - Create report generation interface with PDF and data export functionality (depends on: implement_report_generator)

22. **Implement risk detection logic** - Implement `risk_indicators.py` with performance decline, asymmetry, and attendance pattern detection (depends on: implement_basic_aggregator)

23. **Create risk indicators UI** - Create "Risk Indicators" page with alert dashboard and risk flags (depends on: implement_risk_detection_logic)

24. **Add error handling** - Add error handling, loading states, empty state messages, and user feedback throughout the application (depends on: create_risk_indicators_ui)

25. **Add performance optimization** - Add DataFrame operation optimizations, Streamlit caching, and efficient filtering (depends on: create_risk_indicators_ui)

## Configuration Requirements

- Google Sheets API credentials (service account JSON) - reuse from data_intake/leaderboard_vis
- Spreadsheet ID and worksheet name configuration - from `config/config.json`
- Same Google Sheet as data_intake and leaderboard_vis modules (read-only access)

## Dependencies to Add

Update `requirements.txt`:
- `altair>=5.0.0` (primary visualization library - declarative grammar of graphics, fine-grained control)
- `vega-datasets` (optional - for example datasets if needed)
- `reportlab` or `weasyprint` (PDF generation for reports)
- `openpyxl` or `xlsxwriter` (Excel export)

**Note**: Altair is chosen as the primary visualization library because:
- Declarative grammar of graphics allows fine-tuned control over all visual elements
- Excellent integration with pandas DataFrames
- Built-in interactivity (tooltips, zoom, pan) without additional configuration
- Easy layering of reference lines, annotations, and multiple chart types
- Simple rank-based color encoding for leaderboard bar charts
- Works seamlessly with Streamlit via `st.altair_chart()`

All other required dependencies are already in `requirements.txt`:
- `streamlit` (UI framework)
- `gspread` (Google Sheets API)
- `google-auth` (authentication)
- `pandas` (data manipulation)
- `pydantic` (data validation)

## Design Principles Enforced

- **Read-only visualization**: No data modification, only reads from Google Sheets
- **Comprehensive analysis**: Support multiple time contexts (session, week, phase, all-time)
- **Fair comparison**: Gender-separated views where appropriate
- **Best performance focus**: Emphasize best attempts and personal bests
- **Visual clarity**: Clear charts, tables, and dashboards for quick understanding
- **Coach and athlete friendly**: Simple navigation, clear layout, minimal cognitive load
- **Efficient processing**: In-memory DataFrame operations, caching, minimal API calls
- **Extensible**: Modular design allows adding new visualization types

## Data Flow

```
Google Sheets → data_loader.py → pandas DataFrame
    ↓
DataFrame → aggregator.py → Time-based Aggregations
    ↓
Aggregated Data → progression_charts.py / leaders.py / dashboards.py → Visualizations
    ↓
app.py → Display in Multi-page Streamlit Interface
    ↓
reports.py → PDF/Data Export
```

## Sprint Planning Notes

This implementation is broken down into 10 phases with 25 distinct tasks. The phases are designed to be smaller and more manageable than typical implementations, with frequent checkpoints:

- **Phase 1** (Foundation): 4 tasks - establishes core infrastructure
- **Phase 2** (Basic Progression): 3 tasks - first working visualizations
- **Phase 3** (Advanced Progression): 4 tasks - extends progression features
- **Phase 4** (All-Time Leaders): 2 tasks - first leaderboard functionality
- **Phase 5** (By-Phase Leaders): 2 tasks - phase-specific leaderboards
- **Phase 6** (Athlete Dashboards): 2 tasks - individual views
- **Phase 7** (Team Dashboards): 2 tasks - team-level views
- **Phase 8** (Reports): 2 tasks - reporting and export
- **Phase 9** (Risk Indicators): 2 tasks - coach-specific features
- **Phase 10** (Polish): 2 tasks - optimization and testing

Each phase has a clear checkpoint that validates working functionality before moving to the next phase. This allows for incremental development and frequent validation.

Estimated complexity per task: 2-4 hours for foundation/core tasks, 4-8 hours for visualization tasks, 2-4 hours for polish.

