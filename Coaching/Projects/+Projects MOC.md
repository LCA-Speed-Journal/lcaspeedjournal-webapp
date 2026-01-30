---
topic:
tags:
  - MOC
related:
---
created: 2025-01-27
modified: 2025-01-27
___

## Combined [[+LCA Speed Journal]] Project
- [[(LCA Speed Journal) Outlining]]
- [[(LCA Speed Journal) Functionality]]
- [[(LCA Speed Journal) Data-Intake]]
- [[(LCA Speed Journal) Leaderboards]]
- [[(LCA Speed Journal) Detailed Visualization]]
- [[(LCA Speed Journal) Athlete Reporting and Dashboards]]
- [[(LCA Speed Journal) Integrating Scripts Together]]
## Beta-Test Application

Web application development for track and field data entry, processing, and visualization

- [[Data Entry Streamlit Code-Fragment_Working]]: Working Streamlit code fragments for data entry using AgGrid with editable input values, automatic display value calculations, best attempt tracking, and live leaderboard updates with gender-based color coding.
- [[Web-App Data Model & Storage]]: Defines the data model for the web app including entities (Athlete, Metric, Session, DataPoint), normalized CSV schema, and denormalized master schema with conversion formulas for unit transformations (e.g., Fly-10 time to mph).
- [[Web-App Data Entry]]: Specifications for high-throughput, in-session data entry focusing on minimizing clicks/keystrokes, using tabular input grids, pre-loading athlete-metric combinations, and real-time sorting for live leaderboards.
- [[Web-App Data Processing]]: Roadmap and requirements for in-session processing (live feedback, sorting, ranking) and post-session processing (master lists, phase-constrained lists, gender splits, individual athlete lists) with detailed workflow documentation.
- [[Web-App Data Visualization]]: Code examples and specifications for card-based leaderboards, dynamic split-entry, dual leaderboards, longitudinal progression graphs, and export options using Streamlit, Plotly, and Altair.
- [[Web-App for Time-Comparisons]]: Focuses on making time-based metrics more relatable and informative, helping coaches understand performance context and inform team pairings and stratification analysis.
- [[Web-App Post-Session Processing]]: Technical workflow for historical record consolidation, including preprocessing session data, calculating best attempts per athlete, appending to master datasets (category-based, phase-based, gender splits), and generating post-session visualizations.

