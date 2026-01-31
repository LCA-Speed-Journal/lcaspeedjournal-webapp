"use client";

import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import type { ProgressionPoint } from "@/types";

type Props = {
  points: ProgressionPoint[];
  metricDisplayName: string;
  units: string;
};

export default function ProgressionChart({
  points,
  metricDisplayName,
  units,
}: Props) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No data points for this athlete and metric in the selected range.
      </p>
    );
  }

  const data = points.map((p) => ({
    date: p.session_date,
    value: Number(p.display_value),
    fullLabel: `${p.session_date} — ${p.display_value} ${units}`,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 10) : String(v))}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => String(v)} />
          <Tooltip
            formatter={(value: number) => [value, units]}
            labelFormatter={(label) => (typeof label === "string" ? label : String(label))}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={metricDisplayName}
            stroke="var(--color-neon, #22d3ee)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
