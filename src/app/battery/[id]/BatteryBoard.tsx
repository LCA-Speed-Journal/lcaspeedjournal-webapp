"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { useTheme, type Theme } from "@/app/components/ThemeProvider";
import { orderBoard, type BoardRow } from "@/lib/battery/board-order";
import type { BoardCell, BoardColumn, BoardPayload } from "@/lib/battery/load";

export { orderBoard };

const PAGE_SIZE = 12;
const ADVANCE_MS = 8000;
const REFRESH_MS = 5000;
const SLOT_COUNT = 9;

const QUALIFIERS = [
  { key: "reactive", letter: "R", label: "Reactive", tone: "bg-blue-500", ink: "text-white" },
  { key: "compliant", letter: "C", label: "Compliant", tone: "bg-red-500", ink: "text-white" },
  { key: "stiff", letter: "S", label: "Stiff", tone: "bg-green-500", ink: "text-white" },
  { key: "developing", letter: "D", label: "Developing", tone: "bg-yellow-400", ink: "text-neutral-950" },
] as const;

type QualifierMark = (typeof QUALIFIERS)[number];

type BoardResponse = { data: BoardPayload; url: string };

type PageItem =
  | { kind: "row"; row: BoardRow }
  | { kind: "cutoff" }
  | { kind: "untested" };

class BoardRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    handler();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}

/** Dark board for this route only. The previous choice is restored when the coach leaves. */
function useDarkGymBoard() {
  const { theme, setTheme } = useTheme();
  const previous = useRef<Theme | null>(null);
  if (previous.current === null) previous.current = theme;

  useEffect(() => {
    const restore = previous.current ?? "system";
    setTheme("dark");
    return () => setTheme(restore);
  }, [setTheme]);
}

async function fetchBoard(url: string): Promise<BoardResponse> {
  const response = await fetch(url);
  let body: { data?: BoardPayload; error?: string } = {};
  try {
    body = (await response.json()) as { data?: BoardPayload; error?: string };
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new BoardRequestError(response.status, body.error || "Failed to load battery board");
  }
  if (!body.data) {
    throw new BoardRequestError(response.status, "Failed to load battery board");
  }
  return { data: body.data, url };
}

/** Index of the last tested athlete who stays above the cutoff. Null when the line should not be drawn. */
export function cutoffAfterIndex(rows: BoardRow[], cutoff: number | null): number | null {
  if (cutoff == null || cutoff <= 0) return null;
  let testedCount = 0;
  let last = -1;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.untested || row.place == null) continue;
    testedCount += 1;
    if (row.place <= cutoff) last = index;
  }
  if (testedCount < cutoff || last < 0) return null;
  return last;
}

export function pageItems(rows: BoardRow[], page: number, cutoffAfter: number | null): PageItem[] {
  const start = page * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const items: PageItem[] = [];
  let inUntested = false;
  slice.forEach((row, index) => {
    if (row.untested && (index === 0 || !inUntested)) {
      items.push({ kind: "untested" });
      inUntested = true;
    }
    items.push({ kind: "row", row });
    if (cutoffAfter != null && start + index === cutoffAfter) {
      items.push({ kind: "cutoff" });
    }
  });
  return items;
}

function formatMark(value: number, units: string): string {
  if (units === "%") return value.toFixed(1);
  if (units === "s" || units === "RSI" || units === "DRI") return value.toFixed(2);
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/** Signed change. Hundredths stay visible under 0.1 so a -0.06 sprint delta does not round away. */
export function formatDelta(change: number): string {
  const abs = Math.abs(change);
  const digits = abs < 0.1 ? 2 : abs < 10 ? 1 : 0;
  const rounded = Number(change.toFixed(digits));
  const body = Math.abs(rounded).toFixed(digits);
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return digits === 0 ? "0" : (0).toFixed(digits);
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function placeTone(place: number | null): string {
  if (place === 1) return "text-gold-text";
  if (place === 2) return "text-silver";
  if (place === 3) return "text-bronze";
  return "text-foreground";
}

function chipClass(active: boolean): string {
  return active
    ? "rounded-full border border-accent/60 bg-accent/15 px-3 py-1 text-xs font-semibold text-foreground"
    : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground-muted hover:border-accent/50 hover:text-foreground";
}

function columnTemplate(count: number): string {
  return `3.25rem 2.75rem minmax(6.5rem, 1.15fr) repeat(${count}, minmax(0, 1fr)) 3.25rem 2.9rem`;
}

function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      <PageBackground />
      <div className="relative z-10 flex h-full min-w-0 flex-col px-3 py-3 sm:px-5">{children}</div>
    </div>
  );
}

function StatusScreen({ message }: { message: string }) {
  return (
    <BoardFrame>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg font-medium text-foreground">{message}</p>
      </div>
    </BoardFrame>
  );
}

function qualifierMark(qualifier: string | null): QualifierMark | null {
  if (!qualifier) return null;
  const key = qualifier.trim().toLowerCase();
  return QUALIFIERS.find((item) => item.key === key) ?? null;
}

function QualifierLetter({ item }: { item: QualifierMark }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.tone} ${item.ink}`}
      title={item.label}
    >
      {item.letter}
    </span>
  );
}

function QualifierLegend() {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
      {QUALIFIERS.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <QualifierLetter item={item} />
          {item.label}
        </span>
      ))}
    </p>
  );
}

function MarkCell({
  column,
  cell,
  qualifier,
}: {
  column: BoardColumn;
  cell: BoardCell | undefined;
  qualifier: string | null;
}) {
  if (!cell) {
    return <span className="block text-center font-mono text-xs text-foreground-muted">—</span>;
  }
  const place = cell.tied ? `T${cell.rank}` : String(cell.rank);
  const rsi = column.key === "10-5_RSI" ? qualifierMark(qualifier) : null;
  return (
    <div className="min-w-0 overflow-hidden text-center leading-none">
      <div className="flex items-center justify-center gap-1">
        {rsi ? <QualifierLetter item={rsi} /> : null}
        <span className="font-mono text-sm font-semibold tabular-nums">{formatMark(cell.value, column.units)}</span>
        <span className="font-mono text-[10px] tabular-nums text-foreground-muted">{place}</span>
      </div>
      {cell.delta ? (
        <p
          className={`mt-0.5 font-mono text-[10px] tabular-nums ${
            cell.delta.improved ? "text-success" : "text-foreground-muted"
          }`}
          data-delta={column.key}
        >
          {formatDelta(cell.delta.change)}
        </p>
      ) : null}
      {column.key === "DRI" && cell.band ? (
        <p className="mt-1 text-base font-semibold leading-tight text-accent" title={cell.band}>
          {cell.band}
        </p>
      ) : null}
    </div>
  );
}

function AthleteRow({
  row,
  columns,
  template,
}: {
  row: BoardRow;
  columns: BoardColumn[];
  template: string;
}) {
  const { athlete, place, untested } = row;
  const name = `${athlete.first_name} ${athlete.last_name}`.trim() || "Athlete";
  return (
    <div
      className={`grid min-h-0 max-h-24 min-w-0 flex-1 items-center overflow-hidden border-b border-border/70 ${
        untested ? "bg-surface/40 text-foreground-muted" : "bg-surface/25"
      }`}
      style={{ gridTemplateColumns: template }}
      data-board-row
      data-place={place ?? ""}
      data-untested={untested ? "true" : "false"}
      data-athlete={athlete.athlete_id}
    >
      <span className={`pl-1 text-center font-mono text-2xl font-bold leading-none tabular-nums ${placeTone(place)}`}>
        {place ?? "—"}
      </span>
      <span className="truncate text-center font-mono text-xs tabular-nums text-foreground-muted">
        {athlete.bib ?? "—"}
      </span>
      <span className="truncate pr-2 text-sm font-semibold" title={name}>
        {name}
      </span>
      {columns.map((column) => (
        <MarkCell
          key={column.key}
          column={column}
          cell={athlete.cells[column.key]}
          qualifier={athlete.qualifier}
        />
      ))}
      <span className="text-center font-mono text-sm font-semibold tabular-nums">
        {formatPoints(athlete.total_points)}
      </span>
      <span className="pr-1 text-center font-mono text-xs tabular-nums text-foreground-muted">
        {athlete.slots_completed}/{SLOT_COUNT}
      </span>
    </div>
  );
}

export function BatteryBoard({ batteryId }: { batteryId: string }) {
  useDarkGymBoard();
  const [view, setView] = useState<"today" | "meet">("today");
  const [group, setGroup] = useState("overall");
  const [paused, setPaused] = useState(false);
  const [page, setPage] = useState(0);
  const scope = `${view}:${group}`;
  const [pageScope, setPageScope] = useState(scope);

  const isVisible = usePageVisible();
  const url = `/api/battery/${encodeURIComponent(batteryId)}/board?view=${view}&group=${encodeURIComponent(group)}`;
  const { data, error, isLoading } = useSWR<BoardResponse>(url, fetchBoard, {
    refreshInterval: isVisible ? REFRESH_MS : 0,
  });
  const fetched = data?.url === url ? data.data : undefined;
  const payload = !isLoading && fetched?.view === view ? fetched : undefined;
  const ordered = payload ? orderBoard(payload.athletes, payload.untested_ids) : [];
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  if (pageScope !== scope) {
    setPageScope(scope);
    setPage(0);
  } else if (page !== safePage) {
    setPage(safePage);
  }
  const cutoff = payload?.battery.cutoff_n ?? null;
  const lineAfter = cutoffAfterIndex(ordered, cutoff);
  const testedCount = ordered.reduce((count, row) => count + (row.untested ? 0 : 1), 0);
  const refreshFailed = Boolean(payload && error);

  useEffect(() => {
    if (paused || !isVisible || ordered.length <= PAGE_SIZE) return;
    const count = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
    const timer = window.setInterval(() => {
      setPage((current) => (current + 1) % count);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, isVisible, ordered.length, scope]);

  if (!payload) {
    if (error && !isLoading) {
      const message =
        error instanceof BoardRequestError && error.status === 404
          ? "This battery is missing."
          : error instanceof Error
            ? error.message
            : "Failed to load battery board";
      return <StatusScreen message={message} />;
    }
    return <StatusScreen message="Loading board…" />;
  }

  const statusLabel = [
    refreshFailed ? "Refresh failed" : null,
    paused ? "Paused" : refreshFailed ? null : "Live",
    `${safePage + 1}/${pageCount}`,
  ]
    .filter((part) => part != null)
    .join(" · ");

  const columns = payload.columns;
  const showRsiLegend = columns.some((column) => column.key === "10-5_RSI");
  const template = columnTemplate(columns.length);
  const items = pageItems(ordered, safePage, lineAfter);
  const dayLabel = payload.day_label.trim() || (payload.view === "meet" ? "Meet" : "Today");
  const showGroups = payload.battery.grouping_mode === "subteam";
  const showSpots = cutoff != null && cutoff > 0 && testedCount < cutoff;
  const dataRowCount = items.filter((item) => item.kind === "row").length;

  return (
    <BoardFrame>
      <header className="mb-2 shrink-0">
        <div className="mb-2 h-1 w-12 rounded-full bg-accent" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.22em] text-foreground-muted">
              {payload.battery.title}
            </p>
            <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">{dayLabel}</h1>
            {showSpots ? (
              <p className="mt-1 text-sm font-medium text-accent" data-spots-note>
                {testedCount} of {cutoff} spots filled
              </p>
            ) : null}
            {showRsiLegend ? <QualifierLegend /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-border bg-surface p-0.5">
              <button type="button" className={chipClass(view === "today")} onClick={() => setView("today")}>
                Today
              </button>
              <button type="button" className={chipClass(view === "meet")} onClick={() => setView("meet")}>
                Meet
              </button>
            </div>
            {showGroups ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={chipClass(group === "overall")}
                  onClick={() => setGroup("overall")}
                >
                  Overall
                </button>
                {payload.groups.map((entry) => (
                  <button
                    key={entry.group_key}
                    type="button"
                    className={chipClass(group === entry.group_key)}
                    onClick={() => setGroup(entry.group_key)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              aria-pressed={paused}
              aria-live="polite"
              data-board-status
              onClick={() => setPaused((current) => !current)}
              className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-sm uppercase tracking-wider text-foreground hover:border-accent/50"
            >
              {statusLabel}
            </button>
          </div>
        </div>
      </header>

      <div
        className="grid shrink-0 border-b border-border text-[10px] font-semibold uppercase tracking-wide text-foreground-muted"
        style={{ gridTemplateColumns: template }}
      >
        <span className="py-1 text-center">#</span>
        <span className="py-1 text-center">Bib</span>
        <span className="py-1">Athlete</span>
        {columns.map((column) => (
          <span key={column.key} className="truncate px-0.5 py-1 text-center" title={column.label}>
            {column.label}
          </span>
        ))}
        <span className="py-1 text-center">Pts</span>
        <span className="py-1 text-center">Slots</span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-row-count={dataRowCount}>
        {items.length === 0 ? (
          <p className="px-1 py-6 text-sm text-foreground-muted">No athletes on this board yet.</p>
        ) : (
          items.map((item) => {
            if (item.kind === "cutoff") {
              return (
                <div key="cutoff" className="flex shrink-0 items-center gap-3 py-1" data-cutoff={cutoff}>
                  <div className="h-px flex-1 bg-accent shadow-[0_0_10px_var(--accent)]" />
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                    Cutoff {cutoff}
                  </span>
                  <div className="h-px flex-1 bg-accent shadow-[0_0_10px_var(--accent)]" />
                </div>
              );
            }
            if (item.kind === "untested") {
              return (
                <div key="untested" className="flex shrink-0 items-center gap-3 py-1" data-untested-block>
                  <div className="h-px flex-1 bg-border" />
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground-muted">
                    Not tested
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              );
            }
            return (
              <AthleteRow
                key={item.row.athlete.athlete_id}
                row={item.row}
                columns={columns}
                template={template}
              />
            );
          })
        )}
      </div>
    </BoardFrame>
  );
}
