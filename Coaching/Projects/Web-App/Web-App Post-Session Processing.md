---
topic: 
tags: 
related:
---
created: 2025-09-03 10:41
modified: 2025-09-03 10:41
___
# **Historical Record / Post-Session Data Consolidation**
### **Workflow**
1. **Read the latest session CSV**:
```
import pandas as pd
session_data = pd.read_csv("SessionData.csv")
```
1. **Preprocess / calculate derived fields**:
- Ensure `display_value` is populated.
- Calculate **best attempt per athlete per metric per session**.
```
best_per_athlete = session_data.loc[
    session_data.groupby(['metric_name','athlete_id'])['input_value'].idxmin()  # or idxmax for distance
    if session_data['metric_type'].iloc[0] == 'time' else
    session_data.groupby(['metric_name','athlete_id'])['input_value'].idxmax()
]
```
3. **Append to master datasets**:
- **Category-based CSVs** (Speed, X-Factor, Lactic)
- **Phase-based CSVs** (Preseason, Preparation, Competition, Championship)
- **Gender splits** (Male, Female)
- **Athlete-specific histories**
```
categories = ['Speed','X-Factor','Lactic']
phases = {'Preseason': [1,2], 'Preparation':[3,5], 'Competition':[6,9], 'Championship':[10,13]}

# Example: append to master category
for category in categories:
    master_file = f"Master_{category}.csv"
    df_cat = session_data[session_data['category']==category]
    try:
        master = pd.read_csv(master_file)
        master = pd.concat([master, df_cat])
    except FileNotFoundError:
        master = df_cat
    master.to_csv(master_file, index=False)
```
- Similar logic for **phase-based** files (match `session_week` to phase range)
- Similar logic for **gender splits**
- **Athlete profile CSVs** can be one file per athlete, or one file with `athlete_id` column for all athletes
# **Post-Session Visualizations**
### **A. Leaderboards (aggregated)**
**Objective:** Show **best attempt per athlete** across week/phase/season, ranked.
```
# Example: best per athlete across season for a metric
metric = 'Fly-10'
df_metric = pd.read_csv("Master_Speed.csv")
if df_metric[df_metric['metric_name']==metric]['metric_type'].iloc[0]=='time':
    leaderboard = df_metric[df_metric['metric_name']==metric].groupby('athlete_name')['input_value'].min().reset_index()
    leaderboard = leaderboard.sort_values('input_value')
else:
    leaderboard = df_metric[df_metric['metric_name']==metric].groupby('athlete_name')['input_value'].max().reset_index()
    leaderboard = leaderboard.sort_values('input_value', ascending=False)

# Add gender for coloring
leaderboard = leaderboard.merge(df_metric[['athlete_name','gender']].drop_duplicates(), on='athlete_name')
```
- **Output options**:
    - Streamlit interactive table (`st.dataframe`) with color formatting
    - Static CSV or PDF export for reports

---
### **B. Longitudinal Graphs (Progression Across Season)**
- **Plot per metric**: x-axis = session date, y-axis = display_value or input_value
- **One line per athlete**, optionally color by gender
- **Dotted vertical lines** to indicate season phases

**Plotly Example:**
```
import plotly.express as px

metric_df = df_metric[df_metric['metric_name']==metric]
# Best attempt per athlete per session
best_per_session = metric_df.loc[metric_df.groupby(['athlete_name','session_date'])['input_value'].idxmin()]

fig = px.line(best_per_session, x='session_date', y='display_value', color='athlete_name',
              line_dash='gender', markers=True, title=f"{metric} Progression Across Season")
# Add phase vertical lines
phase_weeks = {'Preseason':[1,2], 'Preparation':[3,5], 'Competition':[6,9], 'Championship':[10,13]}
for phase_name, (start_week,end_week) in phase_weeks.items():
    fig.add_vline(x=start_week, line_dash="dot", annotation_text=phase_name)

fig.show()
```
- Optional: Hover shows `input_value`, `display_value`, and `session_date`.
- Can be embedded in **Streamlit dashboards** or exported as PNG/HTML for sharing.

---
### **Deliverables After Each Session**
1. **Updated structured CSVs**:
    - `Master_Speed.csv`, `Master_X-Factor.csv`, `Master_Lactic.csv`
    - `Phase_Preseason.csv`, etc.
    - `Gender_M.csv`, `Gender_F.csv`
    - `Athlete_<ID>.csv` or consolidated athlete history file
2. **Derived summaries**:
    - Best per athlete per session
    - Session-level summaries (average, best attempt, number of attempts)
3. **Visual dashboards**:
    - **Leaderboards**: ranked best attempts across week/phase/season
    - **Longitudinal graphs**: progress across sessions with phase boundaries
    - **Export options:** interactive (Plotly/Streamlit) or static (PNG/CSV/PDF)