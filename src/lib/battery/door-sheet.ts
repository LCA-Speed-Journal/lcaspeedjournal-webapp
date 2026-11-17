import { createElement, type ReactNode } from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { orderBoard } from "./board-order";
import type { BoardAthlete } from "./load";

export const DAY_A_DOOR_COLUMNS = [
  "10yd_Split",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "10-5_RSI",
  "DRI",
] as const;

export function doorSheetColumnKeys(dayKey: string, boardColumnKeys: readonly string[]): string[] {
  if (dayKey === "A") return [...DAY_A_DOOR_COLUMNS];
  return [...boardColumnKeys];
}

export function doorSheetAthletes(athletes: BoardAthlete[], columnKeys: readonly string[]) {
  const printed = athletes.filter((athlete) =>
    columnKeys.some((key) => athlete.cells[key] != null)
  );
  return orderBoard(printed, []).filter((row) => row.place != null);
}

type DoorSheetCell = BoardAthlete["cells"][string];

export type DoorSheetData = {
  title: string;
  dayLabel: string;
  driBox: string | null;
  columns: { key: string; label: string; units: string }[];
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

const PODIUM: Record<number, { backgroundColor: string; borderColor: string }> = {
  1: { backgroundColor: "#fef3c7", borderColor: "#c9a227" },
  2: { backgroundColor: "#f3f4f6", borderColor: "#6b7280" },
  3: { backgroundColor: "#ffedd5", borderColor: "#b45309" },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  h1: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  day: {
    fontSize: 11,
    marginBottom: 2,
  },
  dri: {
    fontSize: 9,
    marginBottom: 8,
    color: "#333333",
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
    paddingVertical: 3,
  },
  placeText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
  },
  name: {
    width: 132,
    justifyContent: "center",
    paddingVertical: 3,
    paddingRight: 4,
  },
  nameText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  headerLabel: {
    fontFamily: "Helvetica-Bold",
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
    paddingVertical: 2,
    paddingHorizontal: 1,
    marginHorizontal: 1,
  },
  mark: {
    fontSize: 8,
    textAlign: "center",
  },
  rank: {
    fontSize: 7,
    textAlign: "center",
    color: "#333333",
    marginTop: 1,
  },
  points: {
    width: 32,
    justifyContent: "center",
    paddingVertical: 3,
  },
  pointsText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "right",
  },
});

function rankLabel(cell: DoorSheetCell): string {
  return cell.tied ? `T${cell.rank}` : String(cell.rank);
}

function metricCell(column: DoorSheetData["columns"][number], cell: DoorSheetCell | undefined): ReactNode {
  const podium = cell ? PODIUM[cell.rank] : undefined;
  return createElement(
    View,
    {
      key: column.key,
      style: podium ? [styles.metric, { ...podium, borderWidth: 1 }] : styles.metric,
    },
    createElement(Text, { style: styles.mark }, cell ? formatMark(cell.value, column.units) : "—"),
    cell ? createElement(Text, { style: styles.rank }, rankLabel(cell)) : null
  );
}

function columnHeader(column: DoorSheetData["columns"][number]): ReactNode {
  const showUnits = column.units !== "" && column.units !== column.label;
  return createElement(
    View,
    { key: column.key, style: styles.metric },
    createElement(Text, { style: styles.headerLabel }, column.label),
    showUnits ? createElement(Text, { style: styles.headerUnits }, column.units) : null
  );
}

function DoorSheetDocument({ data }: { data: DoorSheetData }) {
  const driLine =
    data.columns.some((column) => column.key === "DRI") && data.driBox != null
      ? `DRI @ ${data.driBox} in`
      : null;
  const header = createElement(
    View,
    null,
    createElement(Text, { style: styles.h1 }, data.title),
    createElement(Text, { style: driLine ? styles.day : [styles.day, { marginBottom: 8 }] }, data.dayLabel),
    driLine ? createElement(Text, { style: styles.dri }, driLine) : null
  );
  const columnHead = createElement(
    View,
    { style: styles.headerRow },
    createElement(View, { style: styles.place }, createElement(Text, { style: styles.headerLabel }, "#")),
    createElement(View, { style: styles.name }, createElement(Text, { style: styles.headerLabel }, "Athlete")),
    ...data.columns.map((column) => columnHeader(column)),
    createElement(View, { style: styles.points }, createElement(Text, { style: styles.headerLabel }, "Pts"))
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
              createElement(Text, { style: styles.nameText }, `${row.athlete.last_name}, ${row.athlete.first_name}`)
            ),
            ...data.columns.map((column) => metricCell(column, row.athlete.cells[column.key])),
            createElement(
              View,
              { style: styles.points },
              createElement(Text, { style: styles.pointsText }, formatPoints(row.athlete.total_points))
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
