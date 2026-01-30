# How to Load Activity Data into Resource Curve Template

Loading activity data into the Resource Curve Template involves exporting labor hours from Accubid, organizing them by activity, and calculating indirect hours to create an accurate resource curve for project planning.

## Enter Basic Activity Information

1. Enter activity names into the Resource Curve Template
2. Enter hours per week to be worked (standard or project-specific)

## Export Labor Hours from Accubid

1. Export the Extension screen from Accubid to Excel
2. Group line items to align with the activities defined in the template
3. Add a column for activity names if needed to match line items to activities
4. Verify all line items are properly categorized by activity

## Create Pivot Table to Summarize Hours

1. Use a Pivot Table in Excel to summarize hours by activity
2. Set up the Pivot Table with activities as rows and labor hours as values
3. Verify the Pivot Table correctly groups and sums hours for each activity
4. Review the summary to ensure all activities are represented and hours are properly allocated

## Add Indirect Hours

1. Calculate indirect hours using multipliers for: supervision, cleanup, orientation, and labor factors
2. Apply the appropriate multipliers to direct labor hours for each activity
3. Add indirect hours consistently across all activities
4. Document the multipliers used for future reference

## Separate Hours by Trade (If Necessary)

1. Determine if it's important to graph resources for each trade separately
2. If needed, separate hours for each trade (electrical, technology, civil, and other ArchKey internal trades) before aggregating
3. Create separate resource curves for each trade, then aggregate together for an overall resource curve
4. This approach helps identify trade-specific resource peaks and valleys

## Validate Total Hours

1. Verify that total hours in the template match the estimate total before proceeding
2. Compare the sum of all activity hours (direct + indirect) to the Accubid estimate total
3. Investigate and resolve any discrepancies between the template totals and the estimate
4. Verify that all ArchKey internal subs (technology, civil, and other internal trades) are included if they are part of the resource curve
