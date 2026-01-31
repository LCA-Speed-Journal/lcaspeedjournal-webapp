# Historical seed data (2024 & 2025)

Place the transformed CSVs here so `npm run seed` can load them:

- **2024-Data-Transformed.csv**
- **2025-Data-Transformed.csv**

Source: `LCA-Speed-Journal/data/historical/` (from the Python Scripts project).

Alternatively, set `SEED_DATA_DIR` to the full path of that folder and run the seed from the project root:

```bash
SEED_DATA_DIR="C:\Users\...\Python Scripts\2026 Coding\LCA-Speed-Journal\data\historical" npx tsx scripts/seed-historical.ts
```

These files use the app schema: `metric_key` (e.g. `10-20m_Split`, `20m_Accel`), `session_date`, `phase`, `phase_week`, `athlete_name`, `athlete_graduating_class`, `input_value`, `display_value`, `input_units`.
