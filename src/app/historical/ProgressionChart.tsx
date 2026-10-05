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

/** Y-axis domain padded from the athlete's actual marks so no point is clipped. */
export function yDomainFromValues(values: number[]): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return [0, 10];
  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  const range = dataMax - dataMin;
  const padding =
    range > 0
      ? Math.max(range * 0.15, range < 1 ? 0.05 : 0)
      : Math.max(Math.abs(dataMin) * 0.08, 0.5);
  return [dataMin - padding, dataMax + padding];
}

function formatYAxisTick(value: number, span: number): string {
  const decimals = span < 1 ? 2 : span < 20 ? 1 : 0;
  const rounded =
    decimals === 0
      ? Math.round(value)
      : Number(value.toFixed(decimals));
  if (decimals === 0) return String(rounded);
  return rounded.toFixed(decimals);
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

  const seriesValues: number[] = [];
  for (const s of series) {
    for (const p of s.points) {
      const n = Number(p.display_value);
      if (Number.isFinite(n)) seriesValues.push(n);
    }
  }
  for (const p of [...teamAvgMalePoints, ...teamAvgFemalePoints]) {
    const n = Number(p.display_value);
    if (Number.isFinite(n)) seriesValues.push(n);
  }
  const yDomain = yDomainFromValues(seriesValues);
  const ySpan = yDomain[1] - yDomain[0];
  const showLegend =
    series.length > 1 ||
    teamAvgMalePoints.length > 0 ||
    teamAvgFemalePoints.length > 0 ||
    series.some((s) => s.athlete_id !== "single");

  if (!hasAnyPoints) {
    return (
      <p className="text-sm text-foreground-muted">
        No data points for this selection in the selected range.
      </p>
    );
  }

  return (
    <div className="h-full min-h-[10rem] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
            tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 10) : String(v))}
          />
          <YAxis
            domain={yDomain}
            allowDataOverflow={false}
            tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
            tickFormatter={(v: number) => formatYAxisTick(v, ySpan)}
            width={44}
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
          {showLegend ? <Legend /> : null}
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
