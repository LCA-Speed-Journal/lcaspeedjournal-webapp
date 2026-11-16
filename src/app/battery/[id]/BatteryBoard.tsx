"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { orderBoard, type BoardRow } from "@/lib/battery/board-order";
import type { BoardCell, BoardColumn, BoardPayload } from "@/lib/battery/load";
import { RsiChart } from "./RsiChart";
import type { RsqDot } from "./RsqPlot";

export { orderBoard };

const PAGE_SIZE = 11;
const ADVANCE_MS = 10000;
const REFRESH_MS = 5000;

const QUALIFIERS = [
  { key: "reactive", label: "Reactive", shape: "text-blue-600" },
  { key: "compliant", label: "Compliant", shape: "text-red-600" },
  { key: "stiff", label: "Stiff", shape: "text-green-600" },
  { key: "developing", label: "Developing", shape: "text-orange-500" },
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

const BIB_LINE = 16;

/** Largest font size whose widest label fits `width` and still leaves a line for the bib. */
export function fitLabelSize(
  labels: string[],
  width: number,
  height: number,
  measure: (label: string, size: number) => number
): number {
  const min = 14;
  const max = Math.max(min, height - BIB_LINE);
  const usable = labels.map((label) => label.trim()).filter((label) => label.length > 0);
  if (width <= 0 || usable.length === 0) return min;
  const widest = usable.reduce((best, label) => (measure(label, 16) > measure(best, 16) ? label : best));
  if (measure(widest, min) > width) return min;
  let lo = min;
  let hi = max;
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (measure(widest, mid) <= width) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 10) / 10;
}

/**
 * One mark size for the whole board. The name is set in that same size, and its
 * column takes only the width that size needs, so every metric column stays on screen.
 * `subtextHeight` is the taller of the lines under a mark; the size stops before that
 * line would leave the row.
 */
export function fitSharedSize(
  boardWidth: number,
  rowHeight: number,
  columns: number,
  fixedWidth: number,
  subtextHeight: number,
  nameAt: (size: number) => number,
  markAt: (size: number) => number
): { size: number; nameWidth: number } {
  const floor = 11;
  const cellPad = 8;
  const minCol = 36;
  const heightCap = rowHeight - subtextHeight - 8;
  const upper = Math.max(1, heightCap);
  const clampName = (size: number) => {
    const remain = boardWidth - fixedWidth;
    const markCol = markAt(size) + cellPad;
    const fair = remain - columns * Math.max(markCol, minCol);
    return Math.max(48, Math.min(nameAt(size), Math.max(48, fair)));
  };
  if (upper <= floor || columns <= 0 || boardWidth <= fixedWidth) {
    const size = Math.min(floor, upper);
    return { size, nameWidth: clampName(size) };
  }
  const fits = (size: number) => {
    const remain = boardWidth - fixedWidth - nameAt(size);
    if (remain <= 0) return false;
    const col = remain / columns;
    return col >= minCol && markAt(size) + cellPad <= col;
  };
  if (!fits(floor)) return { size: floor, nameWidth: clampName(floor) };
  let lo = floor;
  let hi = upper;
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const size = Math.round(Math.min(lo, upper) * 10) / 10;
  return { size, nameWidth: Math.ceil(nameAt(size)) };
}

export function pageItems(
  rows: BoardRow[],
  page: number,
  cutoffAfter: number | null,
  pageSize = PAGE_SIZE
): PageItem[] {
  const start = page * pageSize;
  const slice = rows.slice(start, start + pageSize);
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
  if (units === "lb") {
    const body = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${body}lb`;
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
const POINTS_COL = "2.75rem";

function columnTemplate(count: number, narrow: boolean): string {
  const name = "var(--name-col, 8rem)";
  const metric = narrow ? "minmax(4.75rem, 1fr)" : "minmax(0, 1fr)";
  return `${PLACE_COL} ${name} repeat(${count}, ${metric}) ${POINTS_COL}`;
}

const PIN_PLACE = "sticky left-0 z-10";
const PIN_NAME = "sticky left-[2.25rem] z-10 border-r border-border/80";

function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      <PageBackground />
      <div className="relative z-10 flex h-full min-w-0 flex-col px-3 pb-3 pt-14 sm:px-5 md:pt-3">{children}</div>
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

function QualifierIcon({ kind, className }: { kind: string; className: string }) {
  const mark = QUALIFIERS.find((item) => item.key === kind);
  if (!mark) return null;
  const shape =
    mark.key === "reactive" ? (
      <circle cx="6" cy="6" r="5" />
    ) : mark.key === "compliant" ? (
      <rect x="1" y="1" width="10" height="10" />
    ) : mark.key === "stiff" ? (
      <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" />
    ) : (
      <polygon points="6,1 11,11 1,11" />
    );
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      data-rsi-icon={mark.key}
      className={`shrink-0 fill-current ${mark.shape} ${className}`}
    >
      {shape}
    </svg>
  );
}

function QualifierLegend() {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-foreground">
      {QUALIFIERS.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <QualifierIcon kind={item.key} className="h-3 w-3" />
          {item.label}
        </span>
      ))}
    </p>
  );
}

function sublineCount(cell: BoardCell | undefined, key: string): number {
  if (!cell) return 0;
  return (cell.delta ? 1 : 0) + (key === "DRI" && cell.band ? 1 : 0);
}

function MarkCell({
  column,
  cell,
  qualifier,
  markFont,
}: {
  column: BoardColumn;
  cell: BoardCell | undefined;
  qualifier: string | null;
  markFont: string;
}) {
  const place = cell ? (cell.tied ? `T${cell.rank}` : String(cell.rank)) : "";
  const rsi = cell && column.key === "10-5_RSI" ? qualifierMark(qualifier) : null;
  const frame = cell ? podiumFrame(cell.rank) : "";
  const shown = cell ? formatMark(cell.value, column.units) : "";
  const suffix =
    column.units === "s" || column.units === "mph" || column.units === "%" || column.units === "lb"
      ? column.units
      : column.units === "in"
        ? "in."
        : "";
  const body = suffix && shown.endsWith(suffix) ? shown.slice(0, -suffix.length) : shown;
  const lines = sublineCount(cell, column.key);
  return (
    <div
      data-mark-cell
      className="relative flex h-full min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-0.5 text-center"
      style={{ fontSize: markFont }}
    >
      {frame ? <div className={`pointer-events-none absolute inset-x-0.5 inset-y-[5%] ${frame}`} /> : null}
      <div className="flex max-h-full min-w-0 max-w-full flex-col items-center justify-center gap-0.5 leading-none">
        {cell ? (
          <div className="flex max-w-full items-center justify-center gap-[0.15em] leading-none">
            {rsi ? <QualifierIcon kind={rsi.key} className="h-[0.55em] w-[0.55em]" /> : null}
            <span className="truncate font-mono font-bold tabular-nums leading-none" title={rsi?.label} data-mark={column.key}>
              {body}
              {suffix ? <span className="text-[0.45em] font-semibold">{suffix}</span> : null}
            </span>
            <span className="shrink-0 font-mono text-[0.4em] tabular-nums text-foreground-muted">{place}</span>
          </div>
        ) : (
          <span className="font-mono font-bold leading-none text-foreground-muted">—</span>
        )}
        {lines > 0 ? (
          <div className="flex w-full min-w-0 flex-col items-center gap-0.5 leading-none">
            {cell?.delta ? (
              <p
                className={`max-w-full truncate font-mono text-[11px] tabular-nums leading-none ${
                  cell.delta.improved ? "text-success" : "text-foreground-muted"
                }`}
                data-delta={column.key}
              >
                {formatDeltaLine(cell.delta.change, cell.delta.previous)}
              </p>
            ) : null}
            {cell && column.key === "DRI" && cell.band ? (
              <p
                className={`max-w-full truncate text-[11px] font-medium leading-none ${DRI_BAND_TEXT[cell.band] ?? "text-foreground-muted"}`}
                title={cell.band}
              >
                {cell.band}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AthleteRow({
  row,
  columns,
  template,
  markFont,
  nameLabel,
  scroll,
  nameRef,
}: {
  row: BoardRow;
  columns: BoardColumn[];
  template: string;
  markFont: string;
  nameLabel: string;
  scroll: boolean;
  nameRef?: Ref<HTMLSpanElement>;
}) {
  const { athlete, place, untested } = row;
  const name = `${athlete.first_name} ${athlete.last_name}`.trim() || "Athlete";
  const pinBg = untested
    ? "bg-[color-mix(in_srgb,var(--surface)_40%,var(--background))]"
    : "bg-[color-mix(in_srgb,var(--surface)_25%,var(--background))]";
  return (
    <div
      className={`grid w-full min-h-0 items-center border-b border-border/70 ${
        scroll ? "shrink-0 py-1.5" : "flex-1"
      } ${untested ? "bg-surface/40 text-foreground-muted" : "bg-surface/25"}`}
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
        ref={nameRef}
        className={`${PIN_NAME} ${pinBg} flex min-h-0 min-w-0 flex-col justify-center self-stretch overflow-hidden pl-1 pr-3`}
        title={name}
      >
        <span
          className="truncate font-semibold leading-none"
          style={{ fontSize: markFont }}
          data-athlete-name
        >
          {nameLabel}
        </span>
        <span
          className="shrink-0 truncate font-mono text-[11px] font-medium tabular-nums leading-none text-foreground-muted"
          data-athlete-bib
        >
          {athlete.bib ?? "—"}
        </span>
      </span>
      {columns.map((column) => (
        <MarkCell
          key={column.key}
          column={column}
          cell={athlete.cells[column.key]}
          qualifier={athlete.qualifier}
          markFont={markFont}
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
  coach = false,
}: {
  batteryId: string;
  initialSample?: boolean;
  coach?: boolean;
}) {
  const [view, setView] = useState<"today" | "day" | "meet">("today");
  const [dayKey, setDayKey] = useState("");
  const [group, setGroup] = useState("overall");
  const [paused, setPaused] = useState(false);
  const [rsqDetail, setRsqDetail] = useState(false);
  const onRsqDetail = useCallback((open: boolean) => {
    setRsqDetail(open);
  }, []);
  const [page, setPage] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [sample, setSample] = useState(initialSample);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState("");
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
  const { data, error, isLoading, mutate } = useSWR<BoardResponse>(url, fetchBoard, {
    refreshInterval: isVisible ? (sample ? 1000 : REFRESH_MS) : 0,
  });
  const fetched = data?.url === url ? data.data : undefined;
  const payload = !isLoading && fetched?.view === view ? fetched : undefined;
  const ordered = payload ? orderBoard(payload.athletes, payload.untested_ids) : [];
  const paging = !narrow && ordered.length > PAGE_SIZE;
  const pageCount = paging ? Math.ceil(ordered.length / PAGE_SIZE) : 1;
  const safePage = Math.min(page, pageCount - 1);
  if (pageScope !== scope) {
    setPageScope(scope);
    setPage(0);
  } else if (page !== safePage) {
    setPage(safePage);
  }
  const teamMode = payload?.battery.grouping_mode === "subteam";
  const cutoff = teamMode ? null : (payload?.battery.cutoff_n ?? null);
  const lineAfter = cutoffAfterIndex(ordered, cutoff);
  const refreshFailed = Boolean(payload && error);
  const rowListRef = useRef<HTMLDivElement>(null);
  const nameCellRef = useRef<HTMLSpanElement>(null);
  const items = paging
    ? pageItems(ordered, safePage, lineAfter)
    : pageItems(ordered, 0, lineAfter, Math.max(ordered.length, 1));
  const nameLabels = items.flatMap((item) =>
    item.kind === "row"
      ? [
          narrow
            ? shortName(item.row.athlete.first_name, item.row.athlete.last_name)
            : `${item.row.athlete.first_name} ${item.row.athlete.last_name}`.trim() || "Athlete",
        ]
      : []
  );
  const nameKey = nameLabels.join("|");
  const nameLabelsRef = useRef(nameLabels);
  nameLabelsRef.current = nameLabels;
  const fitColumns = payload?.columns ?? [];
  let subtextLines = 0;
  const markFits: { text: string; extraEm: number }[] = [];
  for (const item of items) {
    if (item.kind !== "row") continue;
    for (const column of fitColumns) {
      const cell = item.row.athlete.cells[column.key];
      subtextLines = Math.max(subtextLines, sublineCount(cell, column.key));
      if (!cell) continue;
      const icon = column.key === "10-5_RSI" && qualifierMark(item.row.athlete.qualifier) ? 0.75 : 0;
      markFits.push({ text: formatMark(cell.value, column.units), extraEm: 0.85 + icon });
    }
  }
  const fitRef = useRef({ names: nameLabels, marks: markFits, lines: subtextLines, columns: fitColumns.length });
  fitRef.current = { names: nameLabels, marks: markFits, lines: subtextLines, columns: fitColumns.length };
  const fitKey = `${nameKey}|${subtextLines}|${fitColumns.length}|${markFits.map((mark) => mark.text).join(",")}`;
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

  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    const cell = nameCellRef.current;
    const root = rowListRef.current;
    if (!cell || !root) return;
    const row = cell.closest("[data-board-row]") as HTMLElement | null;
    const apply = () => {
      const label = cell.querySelector("[data-athlete-name]");
      const nameStyles = getComputedStyle(label ?? cell);
      const nameFamily = nameStyles.fontFamily || "sans-serif";
      const canvas = document.createElement("canvas").getContext("2d");
      const measure = (text: string, size: number, weight: string, family: string) => {
        if (!canvas) return text.length * size * 0.55;
        canvas.font = `${weight} ${size}px ${family}`;
        return canvas.measureText(text).width;
      };
      if (narrow) {
        root.style.removeProperty("--mark-size");
        const size = Number.parseFloat(nameStyles.fontSize) || 16;
        let widest = 0;
        for (const text of fitRef.current.names) {
          widest = Math.max(widest, measure(text, size, "600", nameFamily));
        }
        const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const next = Math.min(Math.ceil(widest + 17), Math.round(9.5 * rootPx));
        root.style.setProperty("--name-col", `${Math.max(next, 1)}px`);
        return;
      }
      const rowHeight = row?.clientHeight ?? 0;
      const boardWidth = root.clientWidth;
      if (rowHeight < 8 || boardWidth < 8) return;
      const markEl = root.querySelector("[data-mark]");
      const markFamily = markEl ? getComputedStyle(markEl).fontFamily : "ui-monospace, monospace";
      const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const spec = fitRef.current;
      const subtext = spec.lines <= 0 ? 0 : 2 + spec.lines * 11 + Math.max(0, spec.lines - 1) * 2;
      const fitted = fitSharedSize(
        boardWidth - 4,
        rowHeight,
        spec.columns,
        (2.25 + 2.75) * rootPx,
        subtext,
        (size) => {
          let widest = 0;
          for (const text of spec.names) widest = Math.max(widest, measure(text, size, "600", nameFamily));
          return widest + 18;
        },
        (size) => {
          let widest = 0;
          for (const mark of spec.marks) {
            widest = Math.max(widest, measure(mark.text, size, "700", markFamily) + size * mark.extraEm);
          }
          return widest;
        }
      );
      root.style.setProperty("--name-col", `${Math.ceil(fitted.nameWidth)}px`);
      root.style.setProperty("--mark-size", `${fitted.size}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(root);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  }, [fitKey, narrow]);

  useEffect(() => {
    if (!paging || paused || rsqDetail || !isVisible) return;
    const count = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
    const timer = window.setInterval(() => {
      setPage((current) => (current + 1) % count);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paging, paused, rsqDetail, isVisible, ordered.length, scope]);

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
    paging ? `${safePage + 1}/${pageCount}` : null,
  ]
    .filter((part) => part != null)
    .join(" · ");

  const columns = payload.columns;
  const showRsiLegend = columns.some((column) => column.key === "10-5_RSI");
  const rsiByAthlete = new Map(payload.athletes.map((athlete) => [athlete.athlete_id, athlete.cells["10-5_RSI"]]));
  const rsqAthletes: RsqDot[] = payload.rsq.map((point) => {
    const cell = rsiByAthlete.get(point.athlete_id);
    return { ...point, rsi: cell?.value ?? null, rank: cell?.rank ?? null };
  });
  const template = columnTemplate(columns.length, narrow);
  const markFont = narrow ? "1.05rem" : "var(--mark-size, 1.5rem)";
  const dayLabel = payload.day_label.trim() || (payload.view === "meet" ? "Meet" : "Today");
  const showGroups = teamMode;

  async function onGroupingMode(next: "cutoff" | "subteam") {
    if (payload.battery.grouping_mode === next || modeBusy) return;
    setModeBusy(true);
    setModeError("");
    try {
      const response = await fetch(`/api/battery/${encodeURIComponent(batteryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grouping_mode: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setModeError(typeof json.error === "string" ? json.error : "Could not change the grouping");
        return;
      }
      if (next === "cutoff") setGroup("overall");
      await mutate();
    } catch {
      setModeError("Network error — try again");
    } finally {
      setModeBusy(false);
    }
  }
  const dataRowCount = items.filter((item) => item.kind === "row").length;

  return (
    <BoardFrame>
      <header className="mb-1 shrink-0">
        <div className="mb-1 h-0.5 w-10 rounded-full bg-accent" />
        <div className="flex flex-wrap items-end justify-between gap-2 md:pr-[19rem]">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.22em] text-foreground-muted">
              {payload.battery.title}
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">{dayLabel}</h1>
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
            {coach ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Grouping">
                <button
                  type="button"
                  disabled={modeBusy}
                  className={chipClass(!teamMode)}
                  onClick={() => void onGroupingMode("cutoff")}
                >
                  Top 18
                </button>
                <button
                  type="button"
                  disabled={modeBusy}
                  className={chipClass(teamMode)}
                  onClick={() => void onGroupingMode("subteam")}
                >
                  Teams
                </button>
              </div>
            ) : null}
            {modeError ? <p className="text-sm text-danger">{modeError}</p> : null}
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
        className={`min-h-0 min-w-0 flex-1 overscroll-contain ${narrow ? "overflow-auto" : "overflow-hidden"}`}
        data-row-count={dataRowCount}
        data-board-scroll={narrow ? "full" : "pages"}
        ref={rowListRef}
      >
        <div className={`flex min-w-full flex-col ${narrow ? "w-max" : "h-full w-full"}`}>
          <div
            className="grid w-full shrink-0 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-foreground-muted"
            style={{ gridTemplateColumns: template }}
          >
            <span className={`${PIN_PLACE} bg-background py-1 text-center`}>#</span>
            <span className={`${PIN_NAME} bg-background py-1 pl-1 pr-3`}>Athlete</span>
            {columns.map((column) =>
              column.key === "10-5_RSI" && rsqAthletes.length > 0 ? (
                <RsiChart
                  key={column.key}
                  label={column.label}
                  athletes={rsqAthletes}
                  onDetailChange={onRsqDetail}
                />
              ) : (
                <span key={column.key} className="truncate px-0 py-1 text-center md:px-0.5" title={column.label}>
                  {column.label}
                </span>
              )
            )}
            <span className="py-1 pr-1 text-center">Pts</span>
          </div>

          {items.length === 0 ? (
            <p className="px-1 py-6 text-sm text-foreground-muted">No athletes on this board yet.</p>
          ) : (
            items.map((item, index) => {
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
                  markFont={markFont}
                  scroll={narrow}
                  nameLabel={
                    narrow
                      ? shortName(item.row.athlete.first_name, item.row.athlete.last_name)
                      : `${item.row.athlete.first_name} ${item.row.athlete.last_name}`.trim() || "Athlete"
                  }
                  nameRef={index === items.findIndex((entry) => entry.kind === "row") ? nameCellRef : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </BoardFrame>
  );
}
