| field_name       | type                 | stored as             | values                                            | display_name           | example                   |
| ---------------- | -------------------- | --------------------- | ------------------------------------------------- | ---------------------- | ------------------------- |
| session_id       | string               | text                  |                                                   | Session Title          | "First-Day"               |
| session_date     | date                 | ISO date              | [03-09-26, 06-08-26]                              | Session Date           | 03-09-26                  |
| phase            | categorical          | text                  | Preseason, Preparation, Competition, Championship | Training Phase         | Preseason                 |
| phase_week       | integer              | number                | [1, 5]                                            | Week of Phase          | 1                         |
| day_categories   | categorical (multi)  | pipe-delimited string | Speed, X-Factor, Lactic                           | Today's Focus(es)      | Speed, X-Factor           |
| day_metrics      | list[str]            | pipe-delimited keys   |                                                   | Today's Metric(s)      | ["20m_Accel", "CMJ"]      |
| day_metric_count | integer              | number                |                                                   | (N/A, just derived)    | 2                         |
| day_splits       | dict[str, list[int]] | JSON string           |                                                   | Splits (Distance p/ea) | 5 \| 5 \| 10              |
| session_notes    | string               | text                  |                                                   | Session Notes          | "Standing Start off Clap" |