export type DropoffEntry = {
  id: string;
  athlete_id: string;
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  display_value: number | string;
  units: string;
  created_at: string;
};

export function overallAttemptsFor(
  entries: DropoffEntry[],
  athleteId: string,
  metricKey: string
): { units: string; values: number[] } | null {
  const rows = entries
    .filter(
      (entry) =>
        entry.athlete_id === athleteId &&
        entry.metric_key === metricKey &&
        entry.interval_index == null &&
        (entry.component == null || entry.component === "")
    )
    .slice()
    .sort((a, b) => {
      const byTime = a.created_at.localeCompare(b.created_at);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  if (rows.length === 0) return null;
  return {
    units: rows[0].units,
    values: rows.map((row) => Number(row.display_value)),
  };
}
