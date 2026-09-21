import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";
import { metricLabel } from "@/lib/norms/editor-metrics";
import {
  F2F_CARD_TRIANGLE_SIZE,
  PdfF2fTriangle,
} from "@/lib/norms/testing-day-pdf-triangle";
import type { TeamProgressPayload } from "./build-payload";
import { formatSeasonWeekDay } from "./stats";

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
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 14,
  },
  muted: { color: "#444444", marginBottom: 4 },
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
    marginBottom: 2,
  },
  colMetric: { width: "34%" },
  colNum: { width: "22%" },
  f2fRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
    paddingVertical: 8,
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

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function TeamProgressDocument({ data }: { data: TeamProgressPayload }) {
  const sport = HUGO_GROUP_META[data.hugo_group as HugoGroup]?.label ?? data.hugo_group;
  const endLabel = data.f2f.end_mode === "best" ? "Best" : "Most recent";

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>Team Progress — {sport}</Text>
        <Text style={styles.muted}>
          {data.from} → {data.to}
        </Text>
        <Text style={styles.muted}>
          Roster {data.roster_count} · Athletes with ≥1 test{" "}
          {data.athletes_with_tests}
        </Text>

        <Text style={styles.h2}>Testing (first → last team median)</Text>
        <View style={[styles.row, styles.th]}>
          <Text style={styles.colMetric}>Metric</Text>
          <Text style={styles.colNum}>First</Text>
          <Text style={styles.colNum}>Last</Text>
          <Text style={styles.colNum}>Delta</Text>
        </View>
        {data.tests.length === 0 ? (
          <Text style={styles.muted}>No testing marks in range.</Text>
        ) : (
          data.tests.map((t) => (
            <View key={t.metric_key} style={styles.row}>
              <Text style={styles.colMetric}>{metricLabel(t.metric_key)}</Text>
              <Text style={styles.colNum}>{fmt(t.first?.median)}</Text>
              <Text style={styles.colNum}>{fmt(t.last?.median)}</Text>
              <Text style={styles.colNum}>{fmt(t.delta)}</Text>
            </View>
          ))
        )}

        <Text style={styles.h2}>Lifts (team median load / day)</Text>
        <View style={[styles.row, styles.th]}>
          <Text style={styles.colMetric}>Lift</Text>
          <Text style={styles.colNum}>First</Text>
          <Text style={styles.colNum}>Last</Text>
          <Text style={styles.colNum}>Delta</Text>
        </View>
        {data.lifts.length === 0 ? (
          <Text style={styles.muted}>No squat/press/hinge loads in range.</Text>
        ) : (
          data.lifts.map((lift) => (
            <View key={lift.lift_id} style={styles.row}>
              <Text style={styles.colMetric}>{lift.label}</Text>
              <Text style={styles.colNum}>{fmt(lift.first?.median, 0)}</Text>
              <Text style={styles.colNum}>{fmt(lift.last?.median, 0)}</Text>
              <Text style={styles.colNum}>{fmt(lift.delta, 0)}</Text>
            </View>
          ))
        )}

        <Text style={styles.h2}>ISO Rocks (logged total / per-set)</Text>
        {data.iso_rocks.length === 0 ? (
          <Text style={styles.muted}>No ISO Rock logged holds found.</Text>
        ) : (
          data.iso_rocks.map((rock) => {
            const totals = rock.total_points ?? [];
            const perSet = rock.per_set_points ?? [];
            const dates = [
              ...new Set([
                ...totals.map((p) => p.date),
                ...perSet.map((p) => p.date),
              ]),
            ].sort();
            const lines = dates.map((date) => {
              const total = totals.find((p) => p.date === date);
              const set = perSet.find((p) => p.date === date);
              const totalS = total != null ? `${total.seconds}s` : "—";
              const setS = set != null ? `${set.seconds}s` : "—";
              const wd = formatSeasonWeekDay(
                date,
                data.timeline_anchor,
                data.timeline_dates ?? []
              );
              const label = wd ? `${date.slice(5)} ${wd}` : date.slice(5);
              return `${label}: total ${totalS} / set ${setS}`;
            });
            return (
              <View key={rock.rock_id} style={{ marginBottom: 6 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>
                  {rock.label}
                </Text>
                <Text style={styles.muted}>{lines.join(" · ")}</Text>
              </View>
            );
          })
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `LCA Speed Journal · Team Progress · ${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>Force-to-Form — per athlete</Text>
        <Text style={styles.muted}>
          Beginning (earliest per test) → {endLabel}. Infrequent marks carry
          forward. Athletes need ≥1 retested quality.
        </Text>
        {data.f2f.athletes.length === 0 ? (
          <Text style={styles.muted}>
            No athletes with a retested Force-to-Form quality in this window.
          </Text>
        ) : (
          data.f2f.athletes.map((a) => (
            <View key={a.id} style={styles.f2fRow} wrap={false}>
              <View style={{ width: "42%" }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {a.first_name} {a.last_name}
                </Text>
                <Text style={styles.muted}>
                  {a.first_session_date} → {a.last_session_date}
                </Text>
                <Text>
                  {(a.first_profile.primary ?? "—").toString()} →{" "}
                  {(a.last_profile.primary ?? "—").toString()}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 8, marginBottom: 2 }}>Beginning</Text>
                <PdfF2fTriangle
                  profile={a.first_profile}
                  size={F2F_CARD_TRIANGLE_SIZE}
                  compact
                />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 8, marginBottom: 2 }}>{endLabel}</Text>
                <PdfF2fTriangle
                  profile={a.last_profile}
                  size={F2F_CARD_TRIANGLE_SIZE}
                  compact
                />
              </View>
            </View>
          ))
        )}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `LCA Speed Journal · Team Progress · ${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderTeamProgressPdf(
  data: TeamProgressPayload
): Promise<Buffer> {
  return renderToBuffer(
    <TeamProgressDocument data={data} /> as unknown as Parameters<
      typeof renderToBuffer
    >[0]
  );
}

export function teamProgressPdfFilename(
  hugoGroup: string,
  from: string,
  to: string
): string {
  return `team-progress-${hugoGroup}-${from}_${to}.pdf`;
}
