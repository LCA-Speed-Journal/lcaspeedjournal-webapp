---
topic:
  - "[[Web-App for Time-Comparisons]]"
tags:
related:
---
created: 2025-09-03 08:27
modified: 2025-09-03 08:24
___
# **Data Model (Conceptual)**
### **Entities**
1. **Athlete**
    - `athlete_id` (primary key, unique identifier)
    - `first_name`
    - `last_name`
    - `gender` (M/F/Other)
2. **Metric**
    - `metric_id` (primary key)
    - `name` (e.g., “100m”, “300m Hurdles”, “Standing LJ”)
    - `type` (time or distance)
    - `category` (Speed, X-Factor, Lactic)
	- `input_unit` → the unit coaches enter at the session (almost always seconds or meters)
	- `display_unit` → the default way it should be shown to athletes (e.g. mph)
	- `conversion_formula` → (optional) how to convert from input → display. 
		- **Fly-10 (time → mph):** If an athlete runs 1.10s for 10m, the stored value is `1.10 (s)`, but for display would compute `22.3694 / 1.10 ≈ 20.3 mph`.
3. **Session**
    - `session_id` (primary key)
    - `date` (calendar date)
    - `season_week` (Week X, Day Y format)
    - `season_phase` (Preseason, Preparation, Competition, Championship)
4. **DataPoint**
    - `data_point_id` (primary key)
    - `session_id` (foreign key → Session)
    - `metric_id` (foreign key → Metric)
    - `athlete_id` (foreign key → Athlete)
    - `attempt_number` (1, 2, 3… within a session)
    - `input_value`  → the spot that data is entered in by coaches (e.g. a Fly-10 → 1.10)
	- `display_value` → the converted value for display to athletes (e.g. a 1.10s Fly-10 → 20.3)

---
# Normalized Schema (Multi-File)

Each file stores one concept, linked by IDs.
### **Athletes.csv**

| athlete_id | first_name | last_name | gender |
| ---------- | ---------- | --------- | ------ |
| A001       | Evan       | Berg      | M      |
| A002       | Levi       | Sutkowski | M      |
| A003       | Lily       | Dobrotka  | F      |

---
### **Metrics.csv**

|metric_id|name|type|category|input_unit|display_unit|conversion_formula|
|---|---|---|---|---|---|---|
|M001|Fly-10|time|Speed|s|mph|22.3694 / value|
|M002|Standing LJ|distance|X-Factor|m|ft|value * 3.28084|
|M003|300m Hurdles|time|Lactic|s|s|value|

---
### **Sessions.csv**

| session_id | week_id | date       | type     | notes          |
| ---------- | ------- | ---------- | -------- | -------------- |
| S001       | W001    | 2025-02-24 | Speed    | Fly-10s        |
| S002       | W001    | 2025-02-26 | X-Factor | Vertical Jumps |
| S003       | W002    | 2025-03-03 | Lactic   | 150m Reps      |

---
### **Phases.csv**

| phase_id | name         | start_week | end_week | notes                       |
| -------- | ------------ | ---------- | -------- | --------------------------- |
| P001     | Preseason    | 1          | 2        | Acclimation, fundamentals   |
| P002     | Preparation  | 3          | 6        | Volume, general development |
| P003     | Competition  | 7          | 10       | Event-specific sharpening   |
| P004     | Championship | 11         | 13       | Peak, taper, major meets    |

---
### **Weeks.csv**

| week_id | season_id | week_number | phase_id |
| ------- | --------- | ----------- | -------- |
| W001    | 2025      | 1           | P001     |
| W002    | 2025      | 2           | P001     |
| W003    | 2025      | 3           | P002     |
| W004    | 2025      | 4           | P002     |
| W005    | 2025      | 5           | P002     |
| W006    | 2025      | 6           | P002     |
| W007    | 2025      | 7           | P003     |

---
### **DataPoints.csv**

|data_point_id|session_id|athlete_id|metric_id|input_value|display_value|attempt_number|
|---|---|---|---|---|---|---|
|D001|S001|A001|M001|1.10|20.3|1|
|D002|S001|A002|M001|1.18|19.0|1|
|D003|S001|A003|M002|2.45|8.04|1|

---

# Denormalized Master Schema (All-In-One File)
### **MasterData_2026.csv (Denormalized)**

| data_point_id | session_id | session_date | week_number | phase_name   | athlete_id | athlete_name   | gender | metric_id | metric_name  | metric_type | category | input_value | input_unit | display_value | display_unit | attempt_number |
| ------------- | ---------- | ------------ | ----------- | ------------ | ---------- | -------------- | ------ | --------- | ------------ | ----------- | -------- | ----------- | ---------- | ------------- | ------------ | -------------- |
| D001          | S001       | 2026-03-11   | 1           | Preseason    | A001       | Evan Berg      | M      | M001      | Fly-10       | time        | Speed    | 1.12        | s          | 19.95         | mph          | 1              |
| D002          | S001       | 2026-03-11   | 1           | Preseason    | A002       | Levi Sutkowski | M      | M001      | Fly-10       | time        | Speed    | 1.15        | s          | 19.41         | mph          | 1              |
| D003          | S002       | 2026-03-14   | 1           | Preseason    | A001       | Evan Berg      | M      | M002      | Standing LJ  | distance    | X-Factor | 2.45        | m          | 8.04          | ft           | 1              |
| D004          | S003       | 2026-04-14   | 6           | Competition  | A003       | Lily Dobrotka  | F      | M002      | Standing LJ  | distance    | X-Factor | 2.75        | m          | 9.02          | ft           | 1              |
| D005          | S004       | 2026-05-12   | 10          | Championship | A003       | Lily Dobrotka  | F      | M003      | 300m Hurdles | time        | Lactic   | 42.15       | s          | 42.15         | s            | 1              |

---

### 🔹 Notes

---
