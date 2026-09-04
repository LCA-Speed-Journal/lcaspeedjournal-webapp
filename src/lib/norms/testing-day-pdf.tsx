import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { forPublicLeaderboard } from "@/lib/norms/leaderboard-zones";
import {
  formatPlace,
  fmtPoints,
  TOTAL_COLUMN_KEY,
} from "@/lib/norms/testing-day-rank";
import type {
  TestingDayBoardData,
  TestingDayGroup,
  TestingDayMatrixAthlete,
  TestingDayMatrixCell,
  TestingDayMatrixColumn,
} from "@/lib/norms/testing-day";
import type { F2fProfile, F2fVertex } from "@/lib/norms/f2f/types";
import { f2fChipLabel } from "@/lib/norms/f2f/labels";
import { themeMixLines } from "@/lib/norms/f2f/themes";
import {
  HUGO_GROUP_META,
  isHugoGroup,
} from "@/lib/weight-room/constants";

export type TestingDayPdfAudience = "coach" | "athlete";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  h1: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  muted: {
    color: "#333333",
    marginBottom: 2,
    fontSize: 9,
  },
  empty: {
    marginTop: 18,
    fontSize: 12,
  },
  table: {
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    paddingVertical: 3,
    alignItems: "flex-start",
  },
  th: {
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 4,
    marginTop: 4,
  },
  athleteCol: {
    width: "20%",
    paddingRight: 4,
  },
  cellCol: {
    paddingHorizontal: 2,
  },
  cellMark: {
    fontFamily: "Helvetica",
  },
  cellPlace: {
    color: "#555555",
    fontSize: 7,
  },
  cellZone: {
    color: "#333333",
    fontSize: 7,
  },
  athleteName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  athleteMeta: {
    color: "#555555",
    fontSize: 7,
  },
  testBlock: {
    marginTop: 10,
  },
  testTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  groupLine: {
    marginBottom: 2,
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 8,
    color: "#666666",
  },
  f2fBlock: {
    marginTop: 10,
  },
  f2fTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  f2fNote: {
    marginBottom: 2,
    fontSize: 8,
  },
  f2fTable: {
    marginTop: 4,
  },
  f2fNameCol: {
    width: "20%",
    paddingRight: 2,
  },
  f2fPrimaryCol: {
    width: "12%",
    paddingHorizontal: 1,
  },
  f2fFlagsCol: {
    width: "16%",
    paddingHorizontal: 1,
  },
  f2fNumCol: {
    width: "13%",
    paddingHorizontal: 1,
  },
});

function fmtMark(value: number, units: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return units ? `${n} ${units}` : n;
}

function sportLabel(sport: string | null): string {
  if (sport == null) return "No primary sport";
  if (isHugoGroup(sport)) return HUGO_GROUP_META[sport].label;
  return sport;
}

function genderLabel(gender: string | null): string {
  if (gender === "M") return "M";
  if (gender === "F") return "F";
  return "Unknown";
}

function isTotalColumn(column: TestingDayMatrixColumn): boolean {
  return column.kind === "total" || column.key === TOTAL_COLUMN_KEY;
}

function athleteDisplayName(athlete: TestingDayMatrixAthlete): string {
  const name = `${athlete.first_name} ${athlete.last_name}`.trim();
  return name || "Unknown athlete";
}

function cellWidth(columnCount: number): string {
  if (columnCount <= 0) return "80%";
  return `${80 / columnCount}%`;
}

function fmtForty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function fmtPredictedForty(vertex: F2fVertex | null | undefined): string {
  if (!vertex) return "—";
  const mark = fmtForty(vertex.predicted_40);
  return vertex.projected ? `${mark}*` : mark;
}

function f2fPrimaryLabel(profile: F2fProfile | undefined): string {
  if (!profile?.eligible_for_labels || profile.primary == null) return "—";
  return f2fChipLabel(profile.primary);
}

function f2fFlagsLabel(profile: F2fProfile | undefined): string {
  if (!profile?.eligible_for_labels) return "—";
  const flags = profile.flags.filter((flag) => flag !== profile.primary);
  if (flags.length === 0) return "—";
  return flags.map((flag) => f2fChipLabel(flag)).join(" · ");
}

export function boardForAudience(
  board: TestingDayBoardData,
  audience: TestingDayPdfAudience
): TestingDayBoardData {
  if (audience === "coach") return board;
  return {
    ...board,
    tests: [],
    f2f_themes: undefined,
    matrix: {
      ...board.matrix,
      athletes: board.matrix.athletes.map((athlete) => ({
        ...athlete,
        cells: Object.fromEntries(
          Object.entries(athlete.cells).map(([key, cell]) => [
            key,
            forPublicLeaderboard(cell),
          ])
        ),
      })),
    },
  };
}

export function testingDayPdfFilename(
  sessionDate: string,
  audience: TestingDayPdfAudience
): string {
  return `testing-day-${sessionDate}-${audience}.pdf`;
}

function MatrixCellText({
  cell,
  column,
}: {
  cell: TestingDayMatrixCell | undefined;
  column: TestingDayMatrixColumn;
}) {
  if (!cell) {
    return <Text style={styles.cellMark}>—</Text>;
  }
  if (isTotalColumn(column)) {
    return <Text style={styles.cellMark}>{fmtPoints(cell.display_value)}</Text>;
  }
  return (
    <View>
      <Text style={styles.cellMark}>{fmtMark(cell.display_value, column.units)}</Text>
      {cell.rank != null ? (
        <Text style={styles.cellPlace}>
          {formatPlace(cell.rank, Boolean(cell.tied))}
        </Text>
      ) : null}
      {cell.zone_label ? (
        <Text style={styles.cellZone}>{cell.zone_label}</Text>
      ) : null}
    </View>
  );
}

function CoachSummaries({ board }: { board: TestingDayBoardData }) {
  if (board.tests.length === 0) return null;
  return (
    <View>
      {board.tests.map((test) => (
        <View key={test.column_key} style={styles.testBlock} wrap={false}>
          <Text style={styles.testTitle}>
            {test.metric_display_name}
            {test.component ? ` · ${test.component}` : ""}
          </Text>
          {test.groups.length === 0 ? (
            <Text style={styles.groupLine}>No groups</Text>
          ) : (
            test.groups.map((group, i) => (
              <CoachGroupLine
                key={`${test.column_key}-${group.sport}-${group.gender}-${i}`}
                group={group}
                units={test.units}
              />
            ))
          )}
        </View>
      ))}
    </View>
  );
}

function CoachGroupLine({
  group,
  units,
}: {
  group: TestingDayGroup;
  units: string;
}) {
  const counts = group.label_counts
    .map((c) => `${c.label} ${c.count}`)
    .join(" · ");
  const unbadged =
    group.unbadged.length > 0
      ? ` · unbadged: ${group.unbadged
          .map((a) => `${a.first_name} ${a.last_name} (${fmtMark(a.display_value, units)})`)
          .join(", ")}`
      : "";
  const standard = group.has_standard
    ? `${counts ? `${counts} · ` : ""}Efficient+ ${group.efficient_plus}${unbadged}`
    : `No standard${unbadged}`;
  return (
    <Text style={styles.groupLine}>
      {sportLabel(group.sport)} · {genderLabel(group.gender)} · n={group.headcount} ·{" "}
      {standard}
    </Text>
  );
}

function CoachF2fMixLines({ theme }: { theme: Parameters<typeof themeMixLines>[0] }) {
  return (
    <>
      {themeMixLines(theme).map((line) => (
        <Text key={line.label} style={styles.f2fNote}>
          {line.label}: {line.text}
        </Text>
      ))}
    </>
  );
}

function CoachF2fBlock({ board }: { board: TestingDayBoardData }) {
  const themes = board.f2f_themes;
  if (!themes) return null;

  return (
    <View style={styles.f2fBlock}>
      <Text style={styles.f2fTitle}>Force-to-Form</Text>
      <Text style={styles.f2fNote}>Session · {themes.session.note}</Text>
      <CoachF2fMixLines theme={themes.session} />
      {themes.groups.map((group) => (
        <View key={`${group.sport ?? ""}|${group.gender ?? ""}`}>
          <Text style={styles.f2fNote}>
            {sportLabel(group.sport)} · {genderLabel(group.gender)} · {group.note}
          </Text>
          <CoachF2fMixLines theme={group} />
        </View>
      ))}
      <View style={styles.f2fTable}>
        <View style={[styles.row, styles.th]}>
          <Text style={styles.f2fNameCol}>Name</Text>
          <Text style={styles.f2fPrimaryCol}>Primary</Text>
          <Text style={styles.f2fFlagsCol}>Flags</Text>
          <Text style={styles.f2fNumCol}>Ref 40</Text>
          <Text style={styles.f2fNumCol}>Explosion</Text>
          <Text style={styles.f2fNumCol}>Force</Text>
          <Text style={styles.f2fNumCol}>Form</Text>
        </View>
        {board.matrix.athletes.map((athlete) => (
          <View key={athlete.athlete_id} style={styles.row} wrap={false}>
            <Text style={styles.f2fNameCol}>{athleteDisplayName(athlete)}</Text>
            <Text style={styles.f2fPrimaryCol}>
              {f2fPrimaryLabel(athlete.f2f)}
            </Text>
            <Text style={styles.f2fFlagsCol}>{f2fFlagsLabel(athlete.f2f)}</Text>
            <Text style={styles.f2fNumCol}>
              {fmtForty(athlete.f2f?.reference_40)}
            </Text>
            <Text style={styles.f2fNumCol}>
              {fmtPredictedForty(athlete.f2f?.explosion)}
            </Text>
            <Text style={styles.f2fNumCol}>
              {fmtPredictedForty(athlete.f2f?.force)}
            </Text>
            <Text style={styles.f2fNumCol}>
              {fmtPredictedForty(athlete.f2f?.form)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function TestingDayReportDocument({
  board,
  audience,
}: {
  board: TestingDayBoardData;
  audience: TestingDayPdfAudience;
}) {
  const empty = board.matrix.athletes.length === 0;
  const columns = board.matrix.columns;
  const colWidth = cellWidth(columns.length);
  const audienceLabel = audience === "coach" ? "Coach" : "Athlete";

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.h1}>Testing-day summary</Text>
        <Text style={styles.muted}>{board.session_date}</Text>
        {board.phase ? <Text style={styles.muted}>{board.phase}</Text> : null}
        <Text style={styles.muted}>{audienceLabel}</Text>
        {empty ? (
          <Text style={styles.empty}>No entries for this session.</Text>
        ) : (
          <View style={styles.table}>
            <View style={[styles.row, styles.th]}>
              <Text style={styles.athleteCol}>Athlete</Text>
              {columns.map((column) => (
                <Text
                  key={column.key}
                  style={[styles.cellCol, { width: colWidth }]}
                >
                  {column.display_name}
                </Text>
              ))}
            </View>
            {board.matrix.athletes.map((athlete) => (
              <View key={athlete.athlete_id} style={styles.row} wrap={false}>
                <View style={styles.athleteCol}>
                  <Text style={styles.athleteName}>
                    {athleteDisplayName(athlete)}
                  </Text>
                  <Text style={styles.athleteMeta}>
                    {sportLabel(athlete.sport)} · {genderLabel(athlete.gender)}
                  </Text>
                </View>
                {columns.map((column) => (
                  <View
                    key={column.key}
                    style={[styles.cellCol, { width: colWidth }]}
                  >
                    <MatrixCellText
                      cell={athlete.cells[column.key]}
                      column={column}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
        {audience === "coach" ? <CoachSummaries board={board} /> : null}
        {audience === "coach" ? <CoachF2fBlock board={board} /> : null}
        <Text style={styles.footer}>
          LCA Speed Journal — testing-day report
        </Text>
      </Page>
    </Document>
  );
}

export async function renderTestingDayPdf(opts: {
  board: TestingDayBoardData;
  audience: TestingDayPdfAudience;
}): Promise<Buffer> {
  const board = boardForAudience(opts.board, opts.audience);
  const element = (
    <TestingDayReportDocument board={board} audience={opts.audience} />
  );
  return renderToBuffer(
    element as unknown as Parameters<typeof renderToBuffer>[0]
  );
}
