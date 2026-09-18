"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatSeasonWeekDay } from "@/lib/team-progress/stats";

type Point = { date: string; value: number; n?: number };

function normalizeDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function buildChartRows(
  primary: Point[],
  secondary: Point[] | undefined,
  valueKey: string,
  secondaryKey: string,
  timelineDates: readonly string[] | undefined
): Array<Record<string, string | number | undefined>> {
  const byDate = new Map<string, Record<string, string | number | undefined>>();

  const ensure = (date: string) => {
    let row = byDate.get(date);
    if (!row) {
      row = { date };
      byDate.set(date, row);
    }
    return row;
  };

  for (const d of timelineDates ?? []) {
    const date = normalizeDate(d);
    if (date) ensure(date);
  }
  for (const p of primary) {
    const date = normalizeDate(p.date);
    if (!date) continue;
    const row = ensure(date);
    row[valueKey] = p.value;
    row.n = p.n;
  }
  if (secondary) {
    for (const p of secondary) {
      const date = normalizeDate(p.date);
      if (!date) continue;
      const row = ensure(date);
      row[secondaryKey] = p.value;
      row.n2 = p.n;
    }
  }

  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

export function TeamProgressLineChart({
  points,
  label,
  units,
  valueKey = "value",
  secondaryPoints,
  secondaryLabel = "Logged",
  secondaryKey = "actual",
  timelineAnchor,
  timelineDates,
}: {
  points: Point[];
  label: string;
  units?: string;
  valueKey?: string;
  secondaryPoints?: Point[];
  secondaryLabel?: string;
  secondaryKey?: string;
  /** First logged session (W1D1). */
  timelineAnchor?: string | null;
  timelineDates?: readonly string[];
}) {
  const data = buildChartRows(
    points,
    secondaryPoints,
    valueKey,
    secondaryKey,
    timelineDates
  );
  const hasSecondary = Boolean(secondaryPoints && secondaryPoints.length > 0);
  const dates = timelineDates ?? [];
  const hasValues = data.some(
    (row) => row[valueKey] != null || (hasSecondary && row[secondaryKey] != null)
  );

  if (!hasValues) {
    return (
      <p className="text-sm text-foreground-muted">No data for {label}.</p>
    );
  }

  const tickDates = data.map((row) => String(row.date));

  return (
    <div className="w-full min-w-0">
      <div className="h-48 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <XAxis
              type="category"
              dataKey="date"
              ticks={tickDates}
              padding={{ left: 16, right: 16 }}
              tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
              tickFormatter={(d: unknown) => {
                const s = normalizeDate(d);
                return s ? s.slice(5) : "";
              }}
              allowDuplicatedCategory={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
              width={40}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${Number(value).toFixed(2)}${units ? ` ${units}` : ""}`,
                name === secondaryKey ? secondaryLabel : label,
              ]}
              labelFormatter={(d) => {
                const date = normalizeDate(d) ?? String(d);
                const wd = formatSeasonWeekDay(date, timelineAnchor, dates);
                return wd ? `${date} · ${wd}` : date;
              }}
            />
            <Line
              type="monotone"
              dataKey={valueKey}
              name={label}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
            {hasSecondary ? (
              <Line
                type="monotone"
                dataKey={secondaryKey}
                name={secondaryLabel}
                stroke="var(--foreground-muted)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 truncate text-[10px] tabular-nums text-foreground-muted">
        {data
          .filter((row) => row[valueKey] != null || row[secondaryKey] != null)
          .map((row) => {
            const date = String(row.date).slice(5);
            const parts: string[] = [];
            if (row[valueKey] != null) {
              parts.push(String(row[valueKey]));
            }
            if (hasSecondary && row[secondaryKey] != null) {
              parts.push(`L${row[secondaryKey]}`);
            }
            return `${date} ${parts.join("/")}`;
          })
          .join(" · ")}
      </p>
    </div>
  );
}
