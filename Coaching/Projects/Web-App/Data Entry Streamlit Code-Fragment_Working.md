# Script 3.0 (Pretty Much Working Now)
```
# Data-Visualization
import streamlit as st
import pandas as pd
import numpy as np
import hashlib
import altair as alt
import plotly.express as px
from pathlib import Path
from glob import glob

# -------------------------------
# 1. Load Data
# -------------------------------
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "sessions"

st.set_page_config(layout="wide")

@st.cache_data
def load_all_sessions():
    files = glob(str(DATA_DIR / "*.csv"))
    if not files:
        return pd.DataFrame(), []
    df_list = [pd.read_csv(f) for f in files]
    return pd.concat(df_list, ignore_index=True), files

data, files = load_all_sessions()

st.write("Looking for CSVs in:", DATA_DIR)
st.write("Files found:", files)

if data.empty:
    st.warning("No session data found. Please upload CSVs to the 'data/sessions' folder.")
    st.stop()

# -------------------------------
# 2. Sidebar Filters
# -------------------------------
st.sidebar.header("Filters")

# Parse date column and extract year
if "date" in data.columns:
    data["date"] = pd.to_datetime(data["date"], errors="coerce")
    data["year"] = data["date"].dt.year
    year_options = sorted(data["year"].dropna().unique())
    year_filter = st.sidebar.multiselect("Select Year(s)", options=year_options)
else:
    year_filter = []
    st.sidebar.info("No date column found in dataset.")

athlete_filter = st.sidebar.multiselect("Select Athlete(s)", options=data['athlete_name'].unique())
metric_filter = st.sidebar.multiselect("Select Metric(s)", options=data['metric_name'].unique())

season_phase_filter = st.sidebar.multiselect("Season Phase(s)", options=data['season_phase'].unique())

# Grade filter
if "grade" in data.columns:
    grade_options = sorted(data['grade'].dropna().unique())
    grade_filter = st.sidebar.multiselect("Select Grade(s)", options=grade_options)
else:
    grade_filter = []
    st.sidebar.info("No grade column found in dataset.")

week_range = st.sidebar.slider(
    "Week Number Range",
    min_value=int(data['week_number'].min()),
    max_value=int(data['week_number'].max()),
    value=(int(data['week_number'].min()), int(data['week_number'].max()))
)

# Toggle for showing gender-split leaderboards
show_gender_split = st.sidebar.checkbox("Show Gender-Split Leaderboards", value=True)

if "gender" in data.columns:
    gender_options = data['gender'].unique()
    gender_filter = st.sidebar.multiselect("Gender", options=gender_options)
else:
    gender_filter = []
    st.sidebar.info("No gender column found in dataset.")

# Apply filters
filtered_data = data[
    (data['athlete_name'].isin(athlete_filter) if athlete_filter else True) &
    (data['metric_name'].isin(metric_filter) if metric_filter else True) &
    (data['season_phase'].isin(season_phase_filter) if season_phase_filter else True) &
    (data['week_number'].between(*week_range)) &
    (data['gender'].isin(gender_filter) if ("gender" in data.columns and gender_filter) else True) &
    (data['year'].isin(year_filter) if year_filter else True) &
    (data['grade'].isin(grade_filter) if grade_filter else True)
]

# -------------------------------
# 3. Leaderboards
# -------------------------------
st.header("All-Time Leaderboards")
metric_categories = filtered_data['metric_category'].unique().tolist()

# -------------------------------
# Render Chart Function
# -------------------------------
def render_chart(df, title_suffix="", gendered=False, label="Metric", unit="", ascending=True):

    # Defensive copy & ordering
    df = df.copy().reset_index(drop=True)
    df = df.sort_values("display_value", ascending=not ascending).reset_index(drop=True)  # flipped
    df["rank"] = range(len(df))

    # Units
    input_unit = df['input_unit'].iloc[0] if "input_unit" in df.columns else ""
    display_unit = unit

    # Rename for table
    df_renamed = df.rename(columns={
        "display_value": f"Output ({display_unit})",
        "input_value": f"Input ({input_unit})"
    })

    # Unique keys
    df_hash = hashlib.md5(pd.util.hash_pandas_object(df, index=True).values).hexdigest()[:8]
    gender_suffix = f"-{gendered}" if gendered else ""
    chart_key = f"chart-{label}{title_suffix}{gender_suffix}-{df_hash}"
    table_key = f"table-{label}{title_suffix}{gender_suffix}-{df_hash}"

    # Color mapping
    if "gender" in df.columns:
        color_scale = alt.Scale(domain=["M", "F", "Other"],
                                range=["#89CFF0", "#FFC0CB", "#D3D3D3"])
    else:
        color_scale = alt.Scale(domain=["NA"], range=["#89CFF0"])

    # Altair bar chart
    chart = alt.Chart(df).mark_bar().encode(
        x=alt.X("display_value:Q", title=f"{label} ({unit})"),
        y=alt.Y("athlete_name:N",
                sort=df["athlete_name"].tolist()),  # force use of df order
        color=alt.Color("gender:N", scale=color_scale, legend=alt.Legend(title="Gender")) 
            if "gender" in df.columns else alt.value("#89CFF0"),
        tooltip=[
            alt.Tooltip("athlete_name:N", title="Athlete"),
            alt.Tooltip("display_value:Q", title=f"Output ({display_unit})", format=".2f"),
            alt.Tooltip("input_value:Q", title=f"Input ({input_unit})", format=".2f"),
            alt.Tooltip("date:T", title="Date")
        ]
    ).properties(
        height=max(300, len(df) * 40),
        width="container"
    )

    # Streamlit layout
    col1, col2 = st.columns([2, 1])
    with col1:
        st.altair_chart(chart, use_container_width=True, key=chart_key)
    with col2:
        display_cols = ["athlete_name", f"Output ({display_unit})", f"Input ({input_unit})", "date"]
        existing_cols = [c for c in display_cols if c in df_renamed.columns]
        st.dataframe(df_renamed[existing_cols].style.format({
            f"Output ({display_unit})": "{:.2f}",
            f"Input ({input_unit})": "{:.2f}"
        }), key=table_key)

    st.subheader(f"{label} Leaderboard")

# -------------------------------
# Leaderboard Tabs
# -------------------------------
if not metric_categories:
    st.info("No metrics available with current filters.")
else:
    category_tabs = st.tabs(metric_categories)

    for i, category in enumerate(metric_categories):
        with category_tabs[i]:
            category_data = filtered_data[filtered_data['metric_category'] == category]

            # Special handling for Speed
            if category.lower() == "speed":
                speed_families = ["maxv", "acceleration"]
                sub_tabs = st.tabs(["Max-Velocity", "Acceleration"])

                for sf_i, sf in enumerate(speed_families):
                    with sub_tabs[sf_i]:
                        family_data = category_data[category_data['metric_family'].str.lower() == sf]

                        if sf == "maxv":
                            metric_tabs_labels = ["Max-Velocity (All Splits)"]
                            preferred_order = ["10-20m Split", "20-30m Split", "30-40m Split"]
                            metrics = family_data['metric_name'].unique().tolist()
                            ordered_metrics = [m for m in preferred_order if m in metrics]
                            metrics = ordered_metrics + [m for m in metrics if m not in ordered_metrics]
                            metric_tabs_labels.extend(metrics)
                        else:
                            metric_tabs_labels = family_data['metric_name'].unique().tolist()

                        metric_tabs = st.tabs(metric_tabs_labels)

                        for j, label in enumerate(metric_tabs_labels):
                            with metric_tabs[j]:
                                if label == "Max-Velocity (All Splits)":
                                    working_data = family_data
                                else:
                                    working_data = family_data[family_data['metric_name'] == label]

                                if working_data.empty:
                                    st.info(f"No data for {label}.")
                                    continue

                                unit = working_data['display_unit'].iloc[0]

                                if 'gender' in working_data.columns:
                                    composite_leaderboard = working_data.loc[
                                        working_data.groupby("athlete_name")["display_value"].idxmax()
                                    ][["athlete_name", "display_value", "input_value", "date", "gender"]]
                                    gendered = True
                                else:
                                    composite_leaderboard = working_data.loc[
                                        working_data.groupby("athlete_name")["display_value"].idxmax()
                                    ][["athlete_name", "display_value", "input_value", "date"]]
                                    gendered = False

                                ascending = False if unit.lower() in ["s", "sec", "seconds"] else True
                                composite_leaderboard = composite_leaderboard.sort_values("display_value", ascending=not ascending)  # flipped

                                render_chart(composite_leaderboard, title_suffix="-composite", gendered=gendered, label=label, unit=unit, ascending=ascending)

                                if show_gender_split and 'gender' in working_data.columns:
                                    gendered_leaderboard = working_data.loc[
                                        working_data.groupby(["athlete_name","gender"])["display_value"].idxmax()
                                    ][["athlete_name", "display_value", "input_value", "date", "gender"]]

                                    for g in gendered_leaderboard['gender'].unique():
                                        g_df = gendered_leaderboard[gendered_leaderboard['gender'] == g]
                                        g_df = g_df.sort_values("display_value", ascending=not ascending)  # flipped
                                        render_chart(g_df, title_suffix=f"-{g}", gendered=True, label=label, unit=unit, ascending=ascending)

            # Non-speed categories
            else:
                metrics = category_data['metric_name'].unique().tolist()
                metric_tabs = st.tabs(metrics)

                for j, label in enumerate(metrics):
                    with metric_tabs[j]:
                        working_data = category_data[category_data['metric_name'] == label]
                        if working_data.empty:
                            st.info(f"No data for {label}.")
                            continue

                        unit = working_data['display_unit'].iloc[0]

                        if 'gender' in working_data.columns:
                            composite_leaderboard = working_data.loc[
                                working_data.groupby("athlete_name")["display_value"].idxmax()
                            ][["athlete_name", "display_value", "input_value", "date", "gender"]]
                            gendered = True
                        else:
                            composite_leaderboard = working_data.loc[
                                working_data.groupby("athlete_name")["display_value"].idxmax()
                            ][["athlete_name", "display_value", "input_value", "date"]]
                            gendered = False

                        ascending = False if unit.lower() in ["s", "sec", "seconds"] else True
                        composite_leaderboard = composite_leaderboard.sort_values("display_value", ascending=not ascending)  # flipped

                        render_chart(composite_leaderboard, title_suffix="-composite", gendered=gendered, label=label, unit=unit, ascending=ascending)

                        if show_gender_split and 'gender' in working_data.columns:
                            gendered_leaderboard = working_data.loc[
                                working_data.groupby(["athlete_name","gender"])["display_value"].idxmax()
                            ][["athlete_name", "display_value", "input_value", "date", "gender"]]

                            for g in gendered_leaderboard['gender'].unique():
                                g_df = gendered_leaderboard[gendered_leaderboard['gender'] == g]
                                g_df = g_df.sort_values("display_value", ascending=not ascending)  # flipped
                                render_chart(g_df, title_suffix=f"-{g}", gendered=True, label=label, unit=unit, ascending=ascending)

# -------------------------------
# 4. Notes / Sidebar
# -------------------------------
st.sidebar.markdown("---")
st.sidebar.markdown("App by Coach Ross")
st.sidebar.markdown("Data auto-updates from CSVs in `data/sessions` folder.")
```
# Script 2.0 (Works, Dynamic Athlete Population)

```
import streamlit as st
import pandas as pd
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode, JsCode
from datetime import date

# ============================================================
# ------------------ CONSTANTS ------------------------------
# ============================================================
WEEKS = [f"Week {i}" for i in range(1, 14)]
PODIUM_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"]
DEFAULT_ATTEMPTS = 2

st.set_page_config(layout="wide")

# ============================================================
# ------------------ LOAD DATA ------------------------------
# ============================================================
athletes = pd.read_csv("Athletes.csv")
metrics = pd.read_csv("Metrics.csv")
athletes["athlete_name"] = athletes["first_name"] + " " + athletes["last_name"]

# ============================================================
# ------------------ SESSION STATE --------------------------
# ============================================================
if "selected_metrics" not in st.session_state:
    st.session_state.selected_metrics = [metrics["name"].iloc[0]]

if "session_grid" not in st.session_state:
    st.session_state.session_grid = None

if "new_athletes_session" not in st.session_state:
    st.session_state.new_athletes_session = []

# ============================================================
# ------------------ HELPERS --------------------------------
# ============================================================
def build_session_grid(selected_metrics, attempts_per_athlete, session_athletes):
    """Build session grid for selected athletes and metrics."""
    selected_metrics_df = metrics[metrics["name"].isin(selected_metrics)]

    # Merge athletes with metrics
    df = (
        session_athletes.assign(key=1)
        .merge(selected_metrics_df.assign(key=1), on="key", how="outer")
        .drop("key", axis=1)
    )

    # Rename "name" → "metric_name" to match expected column names
    if "name" in df.columns:
        df = df.rename(columns={"name": "metric_name"})

    # Repeat per attempt
    df = df.loc[df.index.repeat(attempts_per_athlete)].copy()
    df["attempt_number"] = df.groupby(["athlete_id", "metric_id"], dropna=False).cumcount() + 1

    # Ensure all required columns exist
    for col in ["input_value","display_value","is_best","best_attempt","display_best",
                "metric_name","metric_type","input_unit","display_unit","conversion_formula"]:
        if col not in df.columns:
            df[col] = None

    return df


def recalc_results(df):
    """Recalculate display values and best attempts per athlete+metric."""

    def safe_convert(val, formula):
        if pd.isna(val):
            return None
        try:
            return round(eval(formula, {"__builtins__": {}}, {"value": float(val)}), 1)
        except Exception:
            return None

    df["display_value"] = df.apply(
        lambda r: safe_convert(r["input_value"], r.get("conversion_formula","value")), axis=1
    )

    df[["is_best","best_attempt","display_best"]] = None

    valid_rows = df.dropna(subset=["metric_name","athlete_id"])
    for (metric, athlete), group in valid_rows.groupby(["metric_name","athlete_id"], dropna=False):
        metric_type = group["metric_type"].iloc[0] if "metric_type" in group else "distance"
        filled = group[group["input_value"].notna()]
        if filled.empty:
            continue
        best_idx = (
        filled["input_value"].astype(float).idxmin()
        if metric_type!="time"
        else filled["input_value"].astype(float).idxmax()
        )

        df.loc[best_idx, "is_best"] = True
        df.loc[best_idx, "best_attempt"] = df.loc[best_idx, "input_value"]
        df.loc[best_idx, "display_best"] = df.loc[best_idx, "display_value"]

    return df


def render_leaderboard(metric_rows, metric_type, unit_display, unit_input):
    """Render leaderboard cards in rows of 3."""
    ascending = False if str(metric_type).lower() == "time" else True
    metric_rows = metric_rows.sort_values(by="best_attempt", ascending=ascending)

    for i in range(0, len(metric_rows), 3):
        cols = st.columns(3, gap="large")
        for j, col in enumerate(cols):
            if i+j >= len(metric_rows):
                continue
            row = metric_rows.iloc[i+j]
            rank = i+j+1

            gender = row.get("gender","Other")
            name_color = {"M":"blue","F":"deeppink"}.get(gender,"green")
            border_color = PODIUM_COLORS[i+j] if i+j < len(PODIUM_COLORS) else "#9AD8E1"

            card_html = f"""
            <div style="
                border-left: 8px solid {border_color};
                border-radius: 10px;
                box-shadow: 0px 2px 6px rgba(0,0,0,0.15);
                padding: 12px;
                margin-bottom: 12px;
            ">
                <div style="font-weight:bold; font-size:24px; margin-bottom:4px;">
                    #{rank} <span style="color:{name_color}">{row['athlete_name']}</span>
                </div>
                <div style="font-size:42px; font-weight:bold;">
                    {row['display_best'] if row['display_best'] is not None else ""} {unit_display}
                </div>
                <div style="font-size:18px; color:gray;">
                    {f'{row["best_attempt"]} {unit_input}' if row.get("best_attempt") is not None and unit_input != unit_display else ""}
                </div>
            </div>
            """
            col.markdown(card_html, unsafe_allow_html=True)

# ============================================================
# ------------------ LAYOUT ---------------------------------
# ============================================================
col1, col2 = st.columns([1,2])

# ---------------- LEFT COLUMN ----------------
with col1:
    st.subheader("Session Info & Athlete Selection")

    session_date = st.date_input("Session Date", date.today())
    session_week = st.selectbox("Week Number", WEEKS)
    session_day = st.number_input("Day in Week", min_value=1, max_value=7, value=1)

    athlete_options = athletes["athlete_name"].tolist()
    selected_athletes_existing = st.multiselect(
        "Select athletes from existing list",
        options=athlete_options,
        default=athlete_options[:],
        help="Select athletes participating in this session"
    )

    # Add new athlete input
    new_name = st.text_input("Add a new athlete (First Last)")
    if st.button("Add Athlete") and new_name.strip():
        if new_name.strip() not in st.session_state.new_athletes_session:
            st.session_state.new_athletes_session.append(new_name.strip())
            st.success(f"Added athlete: {new_name.strip()}")

    selected_athletes = selected_athletes_existing + st.session_state.new_athletes_session

    selected_metrics = st.multiselect(
        "Select metrics for session",
        metrics["name"],
        default=st.session_state.selected_metrics
    )

    attempts_per_athlete = st.number_input(
        "Attempts per athlete per metric", min_value=1, value=DEFAULT_ATTEMPTS
    )

    # Build session athletes
    new_athletes = [name for name in selected_athletes if name not in athlete_options]
    if new_athletes:
        new_rows = pd.DataFrame({
            "athlete_id":[athletes["athlete_id"].max()+i+1 for i in range(len(new_athletes))],
            "first_name":[name.split()[0] for name in new_athletes],
            "last_name":[name.split()[-1] if len(name.split())>1 else "" for name in new_athletes],
            "athlete_name":new_athletes,
            "gender":"Other"
        })
        session_athletes = pd.concat([athletes[athletes["athlete_name"].isin(selected_athletes)], new_rows], ignore_index=True)
    else:
        session_athletes = athletes[athletes["athlete_name"].isin(selected_athletes)]

    rebuild_grid = (
        selected_metrics != st.session_state.selected_metrics
        or st.session_state.session_grid is None
        or len(session_athletes) != len(st.session_state.session_grid["athlete_id"].unique())
    )

    if rebuild_grid:
        st.session_state.selected_metrics = selected_metrics
        st.session_state.session_grid = build_session_grid(
            selected_metrics, attempts_per_athlete, session_athletes
        )

    data = st.session_state.session_grid.copy()
    if not data.empty:
        gb = GridOptionsBuilder.from_dataframe(data)
        gb.configure_default_column(editable=False)
        gb.configure_column("input_value", editable=True)

        best_js = JsCode("""
        function(params) {
            if(params.data.is_best) return {'backgroundColor':'#2ca02c','color':'white','fontWeight':'bold'};
            if(params.data.input_value==null) return {'backgroundColor':'#f0ad4e','color':'black'};
            return {};
        }""")
        gb.configure_column("input_value", cellStyle=best_js)
        gb.configure_column("display_value", cellStyle=best_js)

        gender_js = JsCode("""
        function(params) {
            if(params.data.gender=='M') return {'backgroundColor':'#add8e6'};
            if(params.data.gender=='F') return {'backgroundColor':'#ffc0cb'};
            return {};
        }""")
        gb.configure_column("athlete_name", cellStyle=gender_js)

        priority_cols = ["athlete_name","metric_name","input_value","display_value","attempt_number"]
        for i, col in enumerate(priority_cols):
            gb.configure_column(col, pinned="left", width=150, order=i)

        hidden_cols = ["athlete_id","metric_id","metric_type","category","input_unit","display_unit",
                       "conversion_formula","is_best", "first_name", "last_name", "gender","best_attempt","display_best"]
        gb.configure_columns(hidden_cols, hide=True)

        grid_response = AgGrid(
            data,
            gridOptions=gb.build(),
            update_mode=GridUpdateMode.NO_UPDATE,  # <-- prevent automatic update
            allow_unsafe_jscode=True,
            height=500,
            fit_columns_on_grid_load=True,
            reload_data=False
        )
        #st.session_state.session_grid = recalc_results(pd.DataFrame(grid_response["data"]))
    if st.button("Update Leaderboard & Table"):
        # Use the latest grid data for recalculation
        st.session_state.session_grid = recalc_results(pd.DataFrame(grid_response["data"]))
        st.success("Leaderboard and table updated!")

# ---------------- RIGHT COLUMN ----------------
with col2:
    st.header("Live Leaderboard")
    data = st.session_state.session_grid.copy()

    for metric_name in selected_metrics:
        st.subheader(f"{metric_name} Leaderboard")
        metric_rows = data[data["metric_name"]==metric_name].dropna(subset=["best_attempt"])
        if metric_rows.empty:
            st.info(f"No results yet for {metric_name}")
            continue
        metric_type = metric_rows.iloc[0]["metric_type"]
        render_leaderboard(
            metric_rows,
            metric_type,
            metric_rows.iloc[0]["display_unit"],
            metric_rows.iloc[0]["input_unit"]
        )
```
# Old-Script (works)
```
import streamlit as st
import pandas as pd
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode, JsCode
from streamlit_extras.metric_cards import style_metric_cards
from datetime import date

st.set_page_config(layout="wide")

# ------ Load reference data ------
athletes = pd.read_csv("Athletes.csv")
metrics = pd.read_csv("Metrics.csv")
athletes['athlete_name'] = athletes['first_name'] + " " + athletes['last_name']

# ------ Initialize session state for metrics selection ------
if "selected_metrics" not in st.session_state:
    st.session_state.selected_metrics = [metrics['name'][0]]

# ------ Two-column layout ------
col1, col2 = st.columns([1,2])  # left: entry grid, right: leaderboard

# -------------------- LEFT COLUMN --------------------
with col1:
    st.subheader("Enter Values for All Athletes/Attempts")

    # ------ Session metadata/settings below table ------
    session_date = st.date_input("Session Date", date.today())
    session_week = st.selectbox("Week Number", [f"Week {i}" for i in range(1,14)])
    session_day = st.number_input("Day in Week", min_value=1, max_value=7, value=1)
    selected_metrics = st.multiselect(
        "Select metrics for session",
        metrics['name'],
        default=st.session_state.selected_metrics
    )

    # Update session state and force grid rebuild if selection changed
    if selected_metrics != st.session_state.selected_metrics:
        st.session_state.selected_metrics = selected_metrics
        st.session_state.session_grid = None

    attempts_per_athlete = st.number_input("Attempts per athlete per metric", min_value=1, value=2)

    # ------ Initialize session grid if it doesn't exist ------
    if "session_grid" not in st.session_state or st.session_state.session_grid is None:
        session_grid = []
        for _, athlete in athletes.iterrows():
            for metric_name in st.session_state.selected_metrics:
                metric_row = metrics[metrics['name'] == metric_name].iloc[0]
                for attempt in range(1, attempts_per_athlete+1):
                    session_grid.append({
                        "athlete_id": athlete['athlete_id'],
                        "athlete_name": athlete['athlete_name'],
                        "gender": athlete['gender'],
                        "metric_id": metric_row['metric_id'],
                        "metric_name": metric_name,
                        "metric_type": metric_row['type'],
                        "category": metric_row['category'],
                        "input_unit": metric_row['input_unit'],
                        "display_unit": metric_row['display_unit'],
                        "conversion_formula": metric_row['conversion_formula'],
                        "input_value": None,
                        "display_value": None,
                        "attempt_number": attempt,
                        "is_best": False,
                        "best_attempt": None,
                        "display_best": None
                    })
        st.session_state.session_grid = pd.DataFrame(session_grid)

    data = st.session_state.session_grid.copy()

    # ------ Build editable AgGrid ------
    if not data.empty:
        gb = GridOptionsBuilder.from_dataframe(data)
        gb.configure_default_column(editable=False)  # lock all by default
        gb.configure_column("input_value", editable=True)  # only input_value editable

        # Highlight best attempts & missing inputs
        best_attempt_js = JsCode("""
        function(params) {
            if (params.data.is_best) return {'backgroundColor':'#2ca02c','color':'white','fontWeight':'bold'};
            if (params.data.input_value == null) return {'backgroundColor':'#f0ad4e','color':'black'};
            return {};
        }
        """)
        gb.configure_column("input_value", cellStyle=best_attempt_js)
        gb.configure_column("display_value", cellStyle=best_attempt_js)

        # Gender coloring for athlete_name
        gender_color_js = JsCode("""
        function(params) {
            if (params.data.gender == 'M') return {'backgroundColor':'#add8e6'};
            if (params.data.gender == 'F') return {'backgroundColor':'#ffc0cb'};
            return {};
        }
        """)
        gb.configure_column("athlete_name", cellStyle=gender_color_js)

        # Pin priority columns
        priority_cols = ["athlete_name","metric_name","input_value","display_value","attempt_number"]
        for i, col in enumerate(priority_cols):
            gb.configure_column(col, pinned='left', width=150, order=i)

        # Hide metadata columns
        for col in ["athlete_id","metric_id","metric_type","category","input_unit","display_unit","conversion_formula","is_best","gender","best_attempt","display_best"]:
            gb.configure_column(col, hide=True)

        grid_options = gb.build()

        grid_response = AgGrid(
            data,
            gridOptions=grid_options,
            update_mode=GridUpdateMode.VALUE_CHANGED,  # 🔑 recalc after edits
            allow_unsafe_jscode=True,
            height=500,
            fit_columns_on_grid_load=True
        )

        # ------ Recalculate automatically ------
        data = pd.DataFrame(grid_response['data'])

        # Recalculate display values
        for i, row in data.iterrows():
            try:
                val = float(row['input_value'])
                display_val = eval(row['conversion_formula'].replace("value", str(val)))
                display_val = round(display_val, 1)
            except:
                display_val = None
            data.at[i,'display_value'] = display_val

        # Reset best-attempt flags and values
        data['is_best'] = False
        data['best_attempt'] = None
        data['display_best'] = None

        # Update best attempts per athlete + metric
        for metric_name in st.session_state.selected_metrics:
            metric_rows = data[data['metric_name']==metric_name].copy()
            if metric_rows.empty:
                continue
            metric_type = metric_rows.iloc[0]['metric_type']
            for athlete_id, athlete_rows in metric_rows.groupby('athlete_id'):
                filled_rows = athlete_rows[athlete_rows['input_value'].notna()]
                if filled_rows.empty:
                    continue
                best_idx = (
                    filled_rows['input_value'].idxmin()
                    if metric_type=='time'
                    else filled_rows['input_value'].idxmax()
                )
                data.at[best_idx,'is_best'] = True
                data.at[best_idx,'best_attempt'] = data.at[best_idx,'input_value']
                data.at[best_idx,'display_best'] = data.at[best_idx,'display_value']

        st.session_state.session_grid = data


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

        # Podium border colors (gold, silver, bronze)
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

                # Border highlight by placement
                border_color = (
                    podium_colors[i + j]
                    if i + j < len(podium_colors)
                    else "#9AD8E1"
                )

                # Build custom metric card
                card_html = f"""
                <div style="
                    border-left: 8px solid {border_color};
                    border-radius: 10px;
                    box-shadow: 0px 2px 6px rgba(0,0,0,0.15);
                    padding: 12px;
                    margin-bottom: 12px;
                ">
                    <div style="font-weight:bold; font-size:24px; margin-bottom:4px;">
                        #{rank} <span style="color:{name_color}">{row['athlete_name']}</span>
                    </div>
                    <div style="font-size:42px; font-weight:bold;">
                        {row['display_best']} {row['display_unit']}
                    </div>
                    <div style="font-size:18px; color:gray;">
                        {f"{row['best_attempt']} {row['input_unit']}" if row['input_unit'] != row['display_unit'] else ""}
                    </div>
                </div>
                """
                col.markdown(card_html, unsafe_allow_html=True)
```

# Partially-Functional: Dynamic Athlete Entry

```
import streamlit as st
import pandas as pd
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode, JsCode
from datetime import date

# ============================================================
# ------------------ CONSTANTS ------------------------------
# ============================================================
WEEKS = [f"Week {i}" for i in range(1, 14)]
PODIUM_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"]
DEFAULT_ATTEMPTS = 2

st.set_page_config(layout="wide")

# ============================================================
# ------------------ DATA LOADING ---------------------------
# ============================================================
athletes = pd.read_csv("Athletes.csv")
metrics = pd.read_csv("Metrics.csv")
athletes["athlete_name"] = athletes["first_name"] + " " + athletes["last_name"]

# ============================================================
# ------------------ SESSION STATE --------------------------
# ============================================================
if "selected_metrics" not in st.session_state:
    st.session_state.selected_metrics = [metrics["name"].iloc[0]]

if "session_grid" not in st.session_state:
    st.session_state.session_grid = None

if "new_athletes_session" not in st.session_state:
    st.session_state.new_athletes_session = []  # Store all new athletes added this session

# ============================================================
# ------------------ HELPERS --------------------------------
# ============================================================
def build_session_grid(selected_metrics, attempts_per_athlete, session_athletes):
    """Build session grid for selected athletes and metrics."""
    selected_metrics_df = metrics[metrics["name"].isin(selected_metrics)]

    # Merge athletes with metrics
    df = (
        session_athletes.assign(key=1)
        .merge(selected_metrics_df.assign(key=1), on="key", how="outer")  # outer ensures new athletes included
        .drop("key", axis=1)
    )

    # Repeat per attempt
    df = df.loc[df.index.repeat(attempts_per_athlete)].copy()
    df["attempt_number"] = df.groupby(["athlete_id", "metric_id"], dropna=False).cumcount() + 1

    # Ensure all required columns exist
    for col in ["input_value","display_value","is_best","best_attempt","display_best",
                "metric_name","metric_type","input_unit","display_unit","conversion_formula"]:
        if col not in df.columns:
            df[col] = None

    return df


def recalc_results(df):
    """Recalculate display values and best attempts per athlete+metric."""

    def safe_convert(val, formula):
        if pd.isna(val):
            return None
        try:
            return round(eval(formula, {"__builtins__": {}}, {"value": float(val)}), 1)
        except Exception:
            return None

    df["display_value"] = df.apply(
        lambda r: safe_convert(r["input_value"], r.get("conversion_formula","value")), axis=1
    )

    df[["is_best", "best_attempt", "display_best"]] = None

    # Group by metric_name and athlete_id
    if "metric_name" not in df.columns or "athlete_id" not in df.columns:
        return df

    for (metric, athlete), group in df.groupby(["metric_name", "athlete_id"], dropna=False):
        metric_type = group["metric_type"].iloc[0] if "metric_type" in group else "distance"
        filled = group[group["input_value"].notna()]
        if filled.empty:
            continue
        best_idx = (
            filled["input_value"].astype(float).idxmin()
            if metric_type == "time"
            else filled["input_value"].astype(float).idxmax()
        )
        df.loc[best_idx, "is_best"] = True
        df.loc[best_idx, "best_attempt"] = df.loc[best_idx, "input_value"]
        df.loc[best_idx, "display_best"] = df.loc[best_idx, "display_value"]

    return df


def render_leaderboard(metric_rows, metric_type, unit_display, unit_input):
    """Render leaderboard cards in rows of 3."""
    metric_rows = metric_rows.sort_values(
        by="best_attempt", ascending=(metric_type == "time")
    ).reset_index(drop=True)

    for i in range(0, len(metric_rows), 3):
        cols = st.columns(3, gap="large")

        for j, col in enumerate(cols):
            if i + j >= len(metric_rows):
                continue

            row = metric_rows.iloc[i + j]
            rank = i + j + 1

            gender = row.get("gender", "Other")
            name_color = {"M": "blue", "F": "deeppink"}.get(gender, "green")
            border_color = PODIUM_COLORS[i + j] if i + j < len(PODIUM_COLORS) else "#9AD8E1"

            card_html = f"""
            <div style="
                border-left: 8px solid {border_color};
                border-radius: 10px;
                box-shadow: 0px 2px 6px rgba(0,0,0,0.15);
                padding: 12px;
                margin-bottom: 12px;
            ">
                <div style="font-weight:bold; font-size:24px; margin-bottom:4px;">
                    #{rank} <span style="color:{name_color}">{row['athlete_name']}</span>
                </div>
                <div style="font-size:42px; font-weight:bold;">
                    {row['display_best']} {unit_display}
                </div>
                <div style="font-size:18px; color:gray;">
                    {f"{row['best_attempt']} {unit_input}" if unit_input != unit_display else ""}
                </div>
            </div>
            """
            col.markdown(card_html, unsafe_allow_html=True)

# ============================================================
# ------------------ LAYOUT ---------------------------------
# ============================================================
col1, col2 = st.columns([1, 2])

# ---------------- LEFT: ENTRY ----------------
with col1:
    st.subheader("Session Info & Athlete Selection")

    session_date = st.date_input("Session Date", date.today())
    session_week = st.selectbox("Week Number", WEEKS)
    session_day = st.number_input("Day in Week", min_value=1, max_value=7, value=1)

    # ---------------- Athlete Selection ----------------
    st.write("### Select Athletes for This Session")
    athlete_options = athletes["athlete_name"].tolist()

    # Multiselect for existing athletes
    selected_athletes_existing = st.multiselect(
        "Select athletes from existing list",
        options=athlete_options,
        default=athlete_options[:],
        help="Select athletes participating in this session"
    )

    # Text input for new athlete
    new_name = st.text_input("Add a new athlete (First Last)")

    # Button to add the new athlete to session state
    if st.button("Add Athlete") and new_name.strip():
        if new_name.strip() not in st.session_state.new_athletes_session:
            st.session_state.new_athletes_session.append(new_name.strip())
            st.success(f"Added athlete: {new_name.strip()}")

    # Combine existing and new athletes
    selected_athletes = selected_athletes_existing + st.session_state.new_athletes_session

    # ---------------- Metric Selection ----------------
    st.subheader("Select Metrics for This Session")
    selected_metrics = st.multiselect(
        "Metrics",
        options=metrics["name"],
        default=st.session_state.selected_metrics
    )

    attempts_per_athlete = st.number_input(
        "Attempts per athlete per metric", min_value=1, value=DEFAULT_ATTEMPTS
    )

    # Handle new athletes
    new_athletes = [name for name in selected_athletes if name not in athlete_options]
    if new_athletes:
        new_rows = pd.DataFrame({
            "athlete_id": [athletes["athlete_id"].max() + i + 1 for i in range(len(new_athletes))],
            "first_name": [name.split()[0] for name in new_athletes],
            "last_name": [name.split()[-1] if len(name.split())>1 else "" for name in new_athletes],
            "athlete_name": new_athletes,
            "gender": "Other"
        })
        session_athletes = pd.concat([athletes[athletes["athlete_name"].isin(selected_athletes)], new_rows], ignore_index=True)
    else:
        session_athletes = athletes[athletes["athlete_name"].isin(selected_athletes)]

    # Build or rebuild session grid if metrics or athletes changed
    if (selected_metrics != st.session_state.selected_metrics
        or st.session_state.session_grid is None
        or len(session_athletes) != len(st.session_state.session_grid["athlete_id"].unique())
    ):
        st.session_state.selected_metrics = selected_metrics
        st.session_state.session_grid = build_session_grid(
            selected_metrics, attempts_per_athlete, session_athletes
        )

    # ---------------- AG Grid ----------------
    data = st.session_state.session_grid.copy()
    if not data.empty:
        gb = GridOptionsBuilder.from_dataframe(data)
        gb.configure_default_column(editable=False)
        gb.configure_column("input_value", editable=True)

        best_attempt_js = JsCode("""
        function(params) {
            if (params.data.is_best) return {'backgroundColor':'#2ca02c','color':'white','fontWeight':'bold'};
            if (params.data.input_value == null) return {'backgroundColor':'#f0ad4e','color':'black'};
            return {};
        }""")
        gb.configure_column("input_value", cellStyle=best_attempt_js)
        gb.configure_column("display_value", cellStyle=best_attempt_js)

        gender_color_js = JsCode("""
        function(params) {
            if (params.data.gender == 'M') return {'backgroundColor':'#add8e6'};
            if (params.data.gender == 'F') return {'backgroundColor':'#ffc0cb'};
            return {};
        }""")
        gb.configure_column("athlete_name", cellStyle=gender_color_js)

        priority_cols = ["athlete_name","metric_name","input_value","display_value","attempt_number"]
        for i, col in enumerate(priority_cols):
            gb.configure_column(col, pinned="left", width=150, order=i)

        hidden_cols = [
            "athlete_id","metric_id","metric_type","category",
            "input_unit","display_unit","conversion_formula",
            "is_best","gender","best_attempt","display_best"
        ]
        gb.configure_columns(hidden_cols, hide=True)

        grid_response = AgGrid(
            data,
            gridOptions=gb.build(),
            update_mode=GridUpdateMode.VALUE_CHANGED,
            allow_unsafe_jscode=True,
            height=500,
            fit_columns_on_grid_load=True,
            reload_data=False,
        )

        st.session_state.session_grid = recalc_results(pd.DataFrame(grid_response["data"]))

# ---------------- RIGHT: LEADERBOARD ----------------
with col2:
    st.header("Live Leaderboard")
    data = st.session_state.session_grid.copy()

    for metric_name in selected_metrics:
        st.subheader(f"{metric_name} Leaderboard")
        metric_rows = data[data["metric_name"] == metric_name].dropna(subset=["best_attempt"])

        if metric_rows.empty:
            st.info(f"No results yet for {metric_name}")
            continue

        metric_type = metric_rows.iloc[0]["metric_type"] if "metric_type" in metric_rows else "distance"
        render_leaderboard(
            metric_rows,
            metric_type,
            metric_rows.iloc[0]["display_unit"] if "display_unit" in metric_rows else "",
            metric_rows.iloc[0]["input_unit"] if "input_unit" in metric_rows else "",
        )
```
