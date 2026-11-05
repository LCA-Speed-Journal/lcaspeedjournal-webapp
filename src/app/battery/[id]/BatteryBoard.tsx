"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { orderBoard, type BoardRow } from "@/lib/battery/board-order";
import type { BoardCell, BoardColumn, BoardPayload } from "@/lib/battery/load";

export { orderBoard };

const PAGE_SIZE = 12;
const ADVANCE_MS = 8000;
const REFRESH_MS = 5000;

const QUALIFIERS = [
  { key: "reactive", label: "Reactive", text: "text-blue-800 [.dark_&]:text-blue-400" },
  { key: "compliant", label: "Compliant", text: "text-red-800 [.dark_&]:text-red-400" },
  { key: "stiff", label: "Stiff", text: "text-green-800 [.dark_&]:text-green-400" },
  { key: "developing", label: "Developing", text: "text-yellow-800 [.dark_&]:text-yellow-400" },
] as const;

const DRI_BAND_TEXT: Record<string, string> = {
  "Warming Up": "text-neutral-600 [.dark_&]:text-neutral-400",
  "Rebound Ready": "text-yellow-800 [.dark_&]:text-yellow-400",
  "Pretty Springy": "text-green-800 [.dark_&]:text-green-400",
  Bouncy: "text-blue-800 [.dark_&]:text-blue-400",
  Elite: "text-purple-800 [.dark_&]:text-purple-400",
};

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

function formatFeetInches(feet: number): string {
  const totalInches = Math.round(Math.abs(feet) * 12);
  const whole = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const sign = feet < 0 ? "-" : "";
  return `${sign}${whole}'${inches}"`;
}

export function formatMark(value: number, units: string): string {
  if (units === "ft") return formatFeetInches(value);
  if (units === "in") {
    const body = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${body}in.`;
  }
  if (units === "%") return `${value.toFixed(1)}%`;
  if (units === "s") return `${value.toFixed(2)}s`;
  if (units === "mph") {
    const body = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${body}mph`;
  }
  if (units === "RSI" || units === "DRI" || units === "") return value.toFixed(2);
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

/** Absolute change plus the percent of the soccer mark, e.g. "-0.3 (-6%)". */
export function formatDeltaLine(change: number, previous: number): string {
  const amount = formatDelta(change);
  if (!Number.isFinite(previous) || previous === 0 || !Number.isFinite(change)) return amount;
  const pct = (change / previous) * 100;
  if (!Number.isFinite(pct)) return amount;
  const rounded = Math.round(pct);
  const percent = rounded > 0 ? `+${rounded}%` : `${rounded}%`;
  return `${amount} (${percent})`;
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Phone column: "Jax T." The wide board still shows the full name. */
export function shortName(first: string, last: string): string {
  const firstName = first.trim();
  const initial = last.trim().charAt(0).toUpperCase();
  if (!firstName && !initial) return "Athlete";
  if (!initial) return firstName;
  if (!firstName) return `${initial}.`;
  return `${firstName} ${initial}.`;
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

const PLACE_COL = "2.25rem";
const NAME_COL = "minmax(5.25rem, 1.05fr)";

function columnTemplate(count: number): string {
  return `${PLACE_COL} ${NAME_COL} repeat(${count}, minmax(4.75rem, 1fr)) 2.75rem`;
}

const PIN_PLACE = "sticky left-0 z-10";
const PIN_NAME = "sticky left-[2.25rem] z-10 border-r border-border/80";

function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      <PageBackground />
      <div className="relative z-10 flex h-full min-w-0 flex-col px-3 pb-3 pt-14 sm:px-5">{children}</div>
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

function podiumFrame(rank: number): string {
  if (rank === 1) return "rounded-md border border-gold/70 bg-gold/15";
  if (rank === 2) return "rounded-md border border-silver/70 bg-silver/15";
  if (rank === 3) return "rounded-md border border-bronze/70 bg-bronze/15";
  return "";
}

function QualifierLegend() {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
      {QUALIFIERS.map((item) => (
        <span key={item.key} className={item.text}>
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
  numberClass,
}: {
  column: BoardColumn;
  cell: BoardCell | undefined;
  qualifier: string | null;
  numberClass: string;
}) {
  const place = cell ? (cell.tied ? `T${cell.rank}` : String(cell.rank)) : "";
  const rsi = cell && column.key === "10-5_RSI" ? qualifierMark(qualifier) : null;
  const frame = cell ? podiumFrame(cell.rank) : "";
  const shown = cell ? formatMark(cell.value, column.units) : "";
  const suffix =
    column.units === "s" || column.units === "mph" || column.units === "%"
      ? column.units
      : column.units === "in"
        ? "in."
        : "";
  const body = suffix && shown.endsWith(suffix) ? shown.slice(0, -suffix.length) : shown;
  return (
    <div className="relative grid h-full min-w-0 grid-rows-[1fr_auto_1fr] self-stretch overflow-hidden px-0 text-center md:px-0.5">
      {frame ? <div className={`pointer-events-none absolute inset-x-0.5 inset-y-[5%] ${frame}`} /> : null}
      <div />
      {cell ? (
        <div className="flex items-baseline justify-center gap-0.5 leading-none md:gap-1">
          <span
            className={`font-mono font-bold tabular-nums leading-none ${numberClass} ${rsi ? rsi.text : ""}`}
            title={rsi?.label}
            data-mark={column.key}
          >
            {body}
            {suffix ? <span className="text-[11px] font-semibold md:text-[0.45em]">{suffix}</span> : null}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-foreground-muted">{place}</span>
        </div>
      ) : (
        <span className="font-mono text-xs leading-none text-foreground-muted">—</span>
      )}
      <div className="self-start leading-none">
        {cell?.delta ? (
          <p
            className={`font-mono text-[11px] tabular-nums ${
              cell.delta.improved ? "text-success" : "text-foreground-muted"
            }`}
            data-delta={column.key}
          >
            {formatDeltaLine(cell.delta.change, cell.delta.previous)}
          </p>
        ) : null}
        {cell && column.key === "DRI" && cell.band ? (
          <p
            className={`text-[11px] font-medium leading-none ${DRI_BAND_TEXT[cell.band] ?? "text-foreground-muted"}`}
            title={cell.band}
          >
            {cell.band}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AthleteRow({
  row,
  columns,
  template,
  numberClass,
}: {
  row: BoardRow;
  columns: BoardColumn[];
  template: string;
  numberClass: string;
}) {
  const { athlete, place, untested } = row;
  const name = `${athlete.first_name} ${athlete.last_name}`.trim() || "Athlete";
  const compact = shortName(athlete.first_name, athlete.last_name);
  const pinBg = untested
    ? "bg-[color-mix(in_srgb,var(--surface)_40%,var(--background))]"
    : "bg-[color-mix(in_srgb,var(--surface)_25%,var(--background))]";
  return (
    <div
      className={`grid w-full min-h-0 flex-1 items-center border-b border-border/70 ${
        untested ? "bg-surface/40 text-foreground-muted" : "bg-surface/25"
      }`}
      style={{ gridTemplateColumns: template }}
      data-board-row
      data-place={place ?? ""}
      data-untested={untested ? "true" : "false"}
      data-athlete={athlete.athlete_id}
    >
      <span
        className={`${PIN_PLACE} ${pinBg} flex items-center justify-center self-stretch text-center font-mono text-[17px] font-bold leading-none tabular-nums md:text-2xl ${placeTone(place)}`}
      >
        {place ?? "—"}
      </span>
      <span
        className={`${PIN_NAME} ${pinBg} flex min-w-0 flex-col justify-center self-stretch px-1`}
        title={name}
      >
        <span className="truncate text-[15px] font-semibold leading-tight md:hidden">{compact}</span>
        <span className="hidden truncate text-base font-semibold leading-tight md:inline">{name}</span>
        <span className="truncate font-mono text-[11px] font-medium tabular-nums leading-tight text-foreground-muted md:text-xs">
          {athlete.bib ?? "—"}
        </span>
      </span>
      {columns.map((column) => (
        <MarkCell
          key={column.key}
          column={column}
          cell={athlete.cells[column.key]}
          qualifier={athlete.qualifier}
          numberClass={numberClass}
        />
      ))}
      <span className="pr-1 text-center font-mono text-[13px] font-semibold tabular-nums md:text-sm">
        {formatPoints(athlete.total_points)}
      </span>
    </div>
  );
}

const SAMPLE_ALLOWED = process.env.NODE_ENV === "development";

export function BatteryBoard({
  batteryId,
  initialSample = false,
}: {
  batteryId: string;
  initialSample?: boolean;
}) {
  const [view, setView] = useState<"today" | "day" | "meet">("today");
  const [dayKey, setDayKey] = useState("");
  const [group, setGroup] = useState("overall");
  const [paused, setPaused] = useState(false);
  const [page, setPage] = useState(0);
  const [sample, setSample] = useState(initialSample);
  const scope = `${view}:${dayKey}:${group}:${sample ? "sample" : "live"}`;
  const [pageScope, setPageScope] = useState(scope);

  useEffect(() => {
    if (!SAMPLE_ALLOWED) return;
    const url = new URL(window.location.href);
    url.searchParams.set("sample", sample ? "1" : "0");
    window.history.replaceState(null, "", url);
  }, [sample]);

  const isVisible = usePageVisible();
  const dayQuery = view === "day" && dayKey ? `&day=${encodeURIComponent(dayKey)}` : "";
  const url = `/api/battery/${encodeURIComponent(batteryId)}/board?view=${view}&group=${encodeURIComponent(group)}${dayQuery}${SAMPLE_ALLOWED && sample ? "&sample=1" : ""}`;
  const { data, error, isLoading } = useSWR<BoardResponse>(url, fetchBoard, {
    refreshInterval: isVisible ? (sample ? 1000 : REFRESH_MS) : 0,
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
  const rowListRef = useRef<HTMLDivElement>(null);
  const rowTops = useRef(new Map<string, number>());
  const markText = useRef(new Map<string, string>());
  const motionKey = ordered
    .map((row) => {
      const cells = Object.entries(row.athlete.cells)
        .map(([key, cell]) => `${key}:${cell.value}`)
        .join(",");
      return `${row.athlete.athlete_id}:${row.place ?? ""}:${cells}`;
    })
    .join("|");

  useLayoutEffect(() => {
    const root = rowListRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-board-row]").forEach((node) => {
      const id = node.dataset.athlete;
      if (!id) return;
      const top = node.getBoundingClientRect().top;
      const previousTop = rowTops.current.get(id);
      if (previousTop != null && Math.abs(previousTop - top) > 1) {
        node.animate(
          [{ transform: `translateY(${previousTop - top}px)` }, { transform: "translateY(0)" }],
          { duration: 480, easing: "ease-out" }
        );
      }
      rowTops.current.set(id, top);
      node.querySelectorAll<HTMLElement>("[data-mark]").forEach((mark) => {
        const markKey = `${id}:${mark.dataset.mark ?? ""}`;
        const text = mark.textContent ?? "";
        const previous = markText.current.get(markKey);
        if (previous != null && previous !== text) {
          mark.animate(
            [{ backgroundColor: "rgba(250, 204, 21, 0.55)" }, { backgroundColor: "rgba(250, 204, 21, 0)" }],
            { duration: 700 }
          );
        }
        markText.current.set(markKey, text);
      });
    });
  }, [motionKey]);

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
  const numberClass =
    columns.length > 7
      ? "text-[15px] md:text-[clamp(1.05rem,1.35vw,2rem)]"
      : "text-[17px] md:text-[clamp(1.85rem,2.6vw,3.5rem)]";
  const items = pageItems(ordered, safePage, lineAfter);
  const dayLabel = payload.day_label.trim() || (payload.view === "meet" ? "Meet" : "Today");
  const showGroups = payload.battery.grouping_mode === "subteam";
  const showSpots = cutoff != null && cutoff > 0 && testedCount < cutoff;
  const dataRowCount = items.filter((item) => item.kind === "row").length;

  return (
    <BoardFrame>
      <header className="mb-1 shrink-0">
        <div className="mb-1 h-0.5 w-10 rounded-full bg-accent" />
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.22em] text-foreground-muted">
              {payload.battery.title}
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">{dayLabel}</h1>
            {showSpots ? (
              <p className="mt-1 text-sm font-medium text-accent" data-spots-note>
                {testedCount} of {cutoff} spots filled
              </p>
            ) : null}
            {payload.sample ? (
              <p className="mt-1 text-sm font-medium text-accent" data-sample-note>
                Sample marks for this roster. Nothing is saved.
              </p>
            ) : null}
            {showRsiLegend ? <QualifierLegend /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_ALLOWED ? (
              <button
                type="button"
                aria-pressed={sample}
                className={chipClass(sample)}
                onClick={() => setSample((current) => !current)}
              >
                Sample
              </button>
            ) : null}
            {SAMPLE_ALLOWED && sample ? (
              <a
                href={`/battery/${encodeURIComponent(batteryId)}/sample`}
                target="_blank"
                rel="noreferrer"
                className={chipClass(false)}
              >
                Adjust
              </a>
            ) : null}
            <div className="flex rounded-full border border-border bg-surface p-0.5">
              <button type="button" className={chipClass(view === "today")} onClick={() => setView("today")}>
                Today
              </button>
              {payload.days.map((day) => (
                <button
                  key={day.day_key}
                  type="button"
                  title={day.open ? `${day.label} (open)` : day.label}
                  aria-label={day.label || `Day ${day.day_key}`}
                  className={chipClass(view === "day" && dayKey === day.day_key)}
                  onClick={() => {
                    setDayKey(day.day_key);
                    setView("day");
                  }}
                >
                  Day {day.day_key}
                </button>
              ))}
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

      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overscroll-x-contain" data-row-count={dataRowCount} ref={rowListRef}>
        <div className="flex h-full w-max min-w-full flex-col">
          <div
            className="grid w-full shrink-0 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-foreground-muted"
            style={{ gridTemplateColumns: template }}
          >
            <span className={`${PIN_PLACE} bg-background py-1 text-center`}>#</span>
            <span className={`${PIN_NAME} bg-background py-1`}>Athlete</span>
            {columns.map((column) => (
              <span key={column.key} className="truncate px-0 py-1 text-center md:px-0.5" title={column.label}>
                {column.label}
              </span>
            ))}
            <span className="py-1 pr-1 text-center">Pts</span>
          </div>

          {items.length === 0 ? (
            <p className="px-1 py-6 text-sm text-foreground-muted">No athletes on this board yet.</p>
          ) : (
            items.map((item) => {
              if (item.kind === "cutoff") {
                return (
                  <div key="cutoff" className="flex w-full shrink-0 items-center gap-3 py-1" data-cutoff={cutoff}>
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
                  <div key="untested" className="flex w-full shrink-0 items-center gap-3 py-1" data-untested-block>
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
                  numberClass={numberClass}
                />
              );
            })
          )}
        </div>
      </div>
    </BoardFrame>
  );
}
