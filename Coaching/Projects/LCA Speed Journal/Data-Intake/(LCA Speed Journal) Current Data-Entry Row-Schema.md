| Column Name         | Category          | Type     | Example                     |
| ------------------- | ----------------- | -------- | --------------------------- |
| session_id          | session_context   | text     | 20260309-Preseason-W1       |
| session_date        | session_context   | date     | 2026-03-09                  |
| phase               | session_context   | text     | Preseason                   |
| phase_week          | session_context   | number   | 1                           |
| day_categories      | session_context   | text     | Speed \| X-Factor           |
| session_notes       | session_context   | text     | Standing Start using a Clap |
| metric_category     | metric_metadata   | text     | Speed                       |
| metric_subcategory  | metric_metadata   | text     | Acceleration                |
| metric_key          | metric_metadata   | text     | 30m_Accel                   |
| metric_structure    | metric_metadata   | text     | cumulative                  |
| interval_start_m    | interval_metadata | number   | 10                          |
| interval_end_m      | interval_metadata | number   | 30                          |
| interval_label      | interval_metadata | text     | 10-30m                      |
| interval_distance_m | interval_metadata | number   | 20                          |
| input_units         | units_conversions | text     | s                           |
| display_units       | units_conversions | text     | mph                         |
| conversion_type     | units_conversions | text     | velocity_mph                |
| athlete_name        | athlete_metadata  | text     | Colin A                     |
| athlete_gender      | athlete_metadata  | text     | M                           |
| athlete_grade       | athlete_metadata  | text     | 12                          |
| input_value         | values            | number   | 1.05                        |
| display_value       | values            | number   | 21.3                        |
| entry_timestamp     | entry_context     | datetime | 2026-03-09 15:42:10         |
| entered_by          | entry_context     | text     | Coach_Ross                  |
