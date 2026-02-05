"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import type { LeaderboardRow } from "@/types";

const MALE_COLOR = "var(--accent)";
const FEMALE_COLOR = "#22d3ee";

type Props = {
  rows: LeaderboardRow[];
  male?: LeaderboardRow[];
  female?: LeaderboardRow[];
  units: string;
  groupByGender: boolean;
  metricDisplayName: string;
  showTeamAvg?: boolean;
  maleAvg?: number | null;
  femaleAvg?: number | null;
};

function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function shortLabel(row: LeaderboardRow): string {
  const name = `${row.first_name} ${row.last_name}`.trim();
  return name.length > 12 ? `${name.slice(0, 10)}…` : name;
}

/** Y-axis tick label: round to one decimal place */
function formatYAxisTick(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

/** Y-axis domain: ±10% padding from min/max values in data; include optional reference values */
function yDomainFromData(
  data: { value: number }[],
  extraValues?: (number | null | undefined)[]
): [number, number] {
  const values = [...data.map((d) => d.value)];
  const extra = (extraValues ?? []).filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  const all = values.length > 0 ? [...values, ...extra] : extra.length > 0 ? extra : [0, 10];
  if (all.length === 0) return [0, 10];
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  const range = dataMax - dataMin;
  const padding =
    range > 0 ? range * 0.1 : Math.max(Math.abs(dataMin) * 0.1, Math.abs(dataMax) * 0.1, 1);
  return [dataMin - padding, dataMax + padding];
}

export default function HistoricalLeaderboardBar({
  rows,
  male = [],
  female = [],
  units,
  groupByGender,
  metricDisplayName,
  showTeamAvg = false,
  maleAvg = null,
  femaleAvg = null,
}: Props) {
  if (groupByGender && (male.length > 0 || female.length > 0)) {
    const boysData = male.map((r) => ({
      name: shortLabel(r),
      fullName: `${r.first_name} ${r.last_name}`,
      value: Number(r.display_value),
      rank: r.rank,
      source_metric_key: r.source_metric_key,
      gender: "M",
    }));
    const girlsData = female.map((r) => ({
      name: shortLabel(r),
      fullName: `${r.first_name} ${r.last_name}`,
      value: Number(r.display_value),
      rank: r.rank,
      source_metric_key: r.source_metric_key,
      gender: "F",
    }));

    return (
      <div className="space-y-6">
        {boysData.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-muted">Boys</p>
            <div className="h-80 w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={boysData} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
                    interval={0}
                  />
                  <YAxis
                    domain={yDomainFromData(
                      boysData,
                      showTeamAvg && maleAvg != null ? [maleAvg] : []
                    )}
                    tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
                    tickFormatter={formatYAxisTick}
                  />
                  {showTeamAvg && maleAvg != null && (
                    <ReferenceLine
                      y={maleAvg}
                      stroke={MALE_COLOR}
                      strokeDasharray="5 5"
                      label={{ value: "Men's Average", position: "right", fill: "var(--foreground-muted)" }}
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--foreground-muted)",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(value: number, _name: string, props: { payload?: { fullName: string; rank: number; source_metric_key?: string } }) => {
                      const p = props.payload;
                      const from = p?.source_metric_key ? ` (from ${p.source_metric_key})` : "";
                      return [`${formatValue(value)} ${units}${from}`, metricDisplayName];
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.fullName} — #${p.rank}` : "";
                    }}
                  />
                  <Bar dataKey="value" name={metricDisplayName} fill={MALE_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {girlsData.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-muted">Girls</p>
            <div className="h-80 w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={girlsData} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
                    interval={0}
                  />
                  <YAxis
                    domain={yDomainFromData(
                      girlsData,
                      showTeamAvg && femaleAvg != null ? [femaleAvg] : []
                    )}
                    tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
                    tickFormatter={formatYAxisTick}
                  />
                  {showTeamAvg && femaleAvg != null && (
                    <ReferenceLine
                      y={femaleAvg}
                      stroke={FEMALE_COLOR}
                      strokeDasharray="5 5"
                      label={{ value: "Women's Average", position: "right", fill: "var(--foreground-muted)" }}
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--foreground-muted)",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(value: number, _name: string, props: { payload?: { fullName: string; rank: number; source_metric_key?: string } }) => {
                      const p = props.payload;
                      const from = p?.source_metric_key ? ` (from ${p.source_metric_key})` : "";
                      return [`${formatValue(value)} ${units}${from}`, metricDisplayName];
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.fullName} — #${p.rank}` : "";
                    }}
                  />
                  <Bar dataKey="value" name={metricDisplayName} fill={FEMALE_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    );
  }

  const data = rows.map((r) => ({
    name: shortLabel(r),
    fullName: `${r.first_name} ${r.last_name}`,
    value: Number(r.display_value),
    rank: r.rank,
    source_metric_key: r.source_metric_key,
    gender: (r.gender ?? "").toLowerCase().startsWith("m") ? "M" : "F",
  }));

  const refValues: (number | null | undefined)[] = [];
  if (showTeamAvg && maleAvg != null) refValues.push(maleAvg);
  if (showTeamAvg && femaleAvg != null) refValues.push(femaleAvg);

  return (
    <div className="h-80 w-full min-h-[200px]" style={{ maxHeight: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--foreground-muted)" }}
            interval={0}
          />
          <YAxis
            domain={yDomainFromData(data, refValues)}
            tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
            tickFormatter={formatYAxisTick}
          />
          {showTeamAvg && maleAvg != null && (
            <ReferenceLine
              y={maleAvg}
              stroke={MALE_COLOR}
              strokeDasharray="5 5"
              label={{ value: "Men's Average", position: "right", fill: "var(--foreground-muted)" }}
            />
          )}
          {showTeamAvg && femaleAvg != null && (
            <ReferenceLine
              y={femaleAvg}
              stroke={FEMALE_COLOR}
              strokeDasharray="5 5"
              label={{ value: "Women's Average", position: "right", fill: "var(--foreground-muted)" }}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--foreground-muted)",
              borderRadius: 8,
            }}
            labelStyle={{ color: "var(--foreground)" }}
            formatter={(value: number, _name: string, props: { payload?: { fullName: string; rank: number; source_metric_key?: string } }) => {
              const p = props.payload;
              const from = p?.source_metric_key ? ` (from ${p.source_metric_key})` : "";
              return [`${formatValue(value)} ${units}${from}`, metricDisplayName];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload;
              return p ? `${p.fullName} — #${p.rank}` : "";
            }}
          />
          <Legend />
          <Bar dataKey="value" name={metricDisplayName} radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.gender === "M" ? MALE_COLOR : FEMALE_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
