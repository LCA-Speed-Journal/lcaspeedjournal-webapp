import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";
import { orderBoard, type BoardRow } from "./board-order";
import {
  PODIUM_STROKE,
  RSQ,
  doorSheetAthleteName,
  doorSheetRankLabel,
  doorSheetTotalText,
  rsqIcon,
  rsqKey,
  type RsqKey,
} from "./door-sheet";
import type { BoardAthlete } from "./load";
import { metricTint, type MetricTint } from "./meet-columns";

const regularFont = path.join(process.cwd(), "public/fonts/Montserrat-Regular.ttf");
const boldFont = path.join(process.cwd(), "public/fonts/Montserrat-Bold.ttf");
const logoPath = path.join(process.cwd(), "public/branding/Logo_LCA_and_Pearson-Performance.png");
const fontFamily = existsSync(regularFont) && existsSync(boldFont) ? "Montserrat" : "Helvetica";
if (fontFamily === "Montserrat") {
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
  paddingTop: 16,
  paddingBottom: 16,
  paddingHorizontal: 16,
};

export function meetSheetFilename(hugoGroup: string): string {
  return hugoGroup === "womens_basketball"
    ? "girls-basketball-meet.pdf"
    : "boys-basketball-meet.pdf";
}

/** Title type size. The logo is 5% taller, and the header keeps extra room under that pair. */
export const meetSheetTitleSize = 16;

export const meetSheetLogo = {
  height: meetSheetTitleSize * 1.05,
  width: meetSheetTitleSize * 1.05 * 4,
};

const titleGap = 8 + (meetSheetLogo.height - meetSheetTitleSize);

export function meetSheetTitle(hugoGroup: string): string {
  const known = hugoGroup in HUGO_GROUP_META ? HUGO_GROUP_META[hugoGroup as HugoGroup].label : "";
  return known === "" ? "Baseline Testing Report" : `Baseline Testing Report: ${known}`;
}

const TINT_FILL: Record<MetricTint, string> = {
  power: "#f3e8ff",
  speed: "#dbeafe",
  repeat: "#dcfce7",
  throw: "#ffedd5",
  strength: "#fee2e2",
};

const TINT_LABEL: Record<MetricTint, string> = {
  power: "Lower-Power",
  speed: "Rate/Reactivity",
  repeat: "Capacity",
  throw: "Upper-Power",
  strength: "Strength",
};

const TINT_SWATCH: Record<MetricTint, string> = {
  power: "#c084fc",
  speed: "#60a5fa",
  repeat: "#4ade80",
  throw: "#fb923c",
  strength: "#f87171",
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
    fontFamily,
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: titleGap,
  },
  titles: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: meetSheetTitleSize,
    fontFamily,
    fontWeight: 700,
    lineHeight: 1,
    marginBottom: 4,
  },
  logo: {
    width: meetSheetLogo.width,
    height: meetSheetLogo.height,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  legendBreak: {
    width: "100%",
    height: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
    marginBottom: 2,
  },
  swatch: {
    width: 8,
    height: 8,
    marginRight: 3,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 7,
  },
  legendLabel: {
    fontSize: 7,
    fontFamily,
    fontWeight: 700,
    marginRight: 4,
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
    fontFamily,
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
    fontFamily,
    fontWeight: 700,
    fontSize: 7,
  },
  headerLabel: {
    fontFamily,
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
    backgroundColor: "#ffffff",
    borderWidth: 1.2,
    borderRadius: 2,
  },
  markRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily,
    fontWeight: 700,
    fontSize: 7,
    textAlign: "right",
  },
});

function columnFrame(key: string, rank: number | undefined): Record<string, string | number> {
  const backgroundColor = fillFor(key)?.backgroundColor ?? "#ffffff";
  const stroke = rank == null ? undefined : PODIUM_STROKE[rank];
  return {
    backgroundColor,
    borderColor: stroke ?? backgroundColor,
  };
}

function columnHeader(column: MeetSheetColumn): ReactNode {
  return createElement(
    View,
    { key: column.key, style: [styles.metric, columnFrame(column.key, undefined)] },
    createElement(Text, { style: styles.headerLabel }, column.label)
  );
}

function metricCell(
  column: MeetSheetColumn,
  cell: BoardAthlete["cells"][string] | undefined,
  qualifier: string | null
): ReactNode {
  const mark = cell ? formatMark(cell.value, column.units) : "—";
  const quadrant = column.key === "10-5_RSI" ? rsqKey(qualifier) : null;
  return createElement(
    View,
    {
      key: column.key,
      style: [styles.metric, columnFrame(column.key, cell?.rank)],
    },
    createElement(
      View,
      { style: styles.markRow },
      quadrant ? rsqIcon(quadrant, 6) : null,
      createElement(
        Text,
        {
          style: quadrant
            ? [styles.mark, { color: RSQ[quadrant].color, marginLeft: 2 }]
            : styles.mark,
        },
        mark
      )
    ),
    cell ? createElement(Text, { style: styles.rank }, doorSheetRankLabel(cell, true)) : null
  );
}

function legendItem(key: string, swatch: ReactNode, label: string): ReactNode {
  return createElement(
    View,
    { key, style: styles.legendItem },
    swatch,
    createElement(Text, { style: styles.legendText }, label)
  );
}

function sheetLegend(showRsq: boolean): ReactNode {
  const tints = (Object.keys(TINT_LABEL) as MetricTint[]).map((tint) =>
    legendItem(
      tint,
      createElement(View, { style: [styles.swatch, { backgroundColor: TINT_SWATCH[tint] }] }),
      TINT_LABEL[tint]
    )
  );
  const rsqLegend: Record<RsqKey, string> = {
    reactive: "Reactive (↑JH / ↓GCT)",
    compliant: "Compliant (↑JH / ↑GCT)",
    stiff: "Stiff (↓JH / ↓GCT)",
    developing: "Developing (↓JH / ↑GCT)",
  };
  const marks = showRsq
    ? (Object.keys(RSQ) as RsqKey[]).map((kind) =>
        legendItem(kind, rsqIcon(kind, 7), rsqLegend[kind])
      )
    : [];
  return createElement(
    View,
    { style: styles.legend },
    createElement(Text, { style: styles.legendLabel }, "Column Categories:"),
    ...tints,
    showRsq ? createElement(View, { style: styles.legendBreak }) : null,
    showRsq ? createElement(Text, { style: styles.legendLabel }, "||") : null,
    showRsq ? createElement(Text, { style: styles.legendLabel }, "RSQ") : null,
    ...marks
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
            ...data.columns.map((column) =>
              metricCell(column, row.athlete.cells[column.key], row.athlete.qualifier)
            ),
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
      createElement(
        View,
        { style: styles.header },
        createElement(
          View,
          { style: styles.titles },
          createElement(Text, { style: styles.title }, data.title),
          sheetLegend(data.columns.some((column) => column.key === "10-5_RSI"))
        ),
        existsSync(logoPath)
          ? createElement(Image, {
              src: `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`,
              style: styles.logo,
            })
          : null
      ),
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
