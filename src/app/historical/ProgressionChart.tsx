"use client";

import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Legend,
} from "recharts";
import type { ProgressionPoint } from "@/types";

const ATHLETE_COLORS = [
  "var(--accent)",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
];
const MALE_AVG_COLOR = "var(--accent)";
const FEMALE_AVG_COLOR = "#22d3ee";

type SeriesItem = {
  athlete_id: string;
  first_name?: string;
  last_name?: string;
  points: ProgressionPoint[];
};

type Props = {
  series?: SeriesItem[];
  points?: ProgressionPoint[];
  metricDisplayName: string;
  units: string;
  teamAvgMalePoints?: ProgressionPoint[];
  teamAvgFemalePoints?: ProgressionPoint[];
};

function athleteLabel(s: SeriesItem): string {
  const first = (s.first_name ?? "").trim();
  const last = (s.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || s.athlete_id.slice(0, 8);
}

/** Y-axis domain: ±10% padding from min/max values in data */
function yDomainFromData(data: Record<string, unknown>[]): [number, number] {
  const values: number[] = [];
  for (const row of data) {
    for (const key of Object.keys(row)) {
      if (key === "session_date" || key === "date") continue;
      const v = Number((row as Record<string, unknown>)[key]);
      if (!Number.isNaN(v)) values.push(v);
    }
  }
  if (values.length === 0) return [0, 10];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const range = dataMax - dataMin;
  const padding =
    range > 0 ? range * 0.1 : Math.max(Math.abs(dataMin) * 0.1, Math.abs(dataMax) * 0.1, 1);
  return [dataMin - padding, dataMax + padding];
}

/** Y-axis tick label: round to one decimal place */
function formatYAxisTick(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

export default function ProgressionChart({
  series: seriesProp,
  points,
  metricDisplayName,
  units,
  teamAvgMalePoints = [],
  teamAvgFemalePoints = [],
}: Props) {
  const series: SeriesItem[] =
    seriesProp && seriesProp.length > 0
      ? seriesProp
      : points && points.length >= 0
        ? [{ athlete_id: "single", first_name: "", last_name: "", points: points ?? [] }]
        : [];

  const allDates = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => allDates.add(p.session_date)));
  teamAvgMalePoints.forEach((p) => allDates.add(p.session_date));
  teamAvgFemalePoints.forEach((p) => allDates.add(p.session_date));
  const sortedDates = Array.from(allDates).sort();

  const valueByKey = (
    pointsList: ProgressionPoint[],
    date: string
  ): number | undefined => {
    const p = pointsList.find((x) => x.session_date === date);
    return p != null ? Number(p.display_value) : undefined;
  };

  const data = sortedDates.map((session_date) => {
    const row: Record<string, string | number | undefined> = {
      session_date,
      date: session_date,
    };
    series.forEach((s, i) => {
      row[`val_${i}`] = valueByKey(s.points, session_date);
    });
    row.men_avg = valueByKey(teamAvgMalePoints, session_date);
    row.women_avg = valueByKey(teamAvgFemalePoints, session_date);
    return row;
  });

  const hasAnyPoints =
    series.some((s) => s.points.length > 0) ||
    teamAvgMalePoints.length > 0 ||
    teamAvgFemalePoints.length > 0;

  if (!hasAnyPoints) {
    return (
      <p className="text-sm text-foreground-muted">
        No data points for this selection in the selected range.
      </p>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
            tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 10) : String(v))}
          />
          <YAxis
            domain={yDomainFromData(data)}
            tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
            tickFormatter={formatYAxisTick}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--foreground-muted)",
              borderRadius: 8,
            }}
            labelStyle={{ color: "var(--foreground)" }}
            labelFormatter={(label) => (typeof label === "string" ? label.slice(0, 10) : String(label))}
            formatter={(value: unknown, name: string) => {
              const v = Number(value);
              if (value == null || Number.isNaN(v)) return [null, name];
              const str = v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
              return [`${str} ${units}`, name];
            }}
          />
          <Legend />
          {series.map((s, i) => (
            <Line
              key={s.athlete_id}
              type="monotone"
              dataKey={`val_${i}`}
              name={athleteLabel(s)}
              stroke={ATHLETE_COLORS[i % ATHLETE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
          {teamAvgMalePoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="men_avg"
              name="Men's Average"
              stroke={MALE_AVG_COLOR}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
            />
          )}
          {teamAvgFemalePoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="women_avg"
              name="Women's Average"
              stroke={FEMALE_AVG_COLOR}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
