import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const QUALIFIER_NAMES: Record<string, string> = {
  reactive: "Reactive",
  compliant: "Compliant",
  stiff: "Stiff",
  developing: "Developing",
};

export type PacketBox = {
  box: string;
  value: number | null;
  band: string | null;
};

export type PacketComparison = {
  label: string;
  current: number | null;
  september: number | null;
  change: number | null;
};

export type PacketAthlete = {
  athlete_id: string;
  bib: string | null;
  first_name: string;
  last_name: string;
  qualifier: string | null;
  rsi: number | null;
  higher_box: boolean;
  boxes: PacketBox[];
  comparisons: PacketComparison[];
};

export type CoachPacketData = {
  title: string;
  teamBox: string | null;
  athletes: PacketAthlete[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 58,
    paddingBottom: 28,
    paddingHorizontal: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  header: {
    position: "absolute",
    top: 22,
    left: 28,
    right: 28,
  },
  h1: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  muted: {
    fontSize: 9,
    marginBottom: 8,
    color: "#333333",
  },
  athlete: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    paddingVertical: 4,
    marginBottom: 2,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 1,
  },
  line: {
    marginBottom: 1,
  },
  flag: {
    fontFamily: "Helvetica-Bold",
  },
});

function formatMark(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(digits);
}

function formatChange(change: number): string {
  const abs = Math.abs(change);
  const digits = abs < 0.1 ? 2 : abs < 10 ? 1 : 0;
  const rounded = Number(change.toFixed(digits));
  const body = Math.abs(rounded).toFixed(digits);
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return digits === 0 ? "0" : (0).toFixed(digits);
}

export function qualifierColorName(qualifier: string | null): string | null {
  if (!qualifier) return null;
  const key = qualifier.trim().toLowerCase();
  return QUALIFIER_NAMES[key] ?? null;
}

function athleteName(athlete: PacketAthlete): string {
  const bib = athlete.bib ? `${athlete.bib}  ` : "";
  const name = `${athlete.last_name}, ${athlete.first_name}`.trim();
  return `${bib}${name || "Athlete"}`;
}

function rsiLine(athlete: PacketAthlete): string {
  const color = qualifierColorName(athlete.qualifier);
  const value = formatMark(athlete.rsi);
  return color ? `RSI ${value}  ${color}` : `RSI ${value}`;
}

function driLine(athlete: PacketAthlete, teamBox: string | null): string {
  const boxes = athlete.boxes
    .map((box) => {
      if (box.value == null) return `${box.box} —`;
      return box.band ? `${box.box} ${formatMark(box.value)} ${box.band}` : `${box.box} ${formatMark(box.value)}`;
    })
    .join("   ");
  const team = teamBox ? `Team box ${teamBox}` : "Team box —";
  return `${boxes}    ${team}`;
}

function comparisonLine(comparison: PacketComparison): string {
  const current = formatMark(comparison.current);
  if (comparison.september == null || comparison.change == null) {
    return `${comparison.label} ${current}`;
  }
  return `${comparison.label} ${current}  Sept 2 ${formatMark(comparison.september)}  ${formatChange(comparison.change)}`;
}

function PacketDocument({ data }: { data: CoachPacketData }) {
  const team = data.teamBox ? `Team box ${data.teamBox}` : "Team box —";
  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.h1}>{data.title}</Text>
          <Text style={styles.muted}>Coach packet · {team}</Text>
        </View>
        {data.athletes.length === 0 ? (
          <Text style={styles.line}>No athletes on this battery.</Text>
        ) : (
          data.athletes.map((athlete) => (
            <View key={athlete.athlete_id} style={styles.athlete} wrap={false}>
              <Text style={styles.name}>{athleteName(athlete)}</Text>
              <Text style={styles.line}>{rsiLine(athlete)}</Text>
              <Text style={styles.line}>{driLine(athlete, data.teamBox)}</Text>
              {athlete.higher_box ? (
                <Text style={[styles.line, styles.flag]}>
                  Higher eccentric load than the team box.
                </Text>
              ) : null}
              <Text style={styles.line}>
                {athlete.comparisons.map((comparison) => comparisonLine(comparison)).join("    ")}
              </Text>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}

export function packetFilename(): string {
  return "boys-basketball-baseline-coach-packet.pdf";
}

export async function renderCoachPacket(data: CoachPacketData): Promise<Buffer> {
  const element = <PacketDocument data={data} />;
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
