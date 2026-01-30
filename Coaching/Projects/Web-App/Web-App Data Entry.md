---
topic:
  - "[[+Track and Field]]"
tags:
  - "#project"
  - "#track-and-field"
related:
---
created: 2025-09-03 08:15
modified: 2025-09-03 08:14
___
# Basic Overview

**high-throughput, in-session data entry**. In a live practice environment, a standard form with multiple dropdowns per entry can become **too slow**, especially when recording marks for 10–20 athletes in quick succession.
# Key Objectives
## Minimize Clicks / Keystrokes
### Strategies:
- **Type-to-search dropdowns** for athletes and metrics instead of scrolling through long lists.
- **Keyboard shortcuts**: assign keys for common metrics or quick entry (e.g., “F” for Fly-10, “S” for Standing LJ).
- **Default values**: session date, week/day, and metric type pre-filled; only value & athlete change per entry.

---
## Use a Tabular Input Grid (Spreadsheet-Like Interface)
Instead of a single-form-per-entry: **Single row per athlete attempt**, like an editable table.

| Athlete | Metric | Attempt | Value | Display |
| ------- | ------ | ------- | ----- | ------- |
| Evan    | Fly-10 | 1       | 1.12  | 19.95   |
| Levi    | Fly-10 | 1       | 1.15  | 19.41   |
-  **Enter value and hit Enter** → moves to next athlete automatically.
- Multiple attempts can be added as new rows quickly.

> [!NOTE] GPT Note:
> Libraries like **Streamlit Ag-Grid**, **Gradio Table**, or **Tkinter Treeview** support this workflow.
    

---
## Pre-load Athlete-Metric Combinations
- Create a **template grid for the session** with all athletes + planned metrics.
   - Only **enter value** as athletes perform.
   - Auto-compute `display_value` and attempt number in the background.   

---
## Real-Time Sorting for Leaderboard
- Keep the table **live-sorted**:
    - Time-based metrics → ascending
    - Distance-based → descending
- Show **best attempt per athlete** immediately for quick feedback.
- Color code by gender.

---
## Technical Implementation
- **[[Data Entry Streamlit Code-Fragment_Working|Streamlit Ag-Grid]]**: editable spreadsheet, can pre-load all rows for the session, auto-calculate `display_value`.
- **Tkinter Grid/Table**: similar, desktop-based.
- **Pandas DataFrame in memory**: append each row as value is entered, auto-save to CSV every few seconds.

---
### Suggested Flow
1. **Pre-load session grid** → Athlete + Metric + Attempt columns populated.
2. **Coach types value** → `display_value` auto-calculated, attempt recorded automatically.
3. **Enter** → moves cursor to next row.
4. **Live leaderboard** updates as each row is filled.
5. **End of session** → export to session CSV → merge into master dataset.

---
# **Key Principle:**
Reduce form navigation; make value entry the **primary and almost only action** during the session. 
Pre-populate everything else.