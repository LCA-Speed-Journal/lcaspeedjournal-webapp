"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; value: number; n?: number };

export function TeamProgressLineChart({
  points,
  label,
  units,
  valueKey = "value",
}: {
  points: Point[];
  label: string;
  units?: string;
  valueKey?: string;
}) {
  const data = points.map((p) => ({
    date: p.date,
    [valueKey]: p.value,
    n: p.n,
  }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">No data for {label}.</p>
    );
  }

  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
            tickFormatter={(d: string) => d.slice(5)}
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
            formatter={(value) => [
              `${Number(value).toFixed(2)}${units ? ` ${units}` : ""}`,
              label,
            ]}
            labelFormatter={(d) => String(d)}
          />
          <Line
            type="monotone"
            dataKey={valueKey}
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
