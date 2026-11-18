import { existsSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { orderBoard, type BoardRow } from "./board-order";
import {
  doorSheetAthleteName,
  doorSheetRankLabel,
  doorSheetTotalText,
} from "./door-sheet";
import type { BoardAthlete } from "./load";
import { metricTint, type MetricTint } from "./meet-columns";

const regularFont = path.join(process.cwd(), "public/fonts/Montserrat-Regular.ttf");
const boldFont = path.join(process.cwd(), "public/fonts/Montserrat-Bold.ttf");
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

export const meetSheetPage = {
  size: "LETTER" as const,
  orientation: "landscape" as const,
  paddingTop: 12,
  paddingBottom: 12,
  paddingHorizontal: 12,
};

export function meetSheetFilename(hugoGroup: string): string {
  return hugoGroup === "womens_basketball"
    ? "girls-basketball-meet.pdf"
    : "boys-basketball-meet.pdf";
}

const TINT_FILL: Record<MetricTint, string> = {
  power: "#f3e8ff",
  speed: "#dbeafe",
  repeat: "#dcfce7",
  throw: "#ffedd5",
  strength: "#fee2e2",
};

export type MeetSheetColumn = {
  key: string;
  label: string;
  units: string;
};

export type MeetSheetData = {
  title: string;
  columns: MeetSheetColumn[];
  rows: BoardAthlete[];
};

/** Same rounding as the door sheet. Sprint stays in seconds; RSI and DRI stay two decimals. */
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

function printedRows(athletes: BoardAthlete[], columnKeys: readonly string[]): BoardRow[] {
  const printed = athletes.filter((athlete) =>
    columnKeys.some((key) => athlete.cells[key] != null)
  );
  return orderBoard(printed, []);
}

function fillFor(key: string): { backgroundColor: string } | null {
  const tint = metricTint(key);
  if (!tint) return null;
  return { backgroundColor: TINT_FILL[tint] };
}

const styles = StyleSheet.create({
  page: {
    paddingTop: meetSheetPage.paddingTop,
    paddingBottom: meetSheetPage.paddingBottom,
    paddingHorizontal: meetSheetPage.paddingHorizontal,
    fontSize: 7,
    fontFamily: "Montserrat",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 11,
    fontFamily: "Montserrat",
    fontWeight: 700,
    marginBottom: 4,
  },
  empty: {
    marginTop: 8,
    fontSize: 9,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 2,
    marginBottom: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 0.4,
    borderBottomColor: "#d1d5db",
  },
  place: {
    width: 18,
    justifyContent: "center",
    paddingVertical: 2,
    backgroundColor: "#ffffff",
  },
  placeText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 7,
    textAlign: "center",
  },
  name: {
    width: 108,
    justifyContent: "center",
    paddingVertical: 2,
    paddingRight: 3,
    backgroundColor: "#ffffff",
  },
  nameText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 7,
  },
  headerLabel: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 6,
    textAlign: "center",
  },
  metric: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    paddingHorizontal: 1,
    marginHorizontal: 0.5,
    backgroundColor: "#ffffff",
  },
  mark: {
    fontSize: 7,
    textAlign: "center",
  },
  rank: {
    fontSize: 5.5,
    textAlign: "center",
    color: "#111111",
    marginTop: 0.5,
  },
  points: {
    width: 26,
    justifyContent: "center",
    paddingVertical: 2,
    backgroundColor: "#ffffff",
  },
  pointsText: {
    fontFamily: "Montserrat",
    fontWeight: 700,
    fontSize: 7,
    textAlign: "right",
  },
});

function columnHeader(column: MeetSheetColumn): ReactNode {
  const fill = fillFor(column.key);
  return createElement(
    View,
    { key: column.key, style: fill ? [styles.metric, fill] : styles.metric },
    createElement(Text, { style: styles.headerLabel }, column.label)
  );
}

function metricCell(column: MeetSheetColumn, cell: BoardAthlete["cells"][string] | undefined): ReactNode {
  const fill = fillFor(column.key);
  const mark = cell ? formatMark(cell.value, column.units) : "—";
  return createElement(
    View,
    { key: column.key, style: fill ? [styles.metric, fill] : styles.metric },
    createElement(Text, { style: styles.mark }, mark),
    cell ? createElement(Text, { style: styles.rank }, doorSheetRankLabel(cell, true)) : null
  );
}

function MeetSheetDocument({
  data,
  rows,
}: {
  data: MeetSheetData;
  rows: BoardRow[];
}) {
  const columnKeys = data.columns.map((column) => column.key);
  const columnHead = createElement(
    View,
    { style: styles.headerRow },
    createElement(View, { style: styles.place }, createElement(Text, { style: styles.headerLabel }, "#")),
    createElement(View, { style: styles.name }, createElement(Text, { style: styles.headerLabel }, "Athlete")),
    ...data.columns.map((column) => columnHeader(column)),
    createElement(View, { style: styles.points }, createElement(Text, { style: styles.headerLabel }, "Pts"))
  );
  const body =
    rows.length === 0
      ? createElement(Text, { style: styles.empty }, "No athletes with marks for this meet.")
      : rows.map((row) =>
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
            ...data.columns.map((column) => metricCell(column, row.athlete.cells[column.key])),
            createElement(
              View,
              { style: styles.points },
              createElement(
                Text,
                { style: styles.pointsText },
                doorSheetTotalText(columnKeys, row.athlete)
              )
            )
          )
        );

  return createElement(
    Document,
    { title: data.title },
    createElement(
      Page,
      {
        size: meetSheetPage.size,
        orientation: meetSheetPage.orientation,
        style: styles.page,
      },
      createElement(Text, { style: styles.title }, data.title),
      createElement(View, null, columnHead, body)
    )
  );
}

export async function renderMeetSheet(data: MeetSheetData): Promise<Buffer> {
  const columnKeys = data.columns.map((column) => column.key);
  const rows = printedRows(data.rows, columnKeys);
  const element = createElement(MeetSheetDocument, { data, rows });
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
