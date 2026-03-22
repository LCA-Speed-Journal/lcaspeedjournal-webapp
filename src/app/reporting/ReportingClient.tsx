"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { formatLeaderboardName } from "@/lib/display-names";
import type { ReportingSummaryData } from "@/types/reporting";

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDate(d);
}

function defaultTo(): string {
  return formatDate(new Date());
}

function fmtNum(x: number): string {
  if (Number.isInteger(x)) return String(x);
  return x.toFixed(2);
}

type SortKey = "name" | "entries" | "sessions";
type SortDir = "asc" | "desc";

export default function ReportingClient() {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(() => defaultFrom());
  const [to, setTo] = useState(() => defaultTo());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summaryUrl =
    from && to
      ? `/api/reporting/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : null;

  const { data, error, isLoading } = useSWR<{ data: ReportingSummaryData }>(summaryUrl, fetcher);

  const sortedAthletes = useMemo(() => {
    const list = data?.data?.athletes ?? [];
    const copy = [...list];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp =
          a.last_name.localeCompare(b.last_name) ||
          a.first_name.localeCompare(b.first_name);
      } else if (sortKey === "entries") {
        cmp = a.entry_count - b.entry_count;
      } else {
        cmp = a.session_count - b.session_count;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data?.data?.athletes, sortKey, sortDir]);

  const selected = sortedAthletes.find((x) => x.athlete_id === selectedId);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function downloadCsv() {
    const url = `/api/reporting/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const team = data?.data?.team;
  const emptyRange = team && team.entry_count === 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-8">
        <div
          className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8"
          style={{
            boxShadow:
              "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)",
          }}
        >
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Reporting
              </h1>
              <p className="mt-2 text-sm text-foreground-muted">
                Participation and performance by calendar range. Aggregates are per metric key
                (same units within a metric).
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </header>

          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground-muted">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSelectedId(null);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground-muted">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setSelectedId(null);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-xl border border-accent/60 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/25"
            >
              Download CSV
            </button>
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error instanceof Error ? error.message : "Failed to load summary"}
            </p>
          )}

          {isLoading && (
            <p className="text-sm text-foreground-muted" aria-live="polite">
              Loading summary…
            </p>
          )}

          {!isLoading && !error && team && (
            <>
              {emptyRange && (
                <p className="mb-6 text-sm text-foreground-muted">
                  No entries in this date range. You can still download a CSV with headers only.
                </p>
              )}

              <section className="mb-10 space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Team overview</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">
                      Sessions with data
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {team.session_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">
                      Athletes
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {team.athlete_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">
                      Total entries
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {team.entry_count}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-elevated/80">
                        <th className="px-3 py-2 font-medium text-foreground-muted">Metric</th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Attempts</th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Min</th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Max</th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Avg</th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Median</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.metrics.map((m) => (
                        <tr key={m.metric_key} className="border-b border-border/60">
                          <td className="px-3 py-2 text-foreground">{m.metric_label}</td>
                          <td className="px-3 py-2 tabular-nums text-foreground">{m.n}</td>
                          <td className="px-3 py-2 tabular-nums text-foreground">
                            {fmtNum(m.min)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-foreground">
                            {fmtNum(m.max)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-foreground">
                            {fmtNum(m.avg)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-foreground">
                            {fmtNum(m.median)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Athletes</h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-[480px] w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-elevated/80">
                        <th className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleSort("name")}
                            className="font-medium text-foreground-muted hover:text-foreground"
                          >
                            Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        </th>
                        <th className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleSort("entries")}
                            className="font-medium text-foreground-muted hover:text-foreground"
                          >
                            Entries{" "}
                            {sortKey === "entries" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        </th>
                        <th className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleSort("sessions")}
                            className="font-medium text-foreground-muted hover:text-foreground"
                          >
                            Sessions{" "}
                            {sortKey === "sessions" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        </th>
                        <th className="px-3 py-2 font-medium text-foreground-muted">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAthletes.map((a) => {
                        const open = selectedId === a.athlete_id;
                        return (
                          <tr
                            key={a.athlete_id}
                            className={`border-b border-border/60 ${open ? "bg-accent/5" : ""}`}
                          >
                            <td className="px-3 py-2 text-foreground">
                              {formatLeaderboardName(
                                a.first_name,
                                a.last_name,
                                (a.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
                                isMobile
                              )}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-foreground">
                              {a.entry_count}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-foreground">
                              {a.session_count}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedId(open ? null : a.athlete_id)
                                }
                                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                              >
                                {open ? "Hide" : "Show"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selected && selected.metrics.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border bg-surface-elevated/50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      {formatLeaderboardName(
                        selected.first_name,
                        selected.last_name,
                        (selected.athlete_type as "athlete" | "staff" | "alumni") ?? "athlete",
                        isMobile
                      )}{" "}
                      — by metric
                    </h3>
                    <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-3 font-medium text-foreground-muted">Metric</th>
                          <th className="py-2 pr-3 font-medium text-foreground-muted">n</th>
                          <th className="py-2 pr-3 font-medium text-foreground-muted">Min</th>
                          <th className="py-2 pr-3 font-medium text-foreground-muted">Max</th>
                          <th className="py-2 pr-3 font-medium text-foreground-muted">Avg</th>
                          <th className="py-2 font-medium text-foreground-muted">Median</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.metrics.map((m) => (
                          <tr key={m.metric_key} className="border-b border-border/50">
                            <td className="py-2 pr-3 text-foreground">{m.metric_label}</td>
                            <td className="py-2 pr-3 tabular-nums">{m.n}</td>
                            <td className="py-2 pr-3 tabular-nums">{fmtNum(m.min)}</td>
                            <td className="py-2 pr-3 tabular-nums">{fmtNum(m.max)}</td>
                            <td className="py-2 pr-3 tabular-nums">{fmtNum(m.avg)}</td>
                            <td className="py-2 tabular-nums">{fmtNum(m.median)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
