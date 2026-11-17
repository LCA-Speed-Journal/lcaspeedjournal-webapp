"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import useSWR from "swr";
import { FreshnessStamp, useQuietRefresh } from "@/app/components/FreshnessStamp";
import { PageBackground } from "@/app/components/PageBackground";
import { orderBoard, type BoardRow } from "@/lib/battery/board-order";
import {
  formatStrengthPounds,
  isStrengthPoundDay,
  orderByStrengthPounds,
  strengthPounds,
} from "@/lib/battery/strength-rank";
import { DRI_BOXES } from "@/lib/battery/dri";
import type { BoardCell, BoardColumn, BoardPayload } from "@/lib/battery/load";
import { RsiChart } from "./RsiChart";
import type { RsqDot } from "./RsqPlot";

export { orderBoard };

export function ranksByStrengthPounds(view: string, columnKeys: readonly string[]): boolean {
  return view !== "meet" && isStrengthPoundDay(columnKeys);
}

const ATHLETES_PER_PAGE = 10;

export function boardPageCount(athleteCount: number): number {
  if (athleteCount <= 0) return 1;
  return Math.ceil(athleteCount / ATHLETES_PER_PAGE);
}

export function boardPageSpan(athleteCount: number, page: number): { start: number; size: number } {
  const pages = boardPageCount(athleteCount);
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  if (athleteCount <= 0) return { start: 0, size: 0 };
  const base = Math.floor(athleteCount / pages);
  const extra = athleteCount % pages;
  let start = 0;
  for (let index = 0; index < safePage; index++) {
    start += base + (index < extra ? 1 : 0);
  }
  return { start, size: base + (safePage < extra ? 1 : 0) };
}

const ADVANCE_MS = 10000;

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

/**
 * One size for every line under a mark. It stays at 11px until the widest line
 * would clip, then shrinks so that line still fits `width`.
 */
export function fitSubtextSize(
  labels: string[],
  width: number,
  measure: (label: string, size: number) => number
): number {
  const ceiling = 11;
  const usable = labels.map((label) => label.trim()).filter((label) => label.length > 0);
  if (width <= 0 || usable.length === 0) return ceiling;
  const widest = usable.reduce((best, label) => (measure(label, ceiling) > measure(best, ceiling) ? label : best));
  if (measure(widest, ceiling) <= width) return ceiling;
  let size = ceiling;
  while (size > 6 && measure(widest, size) > width) size -= 0.5;
  return Math.round(size * 10) / 10;
}

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
  const nameLimit = boardWidth * 0.3;
  const heightCap = rowHeight - subtextHeight - 8;
  const upper = Math.max(1, heightCap);
  const clampName = (size: number) => {
    const remain = boardWidth - fixedWidth;
    const markCol = markAt(size) + cellPad;
    const fair = remain - columns * Math.max(markCol, minCol);
    return Math.max(48, Math.min(nameAt(size), nameLimit, Math.max(48, fair)));
  };
  if (upper <= floor || columns <= 0 || boardWidth <= fixedWidth) {
    const size = Math.min(floor, upper);
    return { size, nameWidth: clampName(size) };
  }
  const fits = (size: number) => {
    if (nameAt(size) > nameLimit) return false;
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
  return { size, nameWidth: Math.min(Math.ceil(nameAt(size)), Math.floor(nameLimit)) };
}

export function pageItems(
  rows: BoardRow[],
  page: number,
  cutoffAfter: number | null,
  pageSize?: number
): PageItem[] {
  const span =
    pageSize == null
      ? boardPageSpan(rows.length, page)
      : { start: page * pageSize, size: pageSize };
  const slice = rows.slice(span.start, span.start + span.size);
  const items: PageItem[] = [];
  let inUntested = false;
  slice.forEach((row, index) => {
    if (row.untested && (index === 0 || !inUntested)) {
      items.push({ kind: "untested" });
      inUntested = true;
    }
    items.push({ kind: "row", row });
    if (cutoffAfter != null && span.start + index === cutoffAfter) {
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

/** List column: "Jax T." The paged board still shows the full name. */
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
const PHONE_NAME_COL = "6rem";
const PHONE_METRIC_COL = "4.75rem";

export function phoneColumnTemplate(count: number): string {
  return `${PLACE_COL} ${PHONE_NAME_COL} repeat(${count}, ${PHONE_METRIC_COL}) ${POINTS_COL}`;
}

export function phoneGridWidth(count: number): string {
  const rem = 2.25 + 6 + count * 4.75 + 2.75;
  return `${rem}rem`;
}

function columnTemplate(count: number, narrow: boolean): string {
  if (narrow) return phoneColumnTemplate(count);
  const name = "var(--name-col, 8rem)";
  const metric = "minmax(0, 1fr)";
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

/**
 * One outline for every podium cell. Width is the column minus a fixed gutter.
 * Height is the tallest mark stack plus a fixed clearance, and the cell is
 * locked to that height so the stroke stays around the subtext.
 */
export function podiumBox(
  columnWidth: number,
  contentHeight: number
): { width: number; height: number; cellHeight: number } {
  const gutter = 6;
  const clearance = 8;
  const height = Math.ceil(Math.max(0, contentHeight) + clearance * 2);
  const width = Math.max(0, Math.floor(columnWidth - gutter * 2));
  return { width, height, cellHeight: height + gutter * 2 };
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
  scroll,
  lockFrame = false,
}: {
  column: BoardColumn;
  cell: BoardCell | undefined;
  qualifier: string | null;
  markFont: string;
  scroll: boolean;
  lockFrame?: boolean;
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
      className={`relative flex min-w-0 items-center justify-center px-0.5 text-center ${
        scroll ? "h-auto" : "h-full min-h-0 self-stretch overflow-hidden"
      }`}
      style={{
        fontSize: markFont,
        minHeight: lockFrame ? "var(--podium-cell)" : undefined,
      }}
    >
      {frame && !scroll ? (
        <div className={`pointer-events-none absolute inset-x-0.5 inset-y-[5%] ${frame}`} />
      ) : null}
      {frame && lockFrame ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${frame}`}
          style={{ width: "var(--podium-w)", height: "var(--podium-h)" }}
        />
      ) : null}
      <div
        data-mark-stack
        className={`relative flex min-w-0 max-w-full flex-col items-center justify-center gap-0.5 leading-none ${
          frame && scroll && !lockFrame ? `px-1 py-1 ${frame}` : ""
        }`}
      >
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
                className={`max-w-full whitespace-nowrap font-mono tabular-nums leading-none ${
                  cell.delta.improved ? "text-success" : "text-foreground-muted"
                }`}
                style={{ fontSize: "var(--subtext-size, 11px)" }}
                data-delta={column.key}
                data-subtext
              >
                {formatDeltaLine(cell.delta.change, cell.delta.previous)}
              </p>
            ) : null}
            {cell && column.key === "DRI" && cell.band ? (
              <p
                className={`max-w-full whitespace-nowrap font-medium leading-none ${DRI_BAND_TEXT[cell.band] ?? "text-foreground-muted"}`}
                style={{ fontSize: "var(--subtext-size, 11px)" }}
                title={cell.band}
                data-subtext
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
  lockFrame = false,
  totalText,
}: {
  row: BoardRow;
  columns: BoardColumn[];
  template: string;
  markFont: string;
  nameLabel: string;
  scroll: boolean;
  nameRef?: Ref<HTMLSpanElement>;
  lockFrame?: boolean;
  totalText: string;
}) {
  const { athlete, place, untested } = row;
  const name = `${athlete.first_name} ${athlete.last_name}`.trim() || "Athlete";
  const pinBg = untested
    ? "bg-[color-mix(in_srgb,var(--surface)_40%,var(--background))]"
    : "bg-[color-mix(in_srgb,var(--surface)_25%,var(--background))]";
  return (
    <div
      className={`grid h-auto w-full items-center border-b border-border/70 ${
        scroll ? "shrink-0 py-1" : "min-h-0 flex-1"
      } ${
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
          className="shrink-0 whitespace-nowrap font-mono font-medium tabular-nums leading-none text-foreground-muted"
          style={{ fontSize: "var(--subtext-size, 11px)" }}
          data-athlete-bib
          data-subtext
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
          scroll={scroll}
          lockFrame={lockFrame}
        />
      ))}
      <span className="pr-1 text-center font-mono text-[13px] font-semibold tabular-nums md:text-sm">
        {totalText}
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
  const [reviewList, setReviewList] = useState(false);
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
  const [boardSignature, setBoardSignature] = useState<string | null>(null);
  const quiet = useQuietRefresh(boardSignature);
  const { data, error, isLoading, mutate } = useSWR<BoardResponse>(url, fetchBoard, {
    refreshInterval: isVisible ? quiet.refreshInterval : 0,
  });
  const fetched = data?.url === url ? data.data : undefined;
  const payload = !isLoading && fetched?.view === view ? fetched : undefined;
  const strengthDay =
    payload != null &&
    ranksByStrengthPounds(payload.view, payload.columns.map((column) => column.key));
  const ordered = !payload
    ? []
    : strengthDay
      ? orderByStrengthPounds(payload.athletes, payload.untested_ids)
      : orderBoard(payload.athletes, payload.untested_ids);
  const paging = !narrow && !reviewList && ordered.length > ATHLETES_PER_PAGE;
  const listMode = narrow || reviewList;
  const pageCount = paging ? boardPageCount(ordered.length) : 1;
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
  const items = listMode
    ? pageItems(ordered, 0, lineAfter, Math.max(ordered.length, 1))
    : pageItems(ordered, safePage, lineAfter);
  const nameLabels = items.flatMap((item) =>
    item.kind === "row"
      ? [
          listMode
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
  const subtextLabels: string[] = [];
  for (const item of items) {
    if (item.kind !== "row") continue;
    const bib = item.row.athlete.bib?.trim();
    if (bib) subtextLabels.push(bib);
    for (const column of fitColumns) {
      const cell = item.row.athlete.cells[column.key];
      if (!cell) continue;
      if (cell.delta) subtextLabels.push(formatDeltaLine(cell.delta.change, cell.delta.previous));
      if (column.key === "DRI" && cell.band) subtextLabels.push(cell.band);
    }
  }
  const fitRef = useRef({
    names: nameLabels,
    marks: markFits,
    lines: subtextLines,
    columns: fitColumns.length,
    subtexts: subtextLabels,
  });
  fitRef.current = {
    names: nameLabels,
    marks: markFits,
    lines: subtextLines,
    columns: fitColumns.length,
    subtexts: subtextLabels,
  };
  const fitKey = `${nameKey}|${subtextLines}|${fitColumns.length}|${markFits.map((mark) => mark.text).join(",")}|${subtextLabels.join(",")}`;
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
  const nextSignature = payload ? `${scope}|${motionKey}` : null;
  if (nextSignature !== boardSignature) setBoardSignature(nextSignature);

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
      const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const boardWidth = root.clientWidth;
      const markEl = root.querySelector("[data-mark]");
      const markFamily = markEl ? getComputedStyle(markEl).fontFamily : "ui-monospace, monospace";
      if (narrow) {
        const column = 4.75 * rootPx - 8;
        const subtext = fitSubtextSize(fitRef.current.subtexts, column, (text, size) =>
          Math.max(
            measure(text, size, "500", nameFamily),
            measure(text, size, "500", "ui-monospace, monospace")
          )
        );
        root.style.setProperty("--subtext-size", `${subtext}px`);
      } else {
        root.style.removeProperty("--subtext-size");
      }
      if (listMode) {
        if (narrow) {
          root.style.removeProperty("--mark-size");
          root.style.removeProperty("--name-col");
          root.style.removeProperty("--podium-w");
          root.style.removeProperty("--podium-h");
          root.style.removeProperty("--podium-cell");
          return;
        }
        const spec = fitRef.current;
        const fitted = fitSharedSize(
          boardWidth - 4,
          56,
          spec.columns,
          (2.25 + 2.75) * rootPx,
          spec.lines <= 0 ? 0 : 2 + spec.lines * 11 + Math.max(0, spec.lines - 1) * 2,
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
        let contentHeight = 0;
        let columnWidth = Number.POSITIVE_INFINITY;
        root.querySelectorAll<HTMLElement>("[data-mark-stack]").forEach((stack) => {
          contentHeight = Math.max(contentHeight, stack.getBoundingClientRect().height);
          const cell = stack.closest("[data-mark-cell]");
          if (cell) columnWidth = Math.min(columnWidth, cell.getBoundingClientRect().width);
        });
        if (contentHeight > 0 && Number.isFinite(columnWidth)) {
          const box = podiumBox(columnWidth, contentHeight);
          root.style.setProperty("--podium-w", `${box.width}px`);
          root.style.setProperty("--podium-h", `${box.height}px`);
          root.style.setProperty("--podium-cell", `${box.cellHeight}px`);
        }
        return;
      }
      root.style.removeProperty("--podium-w");
      root.style.removeProperty("--podium-h");
      root.style.removeProperty("--podium-cell");
      const rowHeight = row?.clientHeight ?? 0;
      if (rowHeight < 8 || boardWidth < 8) return;
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
  }, [fitKey, narrow, reviewList]);

  useEffect(() => {
    if (!paging || paused || rsqDetail || !isVisible) return;
    const count = boardPageCount(ordered.length);
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
    if (!payload || payload.battery.grouping_mode === next || modeBusy) return;
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

  async function onDriBox(next: string) {
    if (!payload || modeBusy) return;
    const current = payload.battery.team_dri_box ?? "12";
    if (next === current) return;
    setModeBusy(true);
    setModeError("");
    try {
      const response = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/dri-box`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ box: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setModeError(typeof json.error === "string" ? json.error : "Network error — try again");
        return;
      }
      await mutate();
    } catch {
      setModeError("Network error — try again");
    } finally {
      setModeBusy(false);
    }
  }

  const dataRowCount = items.filter((item) => item.kind === "row").length;
  const showDriBox = columns.some((column) => column.key === "DRI");

  function onRefresh() {
    quiet.resume();
    void mutate();
  }

  return (
    <BoardFrame>
      <div className="absolute right-3 top-14 z-20 md:top-3">
        <FreshnessStamp updatedAt={quiet.updatedAt} polling={quiet.polling} onRefresh={onRefresh} />
      </div>
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
              <>
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
                {showDriBox ? (
                  <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
                    DRI
                    <select
                      aria-label="Scored DRI height"
                      value={payload.battery.team_dri_box ?? "12"}
                      disabled={modeBusy}
                      onChange={(event) => void onDriBox(event.target.value)}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground focus:border-accent disabled:opacity-60"
                    >
                      {DRI_BOXES.map((box) => (
                        <option key={box} value={box}>
                          {box} in
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {payload.day_key ? (
                  <a
                    href={`/api/battery/${encodeURIComponent(batteryId)}/door-sheet?day=${encodeURIComponent(payload.day_key)}&group=${encodeURIComponent(group)}`}
                    className={chipClass(false)}
                  >
                    Print day
                  </a>
                ) : null}
              </>
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
            {narrow ? null : (
              <button
                type="button"
                aria-pressed={reviewList}
                onClick={() => {
                  setReviewList((current) => !current);
                  setPage(0);
                }}
                className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-sm uppercase tracking-wider text-foreground hover:border-accent/50"
              >
                {reviewList ? "List" : "Pages"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        className={`min-h-0 min-w-0 flex-1 overscroll-contain ${listMode ? "overflow-auto" : "overflow-hidden"}`}
        data-row-count={dataRowCount}
        data-board-scroll={listMode ? "full" : "pages"}
        ref={rowListRef}
      >
        <div
          className={`flex min-w-full flex-col ${narrow ? "" : listMode ? "w-full" : "h-full w-full"}`}
          style={narrow ? { width: phoneGridWidth(columns.length) } : undefined}
        >
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
            <span className="py-1 pr-1 text-center">{strengthDay ? "Lb" : "Pts"}</span>
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
                  scroll={listMode}
                  lockFrame={listMode && !narrow}
                  totalText={
                    strengthDay
                      ? item.row.place == null
                        ? "—"
                        : formatStrengthPounds(strengthPounds(item.row.athlete) ?? 0)
                      : formatPoints(item.row.athlete.total_points)
                  }
                  nameLabel={
                    listMode
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
