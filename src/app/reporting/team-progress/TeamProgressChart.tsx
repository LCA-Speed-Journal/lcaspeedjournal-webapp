"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatSeasonWeekDay, type StatBox } from "@/lib/team-progress/stats";

type Point = {
  date: string;
  value: number;
  n?: number;
  output?: StatBox;
  change?: StatBox;
};

type ChartRow = {
  date: string;
  n?: number;
  n2?: number;
  output?: StatBox;
  change?: StatBox;
  [key: string]: string | number | StatBox | undefined;
};

function normalizeDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function fmtStat(n: number): string {
  return n.toFixed(2);
}

function formatStatBox(box: StatBox): string {
  return `${fmtStat(box.min)} / ${fmtStat(box.mean)} / ${fmtStat(box.median)} / ${fmtStat(box.max)}`;
}

function buildChartRows(
  primary: Point[],
  secondary: Point[] | undefined,
  valueKey: string,
  secondaryKey: string,
  timelineDates: readonly string[] | undefined
): ChartRow[] {
  const byDate = new Map<string, ChartRow>();

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
    if (p.output) row.output = p.output;
    if (p.change) row.change = p.change;
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

function StatsTooltip({
  active,
  payload,
  label,
  units,
  valueKey,
  secondaryKey,
  secondaryLabel,
  primaryLabel,
  timelineAnchor,
  timelineDates,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: unknown; payload?: ChartRow }>;
  label?: unknown;
  units?: string;
  valueKey: string;
  secondaryKey: string;
  secondaryLabel: string;
  primaryLabel: string;
  timelineAnchor?: string | null;
  timelineDates: readonly string[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const date = normalizeDate(label) ?? String(label ?? "");
  const wd = formatSeasonWeekDay(date, timelineAnchor, timelineDates);
  const unitSuffix = units ? ` ${units}` : "";
  const primaryVal = row?.[valueKey];
  const secondaryVal = row?.[secondaryKey];

  return (
    <div
      className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-foreground shadow-lg"
      style={{ maxWidth: 260 }}
    >
      <p className="mb-1 font-medium">
        {wd ? `${date} · ${wd}` : date}
      </p>
      {typeof primaryVal === "number" ? (
        <p>
          {primaryLabel}: {primaryVal.toFixed(2)}
          {unitSuffix}
        </p>
      ) : null}
      {typeof secondaryVal === "number" ? (
        <p>
          {secondaryLabel}: {secondaryVal.toFixed(2)}
          {unitSuffix}
        </p>
      ) : null}
      {row?.n != null ? <p className="text-foreground-muted">n = {row.n}</p> : null}
      {row?.output ? (
        <p className="mt-1 tabular-nums text-foreground-muted">
          Output: {formatStatBox(row.output)}
        </p>
      ) : null}
      {row?.change ? (
        <p className="tabular-nums text-foreground-muted">
          Change %: {formatStatBox(row.change)}
        </p>
      ) : null}
    </div>
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
  showZeroLine = false,
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
  showZeroLine?: boolean;
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
  const hasStats = data.some((row) => row.output != null || row.change != null);

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
              tickFormatter={(v: number) =>
                units === "%" ? Number(v).toFixed(1) : String(v)
              }
            />
            {showZeroLine ? (
              <ReferenceLine
                y={0}
                stroke="var(--foreground-muted)"
                strokeDasharray="3 3"
              />
            ) : null}
            <Tooltip
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              content={
                hasStats
                  ? (props) => (
                      <StatsTooltip
                        {...props}
                        units={units}
                        valueKey={valueKey}
                        secondaryKey={secondaryKey}
                        secondaryLabel={secondaryLabel}
                        primaryLabel={label}
                        timelineAnchor={timelineAnchor}
                        timelineDates={dates}
                      />
                    )
                  : undefined
              }
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
