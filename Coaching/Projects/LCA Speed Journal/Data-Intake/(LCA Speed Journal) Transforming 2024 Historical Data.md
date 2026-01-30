# Transforming 2024 Historical Data

## Overview

Transform `2024-Data.csv` to `2024-Data-Transformed.csv` using the existing transformation framework from `scripts/transform_2025_data.py` and `src/lca_speed_journal/detailed_viz/historical_transformer.py`, with systematic validation checkpoints to ensure data integrity.

## Key Differences from 2025 Data

Based on initial analysis:

- **Metric IDs**: Many rows in 2024 have empty `metric_id` fields (vs. numeric IDs in 2025), requiring stronger reliance on `metric_name` pattern matching
- **Athletes**: Different athlete roster (some overlap with 2025)
- **Metrics**: May have different metric naming conventions or additional metrics
- **Date range**: 2024 season (March-November 2024)
- **Graduating classes**: Need to calculate for 2024 season year (2024 + (12 - grade))

## Implementation Steps

### Phase 1: Data Analysis and Comparison ✅ COMPLETE

1. **Create analysis script** `scripts/analyze_2024_data.py`: ✅
   - Compare 2024 vs 2025 data structures
   - Identify unique metrics in 2024
   - Identify unique athletes in 2024
   - Check for missing metric_ids
   - Analyze conversion formulas
   - Generate comparison report

2. **Checkpoint 1**: Review analysis report to identify: ✅
   - Metrics not present in 2025
   - Athletes not in athletes.json
   - Conversion formulas that may need special handling
   - Any structural differences

#### Phase 1 Key Findings:
- **Row count**: 2024 has 1,342 rows vs 820 in 2025
- **Missing metric_ids**: 1,220 rows (90.9%) - requires pattern matching (transformer already handles this)
- **Unique metrics in 2024** (5 not in 2025):
  - `10-20m Sled` (Resisted-Sprint, 15 rows)
  - `10-5_CT` (Ground-Contact, 11 rows)
  - `10-5_RSI` (RSI, 11 rows)
  - `30-45m Split` (MaxV, 31 rows)
  - `45-55m Split` (MaxV, 29 rows)
- **Unique athletes in 2024** (6 not in 2025): Anna-J, Izzy-K, Jomi, Liam-S, Lily-L, Matthew-B
- **Unmatched athletes** (10 not in athletes.json): Adam P, Anna J, Daniel S, Izzy K, Jomi, Liam S, Lily L, Matthew B, Peter K, Ross P
- **Conversion formulas only in 2024** (4): `(1.5 * 22.37) / value`, `(2 * 22.37) / value`, `(3 * 22.37) / value`, `12 * value`
- **Column structure**: Matches between 2024 and 2025 (18 columns)

### Phase 2: Transformation Script

3. **Create transformation script** `scripts/transform_2024_data.py`:
   - Based on `transform_2025_data.py` but adapted for 2024
   - Use `transform_historical_dataframe()` with `year=2024`
   - Add year-specific validation

4. **Checkpoint 2**: Run transformation and verify:
   - Row count preservation
   - All required columns present
   - No null session_ids
   - No null session_dates

### Phase 3: Validation and Diagnostics

5. **Create validation script** `scripts/validate_2024_transformation.py`:
   - Based on `validate_transformation.py` but for 2024
   - Compare original vs transformed:
     - Row counts
     - Athlete name normalization
     - Phase preservation
     - Conversion type mapping
     - Interval extraction
     - Metric key mapping
     - Graduating class calculation
   - Generate detailed validation report

6. **Checkpoint 3**: Review validation report:
   - Identify any failed validations
   - Check for unmapped metrics
   - Verify athlete name mappings
   - Verify graduating class calculations

### Phase 4: Edge Case Handling

7. **Handle edge cases**:
   - **Missing metric_ids**: Ensure `map_metric_to_2026_schema()` handles empty metric_id gracefully (already does via pattern matching)
   - **Unmapped metrics**: Document any metrics that don't match patterns
   - **Athlete name mismatches**: Identify athletes not in athletes.json and document
   - **Conversion formulas**: Verify all formulas are mapped correctly

8. **Checkpoint 4**: Manual review of edge cases:
   - Sample rows for each unmapped metric
   - Sample rows for unmapped athletes
   - Verify conversion formulas are correct

### Phase 5: Final Validation and Documentation

9. **Create transformation report** `docs/historical_data_transformation_report_2024.md`:
   - Document transformation process
   - List all mappings applied
   - Document edge cases and resolutions
   - Include statistics (row counts, unique metrics, athletes, etc.)
   - Compare to 2025 transformation for consistency

10. **Checkpoint 5**: Final validation:
    - Compare transformed 2024 data structure to transformed 2025 data
    - Verify schema compliance
    - Spot-check sample rows
    - Verify data integrity (no data loss)

## Files to Create/Modify

### New Files
- `scripts/analyze_2024_data.py` - Data analysis and comparison
- `scripts/transform_2024_data.py` - Main transformation script
- `scripts/validate_2024_transformation.py` - Validation script
- `docs/historical_data_transformation_report_2024.md` - Transformation documentation
- `data/historical/2024-Data-Transformed.csv` - Output file

### Existing Files (Reference Only)
- `scripts/transform_2025_data.py` - Template for 2024 script
- `scripts/validate_transformation.py` - Template for validation
- `src/lca_speed_journal/detailed_viz/historical_transformer.py` - Core transformation logic (reusable)
- `docs/historical_data_transformation_report.md` - Template for documentation

## Validation Checkpoints Summary

1. **Pre-transformation**: Data analysis reveals structure differences
2. **Post-transformation**: Basic integrity checks (row count, columns)
3. **Post-validation**: Detailed validation report review
4. **Edge case review**: Manual verification of unmapped items
5. **Final validation**: Schema compliance and data integrity

## Success Criteria

- ✅ All rows from 2024-Data.csv transformed (no data loss)
- ✅ All 26 required columns present in output
- ✅ All session_ids generated correctly
- ✅ All metric_keys mapped (or documented if unmapped)
- ✅ All athlete names normalized/mapped
- ✅ All graduating classes calculated correctly
- ✅ Validation report shows no critical failures
- ✅ Transformation report documents all mappings and edge cases

## Task List

- [x] Create `scripts/analyze_2024_data.py` to compare 2024 vs 2025 data structures, identify unique metrics/athletes, and check for missing metric_ids
- [x] Review analysis report to identify metrics, athletes, and formulas that need special handling
- [ ] Create `scripts/transform_2024_data.py` based on transform_2025_data.py, using year=2024
- [ ] Run transformation and verify row count preservation, column presence, and no null session_ids/dates
- [ ] Create `scripts/validate_2024_transformation.py` to compare original vs transformed data with detailed checks
- [ ] Review validation report for failed validations, unmapped metrics, athlete name issues, and graduating class calculations
- [ ] Document and handle edge cases: missing metric_ids, unmapped metrics, athlete name mismatches, and conversion formulas
- [ ] Manually review edge cases: sample rows for unmapped metrics/athletes, verify conversion formulas
- [ ] Create `docs/historical_data_transformation_report_2024.md` documenting the transformation process, mappings, edge cases, and statistics
- [ ] Final validation: compare to 2025 transformed data structure, verify schema compliance, spot-check sample rows, verify data integrity

