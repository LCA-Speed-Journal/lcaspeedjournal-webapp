import {
  Document,
  Page,
  Path,
  Svg,
  Text,
  TextInput,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  FORTY_YD_DASH,
  FORTY_YD_PRIMARY_COMPONENT,
  TWENTY_YD_DASH,
  TWENTY_YD_PRIMARY_COMPONENT,
} from "@/lib/norms/editor-metrics";
import { forPublicLeaderboard } from "@/lib/norms/leaderboard-zones";
import {
  formatPlace,
  fmtPoints,
  TOTAL_COLUMN_KEY,
} from "@/lib/norms/testing-day-rank";
import type {
  TestingDayBoardData,
  TestingDayMatrixAthlete,
  TestingDayMatrixCell,
  TestingDayMatrixColumn,
} from "@/lib/norms/testing-day";
import type { F2fVertex } from "@/lib/norms/f2f/types";
import { f2fChipLabel, f2fShowsPredicted40s } from "@/lib/norms/f2f/labels";
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
  PDF_F2F_QUALITY_LABELS,
  ZONE_ABBREV_LEGEND,
  coachF2fPdfNote,
  f2fCardHeading,
  f2fCardSprintSubline,
  fmtPdfTableMark,
  f2fFocusBadge,
  f2fPieSlices,
  f2fStrengthDeficiency,
  pdfCoachF2fCopy,
  pieSlicePath,
  zoneAbbrev,
  type F2fPaint,
} from "@/lib/norms/testing-day-pdf-f2f";
import {
  F2F_CARD_TRIANGLE_SIZE,
  PdfF2fTriangle,
} from "@/lib/norms/testing-day-pdf-triangle";

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
    paddingVertical: 1.5,
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
  athleteCellMark: {
    fontFamily: "Helvetica",
    fontSize: 7,
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
  f2fTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
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
    padding: 5,
    borderRadius: 3,
  },
  f2fCardCompact: {
    width: "18%",
    marginRight: "2%",
    borderWidth: 0.5,
    borderColor: "#cccccc",
    paddingTop: 3,
    paddingHorizontal: 3,
    paddingBottom: 2,
    borderRadius: 3,
  },
  f2fCardBody: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  f2fCardBodyCompact: {
    flexDirection: "column",
    alignItems: "center",
  },
  f2fCardText: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 4,
  },
  f2fCardTextCompact: {
    alignItems: "center",
    width: "100%",
    paddingRight: 0,
    marginBottom: 1,
  },
  f2fCardName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    marginBottom: 1,
  },
  f2fCardNameCompact: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    marginBottom: 1,
    textAlign: "center",
  },
  f2fCardSprint: {
    fontSize: 6,
    color: "#333333",
    marginBottom: 1,
    textAlign: "center",
  },
  f2fCardChip: {
    fontSize: 6,
    color: "#333333",
    marginBottom: 2,
  },
  f2fCardChipCompact: {
    fontSize: 6,
    color: "#333333",
    marginBottom: 2,
    textAlign: "center",
  },
  f2fCardStat: {
    fontSize: 6,
    color: "#333333",
    marginTop: 1,
    paddingHorizontal: 1,
  },
  notesLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
});

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

function athletePrimaryTwenty(
  athlete: TestingDayMatrixAthlete,
  columns: TestingDayMatrixColumn[]
): number | null {
  const column =
    columns.find(
      (entry) =>
        entry.metric_key === TWENTY_YD_DASH &&
        entry.component === TWENTY_YD_PRIMARY_COMPONENT
    ) ?? columns.find((entry) => entry.metric_key === TWENTY_YD_DASH);
  if (!column) return null;
  const value = athlete.cells[column.key]?.display_value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  compactZone,
}: {
  cell: TestingDayMatrixCell | undefined;
  column: TestingDayMatrixColumn;
  compactZone: boolean;
}) {
  const markStyle = compactZone ? styles.athleteCellMark : styles.cellMark;
  if (!cell) {
    return <Text style={markStyle}>—</Text>;
  }
  if (isTotalColumn(column)) {
    return <Text style={markStyle}>{fmtPoints(cell.display_value)}</Text>;
  }
  const mark = fmtPdfTableMark(
    cell.display_value,
    column.units,
    cell.zone_label
  );
  const abbrev = zoneAbbrev(cell.zone_label);
  return (
    <View>
      <Text style={markStyle}>
        {abbrev ? mark.replace(abbrev, "") : mark}
        {abbrev ? (
          <Text
            style={
              cell.zone_color ? { color: cell.zone_color } : styles.cellZone
            }
          >
            {abbrev}
          </Text>
        ) : null}
      </Text>
      {cell.rank != null ? (
        <Text style={styles.cellPlace}>
          {formatPlace(cell.rank, Boolean(cell.tied))}
        </Text>
      ) : null}
    </View>
  );
}

function F2fTraitLine({
  label,
  vertex,
  paint,
}: {
  label: string;
  vertex: F2fVertex | null | undefined;
  paint: F2fPaint;
}) {
  const backgroundColor = f2fPaintBackground(paint);
  return (
    <Text
      style={[
        styles.f2fCardStat,
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      {label} {fmtPredictedForty(vertex)}
    </Text>
  );
}

const PIE_CX = 40;
const PIE_CY = 40;
const PIE_R = 32;
const PIE_DISPLAY = Math.round(80 * 0.85);

function CoachF2fPie({ group }: { group: F2fThemeSummary }) {
  const slices = f2fPieSlices(group.mix, group.eligible_count);
  if (slices.length === 0) return null;
  let cursor = 0;
  return (
    <View style={styles.f2fPieRow}>
      <Svg width={PIE_DISPLAY} height={PIE_DISPLAY} viewBox="0 0 80 80">
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

function CoachF2fCard({
  athlete,
  compact,
  twentyYd,
}: {
  athlete: TestingDayMatrixAthlete;
  compact: boolean;
  twentyYd: number | null;
}) {
  const profile = athlete.f2f;
  const paints = profile ? f2fStrengthDeficiency(profile) : null;
  const chip =
    profile?.eligible_for_labels && profile.primary != null
      ? pdfCoachF2fCopy(f2fChipLabel(profile.primary))
      : null;
  const sprintSubline = f2fCardSprintSubline(profile, twentyYd);
  return (
    <View style={compact ? styles.f2fCardCompact : styles.f2fCard} wrap={false}>
      <View style={compact ? styles.f2fCardBodyCompact : styles.f2fCardBody}>
        <View style={compact ? styles.f2fCardTextCompact : styles.f2fCardText}>
          <Text style={compact ? styles.f2fCardNameCompact : styles.f2fCardName}>
            {f2fCardHeading(athleteDisplayName(athlete), profile)}
          </Text>
          {sprintSubline ? (
            <Text style={styles.f2fCardSprint}>{sprintSubline}</Text>
          ) : null}
          {chip ? (
            <Text
              style={compact ? styles.f2fCardChipCompact : styles.f2fCardChip}
            >
              {chip}
            </Text>
          ) : null}
          {f2fShowsPredicted40s(profile) ? (
            <>
              <F2fTraitLine
                label={PDF_F2F_QUALITY_LABELS.explosion}
                vertex={profile?.explosion}
                paint={paints?.explosion ?? null}
              />
              <F2fTraitLine
                label={PDF_F2F_QUALITY_LABELS.force}
                vertex={profile?.force}
                paint={paints?.force ?? null}
              />
              <F2fTraitLine
                label={PDF_F2F_QUALITY_LABELS.form}
                vertex={profile?.form}
                paint={paints?.form ?? null}
              />
            </>
          ) : null}
        </View>
        {profile ? (
          <PdfF2fTriangle
            profile={profile}
            size={F2F_CARD_TRIANGLE_SIZE}
            compact={compact}
          />
        ) : null}
      </View>
    </View>
  );
}

function SectionNotes({
  audience,
  section,
}: {
  audience: TestingDayPdfAudience;
  section: TestingDayPdfSection;
}) {
  return (
    <View>
      <Text style={styles.notesLabel}>
        {audience === "coach" ? "Coach notes" : "Team notes"}
      </Text>
      <TextInput
        name={`notes-${audience}-${themeGroupKey(section.sport, section.gender)}`}
        multiline
        fontSize={10}
        style={{ height: 42, borderWidth: 1, borderColor: "#999999", padding: 4 }}
      />
    </View>
  );
}

function CoachF2fSection({
  board,
  section,
}: {
  board: TestingDayBoardData;
  section: TestingDayPdfSection;
}) {
  const group = matchingThemeGroup(board, section);
  const themeNote = coachF2fPdfNote(board.f2f_themes?.session, group);
  const compact = section.athletes.every(
    (athlete) => !f2fShowsPredicted40s(athlete.f2f)
  );
  const cards = chunkAthletes(section.athletes, compact ? 5 : 3);
  const emptyLabels = !group || group.eligible_count === 0;
  return (
    <View>
      <Text style={styles.f2fTitle}>Force-to-Form</Text>
      {themeNote ? (
        <Text style={styles.f2fNote}>{pdfCoachF2fCopy(themeNote)}</Text>
      ) : null}
      {emptyLabels ? (
        <Text style={styles.f2fNote}>No Force-to-Form labels yet.</Text>
      ) : (
        <CoachF2fPie group={group} />
      )}
      {cards.map((row) => (
        <View
          key={row.map((athlete) => athlete.athlete_id).join("-")}
          style={styles.f2fCardRow}
          wrap={false}
        >
          {row.map((athlete) => (
            <CoachF2fCard
              key={athlete.athlete_id}
              athlete={athlete}
              compact={compact}
              twentyYd={athletePrimaryTwenty(athlete, board.matrix.columns)}
            />
          ))}
        </View>
      ))}
      <SectionNotes audience="coach" section={section} />
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
  const compactZone = audience === "athlete";
  const colWidth = cellWidth(columns.length);
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
      </View>
      {section.athletes.map((athlete) => {
        const place = ranks.get(athlete.athlete_id);
        const grade = formatPdfGrade(athlete.graduating_class ?? null, now);
        const badge =
          audience === "athlete" ? f2fFocusBadge(athlete.f2f) : null;
        const subline = place ? athleteSubline(place, grade) : null;
        return (
          <View key={athlete.athlete_id} style={styles.row} wrap={false}>
            <View style={styles.athleteCol}>
              <Text style={styles.athleteName}>
                {athleteDisplayName(athlete)}
              </Text>
              {subline || badge ? (
                <Text style={styles.athleteMeta}>
                  {subline}
                  {subline && badge ? " · " : ""}
                  {badge ? (
                    <Text style={{ color: F2F_FOCUS_COLORS[badge.tone] }}>
                      {badge.text}
                    </Text>
                  ) : null}
                </Text>
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
                  compactZone={compactZone}
                />
              </View>
            ))}
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
            <Text style={styles.muted}>{ZONE_ABBREV_LEGEND}</Text>
            <SectionMatrix
              board={board}
              section={section}
              audience={audience}
              now={now}
            />
            {audience === "coach" ? (
              <CoachF2fSection board={board} section={section} />
            ) : (
              <SectionNotes audience={audience} section={section} />
            )}
          </Page>,
        ];
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
