import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { HUGO_GROUP_META } from "@/lib/weight-room/constants";
import type {
  AthleteReportRow,
  WeightRoomReport,
} from "@/lib/weight-room/report-aggregate";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  h1: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 12,
  },
  muted: {
    color: "#333333",
    marginBottom: 4,
  },
  empty: {
    marginTop: 18,
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    paddingVertical: 3,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 4,
    marginTop: 8,
  },
  colDate: { width: "40%" },
  colCount: { width: "60%" },
  colWeekDate: { width: "28%" },
  colWeekSets: { width: "24%" },
  colWeekVol: { width: "24%" },
  colWeekLoad: { width: "24%" },
  athleteBlock: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
  },
  metric: {
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#666666",
  },
});

function dash(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function athleteName(row: AthleteReportRow): string {
  const name = `${row.first_name} ${row.last_name}`.trim();
  return name || "Unknown athlete";
}

function CoverAttendance({ report }: { report: WeightRoomReport }) {
  if (report.attendanceByDate.length === 0) return null;
  return (
    <View>
      <Text style={styles.h2}>Session attendance</Text>
      <View style={[styles.row, styles.th]}>
        <Text style={styles.colDate}>Session date</Text>
        <Text style={styles.colCount}>Athletes present</Text>
      </View>
      {report.attendanceByDate.map((row) => (
        <View key={row.session_date} style={styles.row}>
          <Text style={styles.colDate}>{row.session_date}</Text>
          <Text style={styles.colCount}>{row.count}</Text>
        </View>
      ))}
    </View>
  );
}

function AthleteSection({ row }: { row: AthleteReportRow }) {
  const movements =
    row.movementsTrained.length > 0 ? row.movementsTrained.join(", ") : "None";
  return (
    <View style={styles.athleteBlock}>
      <Text style={styles.h2}>{athleteName(row)}</Text>
      <Text style={styles.metric}>Days present: {row.daysPresent}</Text>
      <Text style={styles.metric}>Movements trained: {movements}</Text>
      <Text style={styles.metric}>Sets logged: {row.setsLogged}</Text>
      <Text style={styles.metric}>Parsed volume (reps): {row.parsedVolume}</Text>
      <Text style={styles.metric}>Best load in range: {dash(row.bestLoad)}</Text>
      <Text style={styles.metric}>
        Prior week best load: {dash(row.priorWeekBestLoad)}
      </Text>
      <Text style={[styles.metric, { marginTop: 6, fontFamily: "Helvetica-Bold" }]}>
        Outputs
      </Text>
      {row.outputs.length === 0 ? (
        <Text style={styles.metric}>None</Text>
      ) : (
        row.outputs.map((out, i) => (
          <Text key={`${out.movement_name}-${out.session_date}-${i}`} style={styles.metric}>
            {out.session_date ? `${out.session_date} · ` : ""}
            {out.movement_name}
            {out.raw_text ? ` — ${out.raw_text}` : ""}
          </Text>
        ))
      )}
      {row.byDate.length > 0 ? (
        <View>
          <Text style={styles.h2}>By session</Text>
          <View style={[styles.row, styles.th]}>
            <Text style={styles.colWeekDate}>Date</Text>
            <Text style={styles.colWeekSets}>Sets</Text>
            <Text style={styles.colWeekVol}>Volume</Text>
            <Text style={styles.colWeekLoad}>Best load</Text>
          </View>
          {row.byDate.map((day) => (
            <View key={day.session_date} style={styles.row}>
              <Text style={styles.colWeekDate}>{day.session_date}</Text>
              <Text style={styles.colWeekSets}>{day.setsLogged}</Text>
              <Text style={styles.colWeekVol}>{day.parsedVolume}</Text>
              <Text style={styles.colWeekLoad}>{dash(day.bestLoad)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function WeightRoomReportDocument({
  report,
  heading,
}: {
  report: WeightRoomReport;
  heading: string;
}) {
  const empty = report.athletes.length === 0;
  const groupLabel =
    report.hugo_group in HUGO_GROUP_META
      ? HUGO_GROUP_META[report.hugo_group].label
      : report.hugo_group;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>{heading}</Text>
        <Text style={styles.muted}>Group: {groupLabel}</Text>
        <Text style={styles.muted}>
          {report.from} to {report.to}
        </Text>
        {empty ? (
          <Text style={styles.empty}>No reviewed sessions in this range</Text>
        ) : (
          <CoverAttendance report={report} />
        )}
        <Text style={styles.footer}>LCA Speed Journal — weight room report</Text>
      </Page>
      {report.athletes.length > 0 ? (
        <Page size="LETTER" style={styles.page} wrap>
          <Text style={styles.h1}>Athletes</Text>
          {report.athletes.map((row) => (
            <AthleteSection key={row.athlete_id} row={row} />
          ))}
          <Text style={styles.footer}>LCA Speed Journal — weight room report</Text>
        </Page>
      ) : null}
    </Document>
  );
}

export async function renderWeightRoomReportPdf(opts: {
  report: WeightRoomReport;
  heading: string;
}): Promise<Buffer> {
  const element = (
    <WeightRoomReportDocument report={opts.report} heading={opts.heading} />
  );
  return renderToBuffer(
    element as unknown as Parameters<typeof renderToBuffer>[0]
  );
}

export function teamReportFilename(
  hugoGroup: string,
  from: string,
  to: string
): string {
  return `hugo-${hugoGroup}-${from}-${to}.pdf`;
}

export function athleteReportFilename(
  athleteId: string,
  from: string,
  to: string
): string {
  return `hugo-athlete-${athleteId}-${from}-${to}.pdf`;
}
