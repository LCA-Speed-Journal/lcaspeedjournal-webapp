"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { ZoneLegend, ZoneMark } from "@/app/leaderboard/ZoneMark";
import type { NormPopulationOption } from "@/types";
import {
  type TestingDayBoardData,
  type TestingDayGroup,
  type TestingDayMatrixAthlete,
  type TestingDayMatrixCell,
  type TestingDayMatrixColumn,
} from "@/lib/norms/testing-day";
import { ZONE_COLORS, isZoneLabel, type ZoneLabel } from "@/lib/norms/palette";
import {
  HUGO_GROUP_META,
  isHugoGroup,
} from "@/lib/weight-room/constants";
import "./testing-day-print.css";

type SessionItem = {
  id: string;
  session_date: string;
  phase?: string;
  phase_week?: number;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/reporting/testing-day";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: unknown };
      if (typeof json.error === "string" && json.error.trim()) {
        message = json.error;
      }
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function fmtMark(value: number, units: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return units ? `${n} ${units}` : n;
}

function sportLabel(sport: string | null): string {
  if (sport == null) return "No primary sport";
  if (isHugoGroup(sport)) return HUGO_GROUP_META[sport].label;
  return sport;
}

function genderLabel(gender: "M" | "F" | null): string {
  if (gender === "M") return "M";
  if (gender === "F") return "F";
  return "Unknown";
}

function efficientPlusTotal(groups: TestingDayGroup[]): number {
  return groups.reduce((sum, group) => sum + group.efficient_plus, 0);
}

export default function TestingDayClient() {
  const [sessionId, setSessionId] = useState("");
  const [populationId, setPopulationId] = useState("");
  const [, startTransition] = useTransition();

  const { data: sessionsData } = useSWR<{ data: SessionItem[] }>(
    "/api/sessions",
    jsonFetcher
  );
  const sessions = sessionsData?.data ?? [];

  const { data: populationsData } = useSWR<{ data: NormPopulationOption[] }>(
    "/api/norms/populations",
    jsonFetcher
  );
  const populations = populationsData?.data ?? [];

  const boardUrl = useMemo(() => {
    if (!sessionId) return null;
    const params = new URLSearchParams({ session_id: sessionId });
    if (populationId) params.set("population_id", populationId);
    return `/api/reporting/testing-day?${params.toString()}`;
  }, [sessionId, populationId]);

  const { data, error, isLoading } = useSWR<{ data: TestingDayBoardData }>(
    boardUrl,
    jsonFetcher
  );
  const board = data?.data;

  function onSessionChange(id: string) {
    startTransition(() => {
      setSessionId(id);
    });
  }

  const selectedSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 print:overflow-visible print:bg-white print:px-0 print:py-0 md:px-8 md:py-10">
      <div className="testing-day-chrome print:hidden">
        <PageBackground />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 print:max-w-none print:space-y-4">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none print:ring-0 md:p-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:mb-4">
            <div>
              <div className="testing-day-chrome mb-4 inline-block h-1 w-16 rounded-full bg-accent print:hidden" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl print:text-2xl">
                Testing-day summary
              </h1>
              <p className="testing-day-chrome mt-2 text-sm text-foreground-muted print:hidden">
                One row per athlete, one column per test. Badges follow the live
                stick, including poor and developmental. Override paints everyone
                with one table.
              </p>
              {board && (
                <p className="mt-2 hidden text-sm text-foreground print:block">
                  {board.session_date}
                  {board.phase ? ` — ${board.phase}` : ""}
                </p>
              )}
            </div>
            <div className="testing-day-chrome flex shrink-0 flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!board}
                className="rounded-xl border border-accent/60 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print
              </button>
              <Link
                href="/reporting"
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
              >
                Reporting
              </Link>
            </div>
          </header>

          <div className="testing-day-chrome mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
            <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Session</span>
              <select
                value={sessionId}
                onChange={(e) => onSessionChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Select session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.session_date).slice(0, 10)}
                    {s.phase != null ? ` — ${s.phase}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[14rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Compare using</span>
              <select
                value={populationId}
                onChange={(e) =>
                  startTransition(() => setPopulationId(e.target.value))
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Athlete sport default</option>
                {populations.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <p className="testing-day-chrome mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 print:hidden">
              {error instanceof Error ? error.message : "Failed to load summary"}
            </p>
          )}

          {isLoading && boardUrl && (
            <p className="testing-day-chrome text-sm text-foreground-muted print:hidden" aria-live="polite">
              Loading summary…
            </p>
          )}

          {!sessionId ? (
            <p className="testing-day-chrome text-sm text-foreground-muted print:hidden">
              Pick a session
              {selectedSession ? ` (${String(selectedSession.session_date).slice(0, 10)})` : ""}.
            </p>
          ) : null}

          {board && !isLoading && (
            <div className="space-y-8 print:space-y-4">
              {board.matrix.columns.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No entries for this session.
                </p>
              ) : (
                <>
                  <ZoneLegend />
                  <TestingDayMatrixTable
                    columns={board.matrix.columns}
                    athletes={board.matrix.athletes}
                    tests={board.tests}
                  />
                  {board.tests.map((test) => (
                    <div key={test.column_key} className="space-y-4">
                      <h2 className="text-lg font-semibold text-foreground">
                        {test.metric_display_name}
                        {test.component ? ` (${test.component})` : ""}
                      </h2>
                      {test.groups.length === 0 ? (
                        <p className="text-sm text-foreground-muted">No entries.</p>
                      ) : (
                        test.groups.map((group) => (
                          <TestingDaySection
                            key={`${test.column_key}-${group.sport ?? "none"}-${group.gender ?? "u"}`}
                            group={group}
                            units={test.units}
                          />
                        ))
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestingDayMatrixTable({
  columns,
  athletes,
  tests,
}: {
  columns: TestingDayMatrixColumn[];
  athletes: TestingDayMatrixAthlete[];
  tests: TestingDayBoardData["tests"];
}) {
  const plusByColumn = new Map(
    tests.map((test) => [test.column_key, efficientPlusTotal(test.groups)])
  );

  return (
    <div className="testing-day-matrix overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated/60">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[10rem] bg-surface-elevated px-3 py-2 text-left font-semibold text-foreground"
            >
              Athlete
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="min-w-[8.5rem] px-3 py-2 text-left font-semibold text-foreground"
              >
                <div>{column.display_name}</div>
                {column.component ? (
                  <div className="text-xs font-normal text-foreground-muted">
                    {column.component}
                  </div>
                ) : null}
                <div className="text-xs font-normal tabular-nums text-foreground-muted">
                  Efficient+ {plusByColumn.get(column.key) ?? 0}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {athletes.map((athlete) => (
            <tr
              key={athlete.athlete_id}
              className="border-b border-border/70 last:border-b-0"
            >
              <th
                scope="row"
                className="sticky left-0 bg-surface px-3 py-2 text-left font-medium text-foreground"
              >
                <div>
                  {athlete.first_name} {athlete.last_name}
                </div>
                <div className="text-xs font-normal text-foreground-muted">
                  {sportLabel(athlete.sport)} · {genderLabel(athlete.gender)}
                </div>
              </th>
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2 align-top">
                  <MatrixCell cell={athlete.cells[column.key]} units={column.units} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  cell,
  units,
}: {
  cell: TestingDayMatrixCell | undefined;
  units: string;
}) {
  if (!cell) {
    return <span className="text-foreground-muted">—</span>;
  }
  const label = cell.zone_label;
  const showBadge = Boolean(label && isZoneLabel(label));
  const color =
    cell.zone_color ??
    (showBadge && isZoneLabel(label) ? ZONE_COLORS[label] : undefined);

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-mono tabular-nums text-foreground">
        {fmtMark(cell.display_value, units)}
      </span>
      {showBadge && color ? <ZoneMark label={label!} color={color} /> : null}
    </div>
  );
}

function TestingDaySection({
  group,
  units,
}: {
  group: TestingDayGroup;
  units: string;
}) {
  return (
    <section className="testing-day-section rounded-xl border border-border bg-surface-elevated/40 p-4 print:border-neutral-300 print:bg-transparent">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          {sportLabel(group.sport)} · {genderLabel(group.gender)}
        </h3>
        <p className="text-sm tabular-nums text-foreground-muted">
          n = {group.headcount}
        </p>
      </header>

      {!group.has_standard ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground-muted">No standard</p>
          <UnbadgedList athletes={group.unbadged} units={units} emptyLabel="No athletes" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {group.label_counts.map((c) => (
              <span
                key={c.label}
                className="zone-badge tabular-nums"
                style={{ color: ZONE_COLORS[c.label as ZoneLabel] }}
              >
                {c.label} {c.count}
              </span>
            ))}
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-sm font-semibold tabular-nums text-foreground">
              Efficient+ {group.efficient_plus}
            </span>
          </div>
          {group.unbadged.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground-muted">
                Unbadged
              </h4>
              <UnbadgedList athletes={group.unbadged} units={units} emptyLabel="" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function UnbadgedList({
  athletes,
  units,
  emptyLabel,
}: {
  athletes: TestingDayGroup["unbadged"];
  units: string;
  emptyLabel: string;
}) {
  if (athletes.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-foreground-muted">{emptyLabel}</p>
    ) : null;
  }
  return (
    <ul className="space-y-1 text-sm text-foreground">
      {athletes.map((a) => (
        <li key={a.athlete_id} className="flex justify-between gap-4">
          <span>
            {a.first_name} {a.last_name}
          </span>
          <span className="tabular-nums text-foreground-muted">
            {fmtMark(a.display_value, units)}
          </span>
        </li>
      ))}
    </ul>
  );
}
