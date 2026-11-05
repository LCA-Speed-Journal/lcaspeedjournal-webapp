import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type LaneSheetLane = {
  lane: number;
  bib: string;
  name: string;
  place: number | null;
};

export type LaneSheetHeat = {
  heat: number;
  cutoffAfter: boolean;
  lanes: LaneSheetLane[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  h1: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  protocol: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
    paddingVertical: 4,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 4,
  },
  heat: { width: "12%" },
  lane: { width: "12%" },
  bib: { width: "16%", fontFamily: "Helvetica-Bold" },
  name: { width: "42%" },
  place: { width: "18%" },
  cutoff: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
  },
  cutoffLine: {
    flexGrow: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: "#111111",
  },
  cutoffLabel: {
    marginHorizontal: 8,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
});

function placeText(place: number | null): string {
  return place == null ? "—" : String(place);
}

function LaneSheetDocument({ title, heats }: { title: string; heats: LaneSheetHeat[] }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.h1}>{title}</Text>
        <Text style={styles.protocol}>10×10 · 10s</Text>
        <View style={[styles.row, styles.th]}>
          <Text style={styles.heat}>Heat</Text>
          <Text style={styles.lane}>Lane</Text>
          <Text style={styles.bib}>Bib</Text>
          <Text style={styles.name}>Name</Text>
          <Text style={styles.place}>Place</Text>
        </View>
        {heats.map((heat) => (
          <View key={heat.heat}>
            {heat.lanes.map((lane, index) => (
              <View key={`${heat.heat}-${lane.lane}`} style={styles.row}>
                <Text style={styles.heat}>{index === 0 ? String(heat.heat) : ""}</Text>
                <Text style={styles.lane}>{lane.lane}</Text>
                <Text style={styles.bib}>{lane.bib || "—"}</Text>
                <Text style={styles.name}>{lane.name}</Text>
                <Text style={styles.place}>{placeText(lane.place)}</Text>
              </View>
            ))}
            {heat.cutoffAfter ? (
              <View style={styles.cutoff}>
                <View style={styles.cutoffLine} />
                <Text style={styles.cutoffLabel}>Cutoff</Text>
                <View style={styles.cutoffLine} />
              </View>
            ) : null}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function laneSheetFilename(): string {
  return "friday-lane-sheet.pdf";
}

export async function renderLaneSheet(opts: {
  title: string;
  heats: LaneSheetHeat[];
}): Promise<Buffer> {
  const element = <LaneSheetDocument title={opts.title} heats={opts.heats} />;
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
