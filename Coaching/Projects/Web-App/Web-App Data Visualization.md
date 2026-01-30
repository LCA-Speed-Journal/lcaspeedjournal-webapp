---
topic: 
tags: 
related:
---
created: 2025-09-03 10:49
modified: 2025-09-03 10:49
___
# Card-Based Leaderboard
- Display 3 cards per row, ranked by performance
- Individual Card Information:
	- Gender accents → names in blue/pink/green.
	- Podium borders → gold, silver, bronze left stripe for top 3.
	- Rank Identifiers → #1 (name), #2 (name), etc.
	- Delta value → shows raw input if it differs from displayed unit (useful for converted values).
	- Polished styling → rounded corners, shadows, consistent borders.

```
from streamlit_extras.metric_cards import style_metric_cards

# -------------------- RIGHT COLUMN --------------------
with col2:
    st.header("Live Leaderboard")

    data = st.session_state.session_grid.copy()

    for metric_name in selected_metrics:
        st.subheader(f"{metric_name} Leaderboard")

        metric_rows = data[data["metric_name"] == metric_name].copy()
        metric_rows = metric_rows.dropna(subset=["best_attempt"])

        if metric_rows.empty:
            st.info(f"No results yet for {metric_name}")
            continue

        # Sort: lowest wins if "time", highest wins otherwise
        metric_type = metric_rows.iloc[0]["metric_type"]
        metric_rows = metric_rows.sort_values(
            by="best_attempt",
            ascending=(metric_type == "time")
        ).reset_index(drop=True)

        # Podium border colors (1st gold, 2nd silver, 3rd bronze)
        podium_colors = ["#FFD700", "#C0C0C0", "#CD7F32"]

        # Loop in chunks of 3 for card rows
        for i in range(0, len(metric_rows), 3):
            cols = st.columns(3, gap="large")

            for j, col in enumerate(cols):
                if i + j >= len(metric_rows):
                    continue

                row = metric_rows.iloc[i + j]
                rank = i + j + 1  # 1-based rank

                # Gender-based name color
                gender = row.get("gender", "Other")
                if gender == "M":
                    name_color = "blue"
                elif gender == "F":
                    name_color = "deeppink"
                else:
                    name_color = "green"

                # Name with rank + color
                name_html = (
                    f"<span style='font-weight:bold'>#{rank} "
                    f"<span style='color:{name_color}'>{row['athlete_name']}</span>"
                    f"</span>"
                )

                # Podium border highlight or default
                border_color = (
                    podium_colors[i + j]
                    if i + j < len(podium_colors)
                    else "#9AD8E1"
                )

                # Metric card
                col.metric(
                    label=name_html,
                    value=f"{row['display_best']} {row['display_unit']}",
                    delta=(
                        f"{row['best_attempt']} {row['input_unit']}"
                        if row['input_unit'] != row['display_unit']
                        else ""
                    ),
                )

                # Apply style after rendering
                style_metric_cards(
                    border_size_px=2,
                    border_radius_px=10,
                    border_left_color=border_color,
                    box_shadow=True,
                )
```

# Dynamic Split-Entry

```
import streamlit as st
import pandas as pd
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode, JsCode
from datetime import date
from streamlit_extras.metric_cards import style_metric_cards

# ------ Load reference data ------
athletes = pd.read_csv("Athletes.csv")
metrics = pd.read_csv("Metrics.csv")
athletes['athlete_name'] = athletes['first_name'] + " " + athletes['last_name']

# ------ Initialize session state ------
if "session_grid" not in st.session_state:
    st.session_state.session_grid = pd.DataFrame()

# ------ Session metadata ------
st.sidebar.subheader("Session Info")
session_date = st.sidebar.date_input("Session Date", date.today())
session_week = st.sidebar.selectbox("Week Number", [f"Week {i}" for i in range(1, 14)])
session_day = st.sidebar.number_input("Day in Week", min_value=1, max_value=7, value=1)

# ------ Metric selection ------
selected_category = st.selectbox("Category", options=metrics['category'].unique())
families = metrics[metrics['category'] == selected_category]['metric_family'].dropna().unique()
selected_family = st.selectbox("Metric Family", options=families)
variants = metrics[
    (metrics['category'] == selected_category) & (metrics['metric_family'] == selected_family)
]['metric_variant'].dropna().unique()
selected_variant = st.selectbox("Metric Variant", options=variants)

# ------ Speed-specific split configuration ------
split_locations = []
if selected_category == "Speed":
    num_splits = st.number_input("Number of splits for this trial", min_value=1, value=2)
    st.write("Enter gate positions (meters):")
    cols = st.columns(num_splits)
    for i in range(num_splits):
        loc = cols[i].number_input(f"Split {i+1} (m)", min_value=0.0)
        split_locations.append(loc)

# ------ Build session grid columns dynamically ------
grid_columns = ["athlete_id", "athlete_name", "trial_number"]
grid_columns += [f"{int(loc)}m" for loc in split_locations]  # Raw split times
grid_columns += ["best_acc", "best_maxV"]  # Computed columns

# ------ Populate grid rows for this metric ------
data = st.session_state.session_grid.copy()
new_rows = []

for _, athlete in athletes.iterrows():
    # Check if athlete already has this trial row to avoid duplicates
    exists = (
        (data['athlete_id'] == athlete['athlete_id']) &
        (data['metric_family'] == selected_family) &
        (data['metric_variant'] == selected_variant)
    ).any()
    if exists:
        continue

    row = {col: None for col in grid_columns}
    row.update({
        "athlete_id": athlete['athlete_id'],
        "athlete_name": athlete['athlete_name'],
        "trial_number": 1,  # Could extend to multiple trials
        "metric_family": selected_family,
        "metric_variant": selected_variant,
        "category": selected_category
    })
    new_rows.append(row)

# Append new rows to the session grid
if new_rows:
    data = pd.concat([data, pd.DataFrame(new_rows)], ignore_index=True)

# ------ Compute derived splits automatically ------
for idx, row in data.iterrows():
    times = [row.get(f"{int(loc)}m") for loc in split_locations]
    if None not in times:
        # Acceleration: start → each gate
        row['best_acc'] = max(times) - min(times)
        # MaxV: max of consecutive differences
        maxv_splits = [times[i+1] - times[i] for i in range(len(times)-1)]
        row['best_maxV'] = max(maxv_splits)
        data.loc[idx, 'best_acc'] = round(row['best_acc'], 3)
        data.loc[idx, 'best_maxV'] = round(row['best_maxV'], 3)

st.session_state.session_grid = data

# ------ Build AgGrid for editable entry ------
gb = GridOptionsBuilder.from_dataframe(data)
gb.configure_default_column(editable=True)
grid_options = gb.build()
st.subheader("Enter Split Times")
grid_response = AgGrid(
    data,
    gridOptions=grid_options,
    update_mode=GridUpdateMode.VALUE_CHANGED,
    allow_unsafe_jscode=True,
    height=500,
    fit_columns_on_grid_load=True
)

# Recompute derived splits whenever a value changes
data = pd.DataFrame(grid_response['data'])
for idx, row in data.iterrows():
    times = [row.get(f"{int(loc)}m") for loc in split_locations]
    if None not in times:
        row['best_acc'] = max(times) - min(times)
        maxv_splits = [times[i+1] - times[i] for i in range(len(times)-1)]
        row['best_maxV'] = max(maxv_splits)
        data.loc[idx, 'best_acc'] = round(row['best_acc'], 3)
        data.loc[idx, 'best_maxV'] = round(row['best_maxV'], 3)

st.session_state.session_grid = data

# ------ Leaderboard as metric cards ------
st.header(f"{selected_family} ({selected_variant}) Leaderboard")

if not data.empty:
    # Sort by best_acc for simplicity (can be adjusted)
    leaderboard = data.sort_values(by='best_acc', ascending=True).reset_index(drop=True)
    podium_colors = ["#FFD700", "#C0C0C0", "#CD7F32"]

    for i in range(0, len(leaderboard), 3):
        cols = st.columns(3, gap="large")
        for j, col_obj in enumerate(cols):
            if i + j >= len(leaderboard):
                continue
            row = leaderboard.iloc[i + j]
            rank = i + j + 1

            # Gender coloring
            gender = row.get("gender", "Other")
            if gender == "M":
                name_color = "blue"
            elif gender == "F":
                name_color = "deeppink"
            else:
                name_color = "green"

            # Name with rank
            name_html = f"<span style='font-weight:bold'>#{rank} <span style='color:{name_color}'>{row['athlete_name']}</span></span>"

            # Podium border
            border_color = podium_colors[i+j] if i+j < len(podium_colors) else "#9AD8E1"

            # Metric card
            col_obj.metric(
                label=name_html,
                value=f"{row['best_acc']} s",
                delta=f"{row['best_maxV']} s" if row['best_acc'] != row['best_maxV'] else ""
            )

            style_metric_cards(
                background_color="#FFF",
                border_size_px=2,
                border_color="#DDD",
                border_radius_px=10,
                border_left_color=border_color,
                box_shadow=True
            )

```

# Dual Leaderboard for Speed/X-Factor: Top-6 Only

```
import streamlit as st
from streamlit_extras.metric_cards import style_metric_cards
import pandas as pd

# Load your session grid
data = st.session_state.session_grid.copy()

# Determine which metric types are in this session
has_speed = "Speed" in data['category'].unique()
has_xfactor = "X-Factor" in data['category'].unique()

def render_leaderboard(metric_type):
    st.subheader(f"{metric_type} Leaderboard (Top 6)")

    # Filter for current metric type
    df = data[data['category'] == metric_type].copy()
    if df.empty:
        st.write(f"No {metric_type} metrics recorded this session.")
        return

    # Determine primary value column
    if metric_type == "Speed":
        value_col = "best_acc"  # or "best_maxV" depending on context
    else:
        # X-Factor: find the last attempt column dynamically
        attempt_cols = [c for c in df.columns if "attempt" in c or "Attempt" in c]
        value_col = attempt_cols[-1] if attempt_cols else None

    if value_col is None:
        st.write(f"No attempt columns found for {metric_type}.")
        return

    # Sort by primary value
    ascending = True if metric_type == "Speed" else False  # lower is better for time
    leaderboard = df.sort_values(by=value_col, ascending=ascending).head(6).reset_index(drop=True)

    # Podium colors for top 3
    podium_colors = ["#FFD700", "#C0C0C0", "#CD7F32"]  

    # Render metric cards, 3 per row
    for i in range(0, len(leaderboard), 3):
        cols = st.columns(3, gap="large")
        for j, col_obj in enumerate(cols):
            if i + j >= len(leaderboard):
                continue
            row = leaderboard.iloc[i + j]
            rank = i + j + 1

            # Gender-based name color
            gender = row.get("gender", "Other")
            if gender == "M":
                name_color = "blue"
            elif gender == "F":
                name_color = "deeppink"
            else:
                name_color = "green"

            # Podium border
            border_color = podium_colors[i + j] if i + j < len(podium_colors) else "#9AD8E1"

            # Card label with rank + name
            label_html = f"<span style='font-weight:bold'>#{rank} <span style='color:{name_color}'>{row['athlete_name']}</span></span>"

            # Value and delta (for Speed: best_acc vs best_maxV)
            if metric_type == "Speed":
                value = f"{row['best_acc']} s"
                delta = f"{row['best_maxV']} s" if row['best_acc'] != row['best_maxV'] else ""
            else:
                value = f"{row[value_col]}"
                delta = ""  # X-Factor doesn't have delta

            col_obj.metric(label=label_html, value=value, delta=delta)

            style_metric_cards(
                background_color="#FFF",
                border_size_px=2,
                border_color="#DDD",
                border_radius_px=10,
                border_left_color=border_color,
                box_shadow=True
            )

# Render leaderboards conditionally
if has_speed:
    render_leaderboard("Speed")

if has_xfactor:
    render_leaderboard("X-Factor")

```
# Longitudinal Graph: Session-by-Session Progress

```
st.subheader(f"Progression of {selected_metric} Across Sessions")
# Best per athlete per session
best_per_session = filtered_df.loc[
    filtered_df.groupby(['athlete_name','session_date'])['input_value'].idxmin()
] if metric_type == 'time' else \
filtered_df.loc[filtered_df.groupby(['athlete_name','session_date'])['input_value'].idxmax()]

fig = px.line(best_per_session, x='session_date', y='display_value', color='athlete_name',
              line_dash='gender', markers=True,
              hover_data=['input_value','attempt_number'],
              title=f"{selected_metric} Progression Across Season")

# Add phase boundaries (example hard-coded)
phases = {
    'Preseason': ('2026-03-09','2026-03-22'),
    'Preparation': ('2026-03-23','2026-04-12'),
    'Competition': ('2026-04-13','2026-05-10'),
    'Championship': ('2026-05-11','2026-05-31')
}
for phase_name, (start_date, end_date) in phases.items():
    fig.add_vline(x=pd.to_datetime(start_date), line_dash="dot", annotation_text=phase_name, line_color='gray')

st.plotly_chart(fig, use_container_width=True)
```
# Export Options

```
st.subheader("Export Options")
if st.button("Export Filtered Leaderboard CSV"):
    best_per_athlete.to_csv(f"Leaderboard_{selected_metric}.csv", index=False)
    st.success("Leaderboard exported!")

if st.button("Export Progression Graph as HTML"):
    fig.write_html(f"Progression_{selected_metric}.html")
    st.success("Progression graph exported!")
```