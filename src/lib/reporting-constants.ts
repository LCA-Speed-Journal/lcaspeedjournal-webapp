/** Max calendar span (from → to) for reporting APIs; wider ranges return 400. */
export const MAX_REPORTING_RANGE_MONTHS = 24;

/** Export refuses to build CSV when row count exceeds this (after COUNT query). */
export const MAX_EXPORT_ROWS = 200_000;
