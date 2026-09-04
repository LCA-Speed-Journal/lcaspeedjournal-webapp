import {
  Document,
  Page,
  Path,
  Svg,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
  TWENTY_YD_DASH,
} from "@/lib/norms/editor-metrics";
import { forPublicLeaderboard } from "@/lib/norms/leaderboard-zones";
import { isLiveLeaderboardZone } from "@/lib/norms/palette";
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
import type { F2fQuality, F2fVertex } from "@/lib/norms/f2f/types";
import { f2fChipLabel } from "@/lib/norms/f2f/labels";
import { themeGroupKey, type F2fThemeSummary } from "@/lib/norms/f2f/themes";
import {
  athleteSubline,
  formatPdfDate,
  formatPdfGrade,
  groupAthletesBySection,
  sectionHeading,
  sectionRanks,
  sectionSubhead,
  type TestingDayPdfSection,
} from "@/lib/norms/testing-day-pdf-layout";
import {
  F2F_DEFICIENCY_BG,
  F2F_FOCUS_COLORS,
  F2F_PIE_COLORS,
  F2F_STRENGTH_BG,
  f2fFocusBadge,
  f2fPieSlices,
  f2fStrengthDeficiency,
  pieSlicePath,
  type F2fPaint,
} from "@/lib/norms/testing-day-pdf-f2f";
import { PdfF2fTriangle } from "@/lib/norms/testing-day-pdf-triangle";
import {
  HUGO_GROUP_META,
  isHugoGroup,
} from "@/lib/weight-room/constants";

const F2F_TABLE_QUALITIES: F2fQuality[] = ["explosion", "force", "form"];

const F2F_TABLE_LABELS: Record<F2fQuality, string> = {
  explosion: "Explosion",
  force: "Force",
  form: "Form",
};

export type TestingDayPdfAudience = "coach" | "athlete";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
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
  zoneBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 1,
    borderRadius: 2,
  },
  zoneBadgeText: {
    color: "#ffffff",
    fontSize: 6,
  },
  focusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 1,
    borderRadius: 2,
  },
  focusBadgeText: {
    color: "#ffffff",
    fontSize: 6,
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
  f2fTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  f2fNote: {
    marginBottom: 3,
    fontSize: 9,
  },
  f2fPieRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  f2fLegend: {
    marginLeft: 12,
  },
  f2fLegendLine: {
    fontSize: 8,
    marginBottom: 3,
  },
  f2fCardRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  f2fCard: {
    width: "32%",
    marginRight: "2%",
    borderWidth: 0.5,
    borderColor: "#cccccc",
    padding: 6,
    borderRadius: 3,
  },
  f2fCardName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginBottom: 2,
  },
  f2fCardChip: {
    fontSize: 7,
    color: "#333333",
    marginBottom: 3,
  },
  f2fCardStat: {
    fontSize: 7,
    color: "#333333",
    marginTop: 1,
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

function boardSprintFlags(columns: TestingDayMatrixColumn[]): {
  has40: boolean;
  has20: boolean;
} {
  const scoring = columns.filter((column) => (column.kind ?? "test") !== "total");
  return {
    has40: scoring.some(
      (column) =>
        column.metric_key === FORTY_YD_DASH &&
        column.component === FORTY_YD_PRIMARY_COMPONENT
    ),
    has20: scoring.some((column) => column.metric_key === TWENTY_YD_DASH),
  };
}

function f2fPaintBackground(paint: F2fPaint): string | undefined {
  if (paint === "strength") return F2F_STRENGTH_BG;
  if (paint === "deficiency") return F2F_DEFICIENCY_BG;
  return undefined;
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

function chunkAthletes<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function matchingThemeGroup(
  board: TestingDayBoardData,
  section: TestingDayPdfSection
): F2fThemeSummary | undefined {
  const sectionKey = themeGroupKey(section.sport, section.gender);
  return board.f2f_themes?.groups.find(
    (group) => themeGroupKey(group.sport, group.gender) === sectionKey
  );
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
      <ZoneLabelText cell={cell} />
    </View>
  );
}

function ZoneLabelText({ cell }: { cell: TestingDayMatrixCell }) {
  if (!cell.zone_label) return null;
  if (isLiveLeaderboardZone(cell.zone_label)) {
    return (
      <View
        style={[
          styles.zoneBadge,
          cell.zone_color ? { backgroundColor: cell.zone_color } : null,
        ]}
      >
        <Text style={styles.zoneBadgeText}>{cell.zone_label}</Text>
      </View>
    );
  }
  return <Text style={styles.cellZone}>{cell.zone_label}</Text>;
}

function F2fMainCell({
  vertex,
  paint,
  width,
}: {
  vertex: F2fVertex | null | undefined;
  paint: F2fPaint;
  width: string;
}) {
  const backgroundColor = f2fPaintBackground(paint);
  return (
    <View
      style={[
        styles.cellCol,
        { width },
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      <Text style={styles.cellMark}>{fmtPredictedForty(vertex)}</Text>
    </View>
  );
}

function CoachSummaries({
  board,
  section,
}: {
  board: TestingDayBoardData;
  section: TestingDayPdfSection;
}) {
  if (board.tests.length === 0) return null;
  const sectionKey = themeGroupKey(section.sport, section.gender);
  return (
    <View>
      {board.tests.map((test) => {
        const groups = test.groups.filter(
          (group) => themeGroupKey(group.sport, group.gender) === sectionKey
        );
        return (
          <View key={test.column_key} style={styles.testBlock} wrap={false}>
            <Text style={styles.testTitle}>
              {test.metric_display_name}
              {test.component ? ` · ${test.component}` : ""}
            </Text>
            {groups.length === 0 ? (
              <Text style={styles.groupLine}>No groups</Text>
            ) : (
              groups.map((group, i) => (
                <CoachGroupLine
                  key={`${test.column_key}-${group.sport}-${group.gender}-${i}`}
                  group={group}
                  units={test.units}
                />
              ))
            )}
          </View>
        );
      })}
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

const PIE_CX = 40;
const PIE_CY = 40;
const PIE_R = 32;

function CoachF2fPie({ group }: { group: F2fThemeSummary }) {
  const slices = f2fPieSlices(group.mix, group.eligible_count);
  if (slices.length === 0) return null;
  let cursor = 0;
  return (
    <View style={styles.f2fPieRow}>
      <Svg width={80} height={80} viewBox="0 0 80 80">
        {slices.map((slice) => {
          const startFrac = cursor / group.eligible_count;
          cursor += slice.count;
          const endFrac = cursor / group.eligible_count;
          return (
            <Path
              key={slice.key}
              d={pieSlicePath(PIE_CX, PIE_CY, PIE_R, startFrac, endFrac)}
              fill={F2F_PIE_COLORS[slice.key]}
            />
          );
        })}
      </Svg>
      <View style={styles.f2fLegend}>
        {slices.map((slice) => (
          <Text key={slice.key} style={styles.f2fLegendLine}>
            {slice.label} {slice.count} ({slice.percent}%)
          </Text>
        ))}
      </View>
    </View>
  );
}

function CoachF2fCard({ athlete }: { athlete: TestingDayMatrixAthlete }) {
  const profile = athlete.f2f;
  const chip =
    profile?.eligible_for_labels && profile.primary != null
      ? f2fChipLabel(profile.primary)
      : null;
  return (
    <View style={styles.f2fCard} wrap={false}>
      <Text style={styles.f2fCardName}>{athleteDisplayName(athlete)}</Text>
      {chip ? <Text style={styles.f2fCardChip}>{chip}</Text> : null}
      {profile ? <PdfF2fTriangle profile={profile} /> : null}
      <Text style={styles.f2fCardStat}>Ref 40 {fmtForty(profile?.reference_40)}</Text>
      <Text style={styles.f2fCardStat}>
        Explosion {fmtPredictedForty(profile?.explosion)}
      </Text>
      <Text style={styles.f2fCardStat}>
        Force {fmtPredictedForty(profile?.force)}
      </Text>
      <Text style={styles.f2fCardStat}>
        Form {fmtPredictedForty(profile?.form)}
      </Text>
    </View>
  );
}

function CoachF2fPage({
  board,
  section,
}: {
  board: TestingDayBoardData;
  section: TestingDayPdfSection;
}) {
  const group = matchingThemeGroup(board, section);
  const cards = chunkAthletes(section.athletes.slice(0, 6), 3);
  const emptyLabels = !group || group.eligible_count === 0;
  return (
    <View>
      <Text style={styles.f2fTitle}>Force-to-Form</Text>
      {group?.generated_note ? (
        <Text style={styles.f2fNote}>{group.generated_note}</Text>
      ) : null}
      {group?.note ? <Text style={styles.f2fNote}>{group.note}</Text> : null}
      {emptyLabels ? (
        <Text style={styles.f2fNote}>No Force-to-Form labels yet.</Text>
      ) : (
        <CoachF2fPie group={group} />
      )}
      {cards.map((row) => (
        <View
          key={row.map((athlete) => athlete.athlete_id).join("-")}
          style={styles.f2fCardRow}
        >
          {row.map((athlete) => (
            <CoachF2fCard key={athlete.athlete_id} athlete={athlete} />
          ))}
        </View>
      ))}
    </View>
  );
}

function SectionMatrix({
  board,
  section,
  audience,
  now,
}: {
  board: TestingDayBoardData;
  section: TestingDayPdfSection;
  audience: TestingDayPdfAudience;
  now: Date;
}) {
  const columns = board.matrix.columns;
  const showF2f = audience === "coach";
  const colWidth = cellWidth(columns.length + (showF2f ? F2F_TABLE_QUALITIES.length : 0));
  const { has40, has20 } = boardSprintFlags(columns);
  const ranks = sectionRanks(section.athletes, has40, has20);
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.th]}>
        <Text style={styles.athleteCol}>Athlete</Text>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.cellCol, { width: colWidth }]}>
            {column.display_name}
          </Text>
        ))}
        {showF2f
          ? F2F_TABLE_QUALITIES.map((quality) => (
              <Text key={quality} style={[styles.cellCol, { width: colWidth }]}>
                {F2F_TABLE_LABELS[quality]}
              </Text>
            ))
          : null}
      </View>
      {section.athletes.map((athlete) => {
        const place = ranks.get(athlete.athlete_id);
        const grade = formatPdfGrade(athlete.graduating_class ?? null, now);
        const paints = athlete.f2f ? f2fStrengthDeficiency(athlete.f2f) : null;
        const badge =
          audience === "athlete" && athlete.gender === "M"
            ? f2fFocusBadge(athlete.f2f)
            : null;
        return (
          <View key={athlete.athlete_id} style={styles.row} wrap={false}>
            <View style={styles.athleteCol}>
              <Text style={styles.athleteName}>
                {athleteDisplayName(athlete)}
              </Text>
              {place ? (
                <Text style={styles.athleteMeta}>
                  {athleteSubline(place, grade)}
                </Text>
              ) : null}
              {badge ? (
                <View
                  style={[
                    styles.focusBadge,
                    { backgroundColor: F2F_FOCUS_COLORS[badge.tone] },
                  ]}
                >
                  <Text style={styles.focusBadgeText}>{badge.text}</Text>
                </View>
              ) : null}
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
            {showF2f
              ? F2F_TABLE_QUALITIES.map((quality) => (
                  <F2fMainCell
                    key={quality}
                    vertex={athlete.f2f?.[quality]}
                    paint={paints?.[quality] ?? null}
                    width={colWidth}
                  />
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

export function TestingDayReportDocument({
  board,
  audience,
  now = new Date(),
}: {
  board: TestingDayBoardData;
  audience: TestingDayPdfAudience;
  now?: Date;
}) {
  const sections = groupAthletesBySection(board.matrix.athletes);

  if (sections.length === 0) {
    return (
      <Document>
        <Page size="LETTER" style={styles.page} wrap>
          <Text style={styles.h1}>Testing Day: {formatPdfDate(board.session_date)}</Text>
          <Text style={styles.empty}>No entries for this session.</Text>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      {sections.flatMap((section) => {
        const key = themeGroupKey(section.sport, section.gender);
        const pages = [
          <Page key={key} size="LETTER" style={styles.page} wrap>
            <Text style={styles.h1}>
              {sectionHeading(section.sport, section.gender)}
            </Text>
            <Text style={styles.muted}>
              {sectionSubhead(board.session_date, section.athletes.length)}
            </Text>
            <SectionMatrix
              board={board}
              section={section}
              audience={audience}
              now={now}
            />
            {audience === "coach" ? (
              <CoachSummaries board={board} section={section} />
            ) : null}
          </Page>,
        ];
        if (audience === "coach") {
          pages.push(
            <Page key={`${key}-f2f`} size="LETTER" style={styles.page} wrap>
              <CoachF2fPage board={board} section={section} />
            </Page>
          );
        }
        return pages;
      })}
    </Document>
  );
}

export async function renderTestingDayPdf(opts: {
  board: TestingDayBoardData;
  audience: TestingDayPdfAudience;
  now?: Date;
}): Promise<Buffer> {
  const board = boardForAudience(opts.board, opts.audience);
  const element = (
    <TestingDayReportDocument
      board={board}
      audience={opts.audience}
      now={opts.now}
    />
  );
  return renderToBuffer(
    element as unknown as Parameters<typeof renderToBuffer>[0]
  );
}
