---
topic:
  - "[[+Track and Field]]"
tags:
  - "#project"
  - track-and-field
related:
---
created: 2025-08-14 10:38
modified: 2025-08-14 10:38
___
# Key Objectives: 
- easy data-entry
- effective processing
- simple visualization
## [[Web-App Data Entry|Data Entry]]
- Each line of data will be keyed to an athlete. 
	- The order in which their data will be entered is different from day-to-day — need a **field to enter athlete-name early-on** as it's the **key identifier.** 
	- Co-ed team — also need a **field to identify gender.** 
- Each Data-Point will be tied to an individual metric. 
	- One of two types: **time**-based metrics, or **distance**-based metrics. 
	- Within those two types, categorized as **Speed** points, **X-Factor** points, or **Lactic** points. 
	- After they are typed and categorized — name metric
		- which should either be selected from a dropdown of common metrics, or entered manually for new metrics. 
- Each data-point should also be connected to its **respective date** for later processing. 
	- This should be stored both as a **calendar-date** for later storing, as well as a **relative** to when in the season the point is being collected *(e.g. Week 2, Day 3).* 
	- As all data-points will be entered in one session, this date/day-related information will be **applied to all points entered in an individual session.** 
## [[Web-App Data Processing|Data Processing]] 
### In-Session 
- After each line of data is entered, the list for that individual session should be sorted
	- in ascending order (for time-based metrics) or descending order (for distance-based metrics). 
	- *Reason this needs to re-sort after each step — athletes typically want feedback on where they stand within the session after each attempt (given that most days athletes will have 2-3 attempts at a given metric)*
### Post-Session 
After session is completed, all data-points should copy into a few different lists. 
#### Master list
for each category of Speed, X-Factor, and Lactic, grouped by each metric and sorted across all athletes for all dates. 
#### Phase-Constrained Lists
tied to each phase of our season (Preseason, Preparation, Competition, Championship, each matching up with certain date-ranges) to help assess athlete progression across the season.
#### Mens and Womens Lists
for each category 
#### Individual Athlete Lists
I need a way to look at all points connected to an individual athlete. 
## [[Web-App Data Visualization|Data Visualization]] 
### In-Session 
In-Session, I just need a way for athletes to see their relative ranking based on their data, as a "leaderboard" of sorts. 
- This should output as a ranked list (repopulating after each new line is entered in-session)
	- comparing the "best" data point of each athlete for the day (which will, again, differ if it's a time-based metric or a distance-based metric).
	- Need to see the data-point and the athlete name attached to it. 
- As we have both men and women's data, each data-point should be colored
	- to easily identify the difference (don't need a separate list, just a way to visually distinguish).
### Post-Session 
Post-Session, I want to create two visualizations, a leaderboard and a longitudinal graph. 
#### Leaderboard 
Extend the leaderboard format from in-session and apply it across the **week**, the **phase**, and the **season**. 
- Taking the best point of each athlete in a given metric → ranking them according to the metric type → displaying them as a list for each metric
	- Data-point, the athlete-name, and the date attached
#### Longitudinal Graph
Want to encourage competition with the leaderboard, but show progress across the season. 
- Graph for each metric that spans the season
	- charting the best data point from each session, for each athlete, across the season
	- dotted lines separating the graph into the four season-phases
# Roadmap
## **1. [[Web-App Data Model & Storage||Data Model & Storage]]**
Before touching UI or visualization, define _how_ data is structured.
### **Entities:**
- Athlete → {ID, Name, Gender}
- Metric → {Name, Type (time/distance), Category (Speed/X-Factor/Lactic)}
- DataPoint → {AthleteID, Metric, Value, Date, SeasonPhase, SessionID}
### **Storage Options:**
- Start with CSVs (simple, portable).
- Migrate later to SQLite or Google Sheets if multi-user entry is needed.
### **Deliverable:** 
A schema + a few sample files to test downstream logic.

---
## **2. [[Web-App Data Entry|Data Entry]]**
You’ll want to separate _how_ data is entered from _what happens_ afterward.
### **Requirements:**
- Identify athlete (dropdown/search).
- Record metric (dropdown of common + free-entry).
- Enter value (float/time).
- Date auto-applies across entries in a session, plus derived "Week X, Day Y".
- Gender auto-attached to athlete.
### **Approaches:**
- **Low-tech start:** Streamlit app or Google Forms that feeds to CSV.
- **Custom:** Python + Tkinter/Streamlit form with dropdowns & auto-fill.
**Deliverable:** 
A form that outputs a clean session CSV.

---
## **3. In-Session Processing**
This is the “live feedback” step.
### **Logic:**
- As each datapoint is entered, sort list by metric type (ascending if time, descending if distance).
- Rank athletes by their _best attempt of the day_.
- Update leaderboard visualization with gender-based colors.
### **Approach:**
- Python + Pandas (for sorting).
- Streamlit (for live refresh and simple visuals).
### **Edge Case Handling:**
- Multiple entries per athlete → only best attempt counts.
- Missing gender → default formatting.
### **Deliverable:** 
A dynamic leaderboard that refreshes with every entry.

---
## **4. [[Web-App Post-Session Processing|Post-Session Processing**]]
Now we start building the “historical record.”
### **Logic:**
- Append session data to:
	- Master lists (Speed/X-Factor/Lactic).
	- Phase lists (Preseason, Prep, etc.).
	- Gender splits.
	- Athlete profiles.
- Pre-calculate "best per athlete per session" to simplify later visualization.
### **Approach:**
- Python script that:
	- Reads in session CSV.
	- Updates master files (one per category/phase).
	- Stores derived stats (best-per-athlete, session summaries).
### **Deliverable:** 
A set of structured CSVs (or database tables) after each session.

---
## **5. [[Web-App Data Visualization|Post-Session Visualizations]]**
### **Leaderboards (aggregated)**
- Best attempt per athlete across week/phase/season.
- Ranked lists with value, athlete, date.
- Same gender-coloring scheme.
- Output: Interactive tables (Streamlit) or static exports (CSV/PDF).
### **Longitudinal Graphs**
- One line per athlete, plotting best attempts session-by-session.
- Vertical dotted lines for season phases.
- Interactivity (hover to see value/date).
- Tooling: Matplotlib or Plotly (for interactive).
### **Deliverable:** 
Visual dashboards + exportable graphs.

---
## **6. System Integration**
Once the above pieces exist, tie them together into a _workflow_.
### **Session Workflow:**
1. Start session → enter athletes & metrics.
2. In-session leaderboard auto-updates.
3. End session → run post-session script → update master files.
4. Refresh dashboards (leaderboards + graphs).
### **Long-term Storage:**
Everything compiles into season archive (one folder per season).
### **Deliverable:** 
A documented end-to-end workflow, usable by coaches without coding.

---
## **7. Stretch Goals**
### **Web App Deployment**: 
- Host via Streamlit/Flask → athletes can check live leaderboards on their phones.
### **Mobile-first Data Entry**: 
- Google Form → auto-pipe into processing scripts.
### **Automated Season Phasing**: 
- Automatically assign phase by date without manual tagging.
### **Export Options**: 
- Auto-generate PDF reports for each athlete.
# Impact
**Main Idea:** allows for more relatability of “what does that time *mean*?” 
	Might inform future pairings, how stratified our team is, etc
# Connected to