"use client";

/**
 * TeamOverviewDashboard — Team Leaders (men/women + per Hugo team)
 * for the current school year, plus recent coach notes.
 */
import { useState } from "react";
import useSWR from "swr";
import type {
  HugoLeaderBlock,
  LeaderCell,
  LeaderMetricRow,
} from "@/lib/athletes/team-leaders";
import { speedJournalSchoolYearRange } from "@/lib/team-progress/date-presets";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TeamOverviewData = {
  from: string;
  to: string;
  active_count: number;
  overall_leaders: LeaderMetricRow[];
  hugo_leaders: HugoLeaderBlock[];
  recent_notes: {
    athlete_id: string;
    first_name: string;
    last_name: string;
    note_preview: string;
    created_at: string;
  }[];
};

function formatValue(value: number, units: string): string {
  const n = Number.isFinite(value) ? value.toFixed(2) : String(value);
  return units ? `${n} ${units}` : n;
}

function formatCell(cell: LeaderCell | null, units: string): string {
  if (!cell) return "—";
  return `${cell.first_name} ${cell.last_name} — ${formatValue(cell.best_value, units)}`;
}

function LeaderTable({ rows }: { rows: LeaderMetricRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No metric data in this window.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-foreground-muted">
            <th className="py-2 pr-3 font-medium">Metric</th>
            <th className="py-2 pr-3 font-medium">Men</th>
            <th className="py-2 font-medium">Women</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.metric_key} className="border-b border-border/60">
              <td className="py-2 pr-3 font-medium text-foreground">
                {row.display_name}
              </td>
              <td className="py-2 pr-3 tabular-nums text-foreground-muted">
                {formatCell(row.men, row.units)}
              </td>
              <td className="py-2 tabular-nums text-foreground-muted">
                {formatCell(row.women, row.units)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamOverviewDashboard() {
  const [range, setRange] = useState(speedJournalSchoolYearRange);
  const from = range.from;
  const to = range.to;

  function applySchoolYear() {
    setRange(speedJournalSchoolYearRange());
  }

  const url = `/api/team-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const { data, error, isLoading } = useSWR<{ data: TeamOverviewData }>(
    url,
    fetcher,
    { keepPreviousData: true }
  );

  const overview = data?.data;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
        <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
        <h2 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
          Team Leaders
        </h2>
        <p className="text-sm text-foreground-muted">
          {overview
            ? `${overview.active_count} current athlete${
                overview.active_count !== 1 ? "s" : ""
              } · ${overview.from} → ${overview.to}`
            : isLoading
              ? "Loading team overview..."
              : "No data"}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) =>
              setRange((r) => ({ ...r, from: e.target.value }))
            }
            className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground-muted">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) =>
              setRange((r) => ({ ...r, to: e.target.value }))
            }
            className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <button
          type="button"
          onClick={applySchoolYear}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent/50"
        >
          School year
        </button>
      </div>

      {error && !overview ? (
        <div className="rounded-2xl border-2 border-danger/50 bg-danger/5 p-6 text-center">
          <p className="text-danger">Failed to load team overview</p>
        </div>
      ) : !overview && isLoading ? (
        <p className="text-sm text-foreground-muted">Loading team overview...</p>
      ) : !overview ? (
        <p className="text-sm text-foreground-muted">No data</p>
      ) : (
        <>
      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-lg font-semibold text-foreground">Overall</h3>
        <LeaderTable rows={overview.overall_leaders} />
      </section>

      {overview.hugo_leaders.map((block) => {
        const meta = HUGO_GROUP_META[block.hugo_group as HugoGroup];
        if (!meta) return null;
        return (
          <details
            key={block.hugo_group}
            className="rounded-xl border border-border bg-surface-elevated p-4"
          >
            <summary className="cursor-pointer text-lg font-semibold text-foreground">
              {meta.label}
            </summary>
            <div className="mt-3">
              <LeaderTable rows={block.leaders} />
            </div>
          </details>
        );
      })}

      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-lg font-semibold text-foreground">
          Recent coach notes
        </h3>
        {overview.recent_notes.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No coach notes yet across the team.
          </p>
        ) : (
          <ul className="space-y-3">
            {overview.recent_notes.map((n) => (
              <li
                key={`${n.athlete_id}-${n.created_at}`}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                <p className="text-xs font-medium text-foreground-muted">
                  {n.first_name} {n.last_name} •{" "}
                  {new Date(n.created_at).toLocaleDateString()}
                </p>
                <p className="mt-1 text-sm text-foreground">{n.note_preview}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      )}

      <p className="text-center text-xs text-foreground-muted">
        Select an athlete from the roster to view their individual dashboard
      </p>
    </div>
  );
}
