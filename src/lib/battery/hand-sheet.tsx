import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export const HAND_SHEET_TITLE = "Boys Basketball Baseline";
export const HAND_SHEET_BLANK_ROWS = 3;

export type HandSheetAthlete = {
  bib: string;
  first_name: string;
  last_name: string;
  grade_digit: number;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  h1: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  grade: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    paddingVertical: 4,
    minHeight: 28,
  },
  blankRow: {
    height: 28,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
  },
  bib: {
    width: 72,
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  name: {
    fontSize: 12,
  },
});

function gradeSections(athletes: HandSheetAthlete[]) {
  const extra = [...new Set(athletes.map((athlete) => athlete.grade_digit))]
    .filter((digit) => digit !== 1 && digit !== 2 && digit !== 3 && digit !== 4)
    .toSorted((a, b) => a - b);
  return [1, 2, 3, 4, ...extra].map((digit) => ({
    digit,
    athletes: athletes
      .filter((athlete) => athlete.grade_digit === digit)
      .toSorted((a, b) => a.bib.localeCompare(b.bib) || a.last_name.localeCompare(b.last_name)),
  }));
}

function HandSheetDocument({ athletes }: { athletes: HandSheetAthlete[] }) {
  const sections = gradeSections(athletes);
  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.h1}>{HAND_SHEET_TITLE}</Text>
        {sections.map((section) => (
          <View key={section.digit}>
            <Text style={styles.grade}>{section.digit}</Text>
            {section.athletes.map((athlete) => (
              <View key={athlete.bib} style={styles.row}>
                <Text style={styles.bib}>{athlete.bib}</Text>
                <Text style={styles.name}>
                  {athlete.last_name}, {athlete.first_name}
                </Text>
              </View>
            ))}
            {Array.from({ length: HAND_SHEET_BLANK_ROWS }, (_, index) => (
              <View key={`blank-${section.digit}-${index}`} style={styles.blankRow} />
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function handSheetFilename(): string {
  return "boys-basketball-baseline-hand-sheet.pdf";
}

export async function renderHandSheet(athletes: HandSheetAthlete[]): Promise<Buffer> {
  const element = <HandSheetDocument athletes={athletes} />;
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
