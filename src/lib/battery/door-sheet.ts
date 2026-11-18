import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import {
  Circle,
  Document,
  Font,
  Image,
  Page,
  Polygon,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { orderBoard } from "./board-order";
import type { BoardAthlete } from "./load";
import {
  formatStrengthPounds,
  isStrengthPoundDay,
  orderByStrengthPounds,
  strengthPounds,
} from "./strength-rank";

const regularFont = path.join(process.cwd(), "public/fonts/Montserrat-Regular.ttf");
const boldFont = path.join(process.cwd(), "public/fonts/Montserrat-Bold.ttf");
const logoPath = path.join(process.cwd(), "public/branding/Logo_LCA_and_Pearson-Performance.png");
if (existsSync(regularFont) && existsSync(boldFont)) {
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: regularFont, fontWeight: 400 },
      { src: boldFont, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

export const DAY_A_DOOR_COLUMNS = [
  "10yd_Split",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "10-5_RSI",
  "DRI",
] as const;

const DAY_A_LABELS: Record<string, { label: string; units: string }> = {
  "10yd_Split": { label: "0-10", units: "s" },
  "20yd_Dash": { label: "0-20", units: "s" },
  "40yd_Dash": { label: "0-40", units: "s" },
  MaxVelocity: { label: "Max V", units: "mph" },
  "10-5_RSI": { label: "RSI", units: "RSI" },
  DRI: { label: "DRI", units: "DRI" },
};

const UNSCORED_KEYS = new Set(["10yd_Split"]);

const BOYS_DAY_A_BOARD = new Set([
  "10yd_Split",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "10-5_RSI",
  "DRI",
]);

export type DoorSheetColumn = {
  key: string;
  label: string;
  units: string;
  scored: boolean;
};

export function doorSheetColumnKeys(dayKey: string, boardColumnKeys: readonly string[]): string[] {
  const boysDay =
    dayKey === "A" && boardColumnKeys.every((key) => BOYS_DAY_A_BOARD.has(key));
  if (boysDay) return [...DAY_A_DOOR_COLUMNS];
  return [...boardColumnKeys];
}

export function doorSheetColumns(
  dayKey: string,
  boardColumns: readonly { key: string; label: string; units: string }[],
  driBox: string | null
): DoorSheetColumn[] {
  const byKey = new Map(boardColumns.map((column) => [column.key, column]));
  const columnKeys = doorSheetColumnKeys(
    dayKey,
    boardColumns.map((column) => column.key)
  );
  const boysDoorLabels =
    dayKey === "A" &&
    (columnKeys.includes("10yd_Split") ||
      columnKeys.every((key) => BOYS_DAY_A_BOARD.has(key)));
  return columnKeys.map((key) => {
    const fixed = boysDoorLabels ? DAY_A_LABELS[key] : undefined;
    const board = byKey.get(key);
    const box = driBox?.trim() ?? "";
    const scored = !UNSCORED_KEYS.has(key);
    const base = key === "DRI" && box !== "" ? `DRI-${box}` : (fixed?.label ?? board?.label ?? key);
    return {
      key,
      label: scored ? base : `${base}*`,
      units: fixed?.units ?? board?.units ?? "",
      scored,
    };
  });
}

export function doorSheetAthleteName(athlete: {
  first_name: string;
  last_name: string;
  bib: string | null;
}): string {
  const name = `${athlete.last_name}, ${athlete.first_name}`.trim();
  if (!athlete.bib) return name || "Athlete";
  return `${name} (${athlete.bib})`;
}

export function doorSheetRankLabel(
  cell: { rank: number; tied: boolean; points: number },
  scored: boolean
): string {
  const rank = cell.tied ? `T${cell.rank}` : String(cell.rank);
  if (!scored || cell.rank >= 9) return rank;
  const points = Number.isInteger(cell.points) ? String(cell.points) : cell.points.toFixed(1);
  return `${rank} - ${points}pts`;
}

export const DOOR_SHEET_TITLE = "Liberty Boys Basketball: Baseline Testing Assessment";

export function doorSheetDayHeading(dayKey: string, dayLabel: string): string {
  return `Day ${dayKey}: ${dayLabel.trim()}`;
}

export function doorSheetAthletes(athletes: BoardAthlete[], columnKeys: readonly string[]) {
  const printed = athletes.filter((athlete) =>
    columnKeys.some((key) => athlete.cells[key] != null)
  );
  const ordered = isStrengthPoundDay(columnKeys)
    ? orderByStrengthPounds(printed, [])
    : orderBoard(printed, []);
  return ordered.filter((row) => row.place != null);
}

type DoorSheetCell = BoardAthlete["cells"][string];

export type DoorSheetData = {
  title: string;
  dayLabel: string;
  columns: DoorSheetColumn[];
  rows: ReturnType<typeof doorSheetAthletes>;
};

/** Same rounding as the board's mark formatter. Sprint stays in seconds; RSI and DRI stay two decimals. */
function formatFeetInches(feet: number): string {
  const totalInches = Math.round(Math.abs(feet) * 12);
  const whole = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const sign = feet < 0 ? "-" : "";
  return `${sign}${whole}'${inches}"`;
}

function formatMark(value: number, units: string): string {
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

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function doorSheetTotalHeader(columnKeys: readonly string[]): "Lb" | "Pts" {
  return isStrengthPoundDay(columnKeys) ? "Lb" : "Pts";
}

export function doorSheetTotalText(columnKeys: readonly string[], athlete: BoardAthlete): string {
  if (isStrengthPoundDay(columnKeys)) {
    return formatStrengthPounds(strengthPounds(athlete) ?? 0);
  }
  return formatPoints(athlete.total_points);
}

export const PODIUM_STROKE: Record<number, string> = {
  1: "#c9a227",
  2: "#6b7280",
  3: "#b45309",
};

export const RSQ = {
  reactive: { label: "Reactive", color: "#2563eb" },
  compliant: { label: "Compliant", color: "#dc2626" },
  stiff: { label: "Stiff", color: "#16a34a" },
  developing: { label: "Developing", color: "#f97316" },
} as const;

export type RsqKey = keyof typeof RSQ;

export function rsqKey(qualifier: string | null): RsqKey | null {
  if (!qualifier) return null;
  const key = qualifier.trim().toLowerCase();
  return key in RSQ ? (key as RsqKey) : null;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Montserrat",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  titles: {
    width: 390,
  },
  logo: {
    width: 156,
    height: 39,
    marginTop: 1,
  },
  h1: {
    fontSize: 16,
    fontFamily: "Montserrat",
    fontWeight: 700,
    marginBottom: 2,
  },
  day: {
    fontSize: 13,
    fontFamily: "Montserrat",
    fontWeight: 700,
    marginBottom: 2,
  },
  empty: {
    marginTop: 10,
    fontSize: 10,
  },
  table: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 0.4,
    borderBottomColor: "#d1d5db",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 3,
    marginBottom: 1,
  },
  place: {
    width: 26,
    justifyContent: "center",
    paddingVertical: 4,
  },
  placeText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 8,
    textAlign: "center",
  },
  name: {
    width: 156,
    justifyContent: "center",
    paddingVertical: 4,
    paddingRight: 4,
  },
  nameText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 8,
  },
  headerLabel: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 7,
    textAlign: "center",
  },
  headerUnits: {
    fontSize: 6,
    textAlign: "center",
    color: "#333333",
  },
  metric: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    paddingHorizontal: 1,
    marginHorizontal: 1,
  },
  mark: {
    fontSize: 8,
    textAlign: "center",
  },
  markRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  rank: {
    fontSize: 6.5,
    textAlign: "center",
    color: "#111111",
    marginTop: 1,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  legendText: {
    fontSize: 7,
    marginLeft: 3,
  },
  points: {
    width: 32,
    justifyContent: "center",
    paddingVertical: 4,
  },
  pointsText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 8,
    textAlign: "right",
  },
});

function rsqShape(kind: RsqKey): ReactNode {
  const color = RSQ[kind].color;
  if (kind === "reactive") return createElement(Circle, { cx: 4, cy: 4, r: 3.1, fill: color });
  if (kind === "compliant") return createElement(Rect, { x: 1, y: 1, width: 6, height: 6, fill: color });
  if (kind === "stiff") {
    return createElement(Polygon, { points: "4,0.4 7.6,4 4,7.6 0.4,4", fill: color });
  }
  return createElement(Polygon, { points: "4,0.5 7.5,7.4 0.5,7.4", fill: color });
}

export function rsqIcon(kind: RsqKey, size = 8): ReactNode {
  return createElement(Svg, { width: size, height: size, viewBox: "0 0 8 8" }, rsqShape(kind));
}

function metricCell(
  column: DoorSheetColumn,
  cell: DoorSheetCell | undefined,
  qualifier: string | null
): ReactNode {
  const stroke = cell ? PODIUM_STROKE[cell.rank] : undefined;
  const rsq = column.key === "10-5_RSI" ? rsqKey(qualifier) : null;
  const mark = cell ? formatMark(cell.value, column.units) : "—";
  return createElement(
    View,
    {
      key: column.key,
      style: stroke
        ? [styles.metric, { borderWidth: 1.2, borderColor: stroke, borderRadius: 2 }]
        : styles.metric,
    },
    createElement(
      View,
      { style: styles.markRow },
      rsq ? rsqIcon(rsq) : null,
      createElement(
        Text,
        { style: rsq ? [styles.mark, { color: RSQ[rsq].color, marginLeft: 2 }] : styles.mark },
        mark
      )
    ),
    cell ? createElement(Text, { style: styles.rank }, doorSheetRankLabel(cell, column.scored)) : null
  );
}

function columnHeader(column: DoorSheetColumn): ReactNode {
  const showUnits = column.units !== "" && !column.label.startsWith(column.units);
  return createElement(
    View,
    { key: column.key, style: styles.metric },
    createElement(Text, { style: styles.headerLabel }, column.label),
    showUnits ? createElement(Text, { style: styles.headerUnits }, column.units) : null
  );
}

function keyLine(showRsq: boolean, showNote: boolean): ReactNode {
  return createElement(
    View,
    { style: styles.legend },
    showRsq
      ? (Object.keys(RSQ) as RsqKey[]).map((kind) =>
          createElement(
            View,
            { key: kind, style: styles.legendItem },
            rsqIcon(kind),
            createElement(Text, { style: [styles.legendText, { color: RSQ[kind].color }] }, RSQ[kind].label)
          )
        )
      : null,
    showNote
      ? createElement(Text, { style: styles.legendText }, "*: non-scored, component metric.")
      : null
  );
}

function DoorSheetDocument({ data }: { data: DoorSheetData }) {
  const showRsq = data.columns.some((column) => column.key === "10-5_RSI");
  const showNote = data.columns.some((column) => !column.scored);
  const header = createElement(
    View,
    null,
    createElement(
      View,
      { style: styles.header },
      createElement(
        View,
        { style: styles.titles },
        createElement(Text, { style: styles.h1 }, data.title.replace(": ", ":\n")),
        createElement(Text, { style: styles.day }, data.dayLabel)
      ),
      existsSync(logoPath)
        ? createElement(Image, {
            src: `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`,
            style: styles.logo,
          })
        : null
    ),
    showRsq || showNote ? keyLine(showRsq, showNote) : null
  );
  const columnHead = createElement(
    View,
    { style: styles.headerRow },
    createElement(View, { style: styles.place }, createElement(Text, { style: styles.headerLabel }, "#")),
    createElement(View, { style: styles.name }, createElement(Text, { style: styles.headerLabel }, "Athlete")),
    ...data.columns.map((column) => columnHeader(column)),
    createElement(
      View,
      { style: styles.points },
      createElement(
        Text,
        { style: styles.headerLabel },
        doorSheetTotalHeader(data.columns.map((column) => column.key))
      )
    )
  );
  const body =
    data.rows.length === 0
      ? createElement(Text, { style: styles.empty }, "No athletes with marks for this day.")
      : data.rows.map((row) =>
          createElement(
            View,
            { key: row.athlete.athlete_id, style: styles.row, wrap: false },
            createElement(
              View,
              { style: styles.place },
              createElement(Text, { style: styles.placeText }, row.place == null ? "—" : String(row.place))
            ),
            createElement(
              View,
              { style: styles.name },
              createElement(Text, { style: styles.nameText }, doorSheetAthleteName(row.athlete))
            ),
            ...data.columns.map((column) =>
              metricCell(column, row.athlete.cells[column.key], row.athlete.qualifier)
            ),
            createElement(
              View,
              { style: styles.points },
              createElement(
                Text,
                { style: styles.pointsText },
                doorSheetTotalText(
                  data.columns.map((column) => column.key),
                  row.athlete
                )
              )
            )
          )
        );

  return createElement(
    Document,
    { title: data.title },
    createElement(
      Page,
      { size: "LETTER", orientation: "portrait", style: styles.page },
      header,
      createElement(View, { style: styles.table }, columnHead, body)
    )
  );
}

export function doorSheetFilename(dayKey: string): string {
  return `boys-basketball-day-${dayKey.toLowerCase()}.pdf`;
}

export async function renderDoorSheet(data: DoorSheetData): Promise<Buffer> {
  const element = createElement(DoorSheetDocument, { data });
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
