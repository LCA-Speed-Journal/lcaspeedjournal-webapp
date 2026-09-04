import { describe, it, expect } from "vitest";
import { inflateRawSync, inflateSync } from "zlib";
import {
  boardForAudience,
  renderTestingDayPdf,
  testingDayPdfFilename,
} from "./testing-day-pdf";
import type { TestingDayBoardData } from "./testing-day";
import type { F2fProfile } from "./f2f/types";
import type { F2fThemeSummary } from "./f2f/themes";

function unescapePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function stringsFromPdfContent(content: string): string[] {
  const chunks: string[] = [];
  const tokenRe = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content))) {
    if (match[1]) {
      const hex = match[1];
      let text = "";
      for (let i = 0; i < hex.length; i += 2) {
        text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
      }
      chunks.push(text);
      continue;
    }
    chunks.push(unescapePdfString(match[0].slice(1, -1)));
  }
  return chunks;
}

function inflatePdfStream(bytes: Buffer): string | null {
  try {
    return inflateSync(bytes).toString("latin1");
  } catch {
    try {
      return inflateRawSync(bytes).toString("latin1");
    } catch {
      return null;
    }
  }
}

function pdfVisibleText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const chunks: string[] = [];
  const headerRe =
    /\/Length\s+(\d+)\s*\/Filter\s*\/FlateDecode\s*>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(raw))) {
    const length = Number(match[1]);
    const start = match.index + match[0].length;
    const inflated = inflatePdfStream(buf.subarray(start, start + length));
    if (inflated) chunks.push(...stringsFromPdfContent(inflated));
  }
  return chunks.join("");
}

const f2fMix = {
  explosion: 0,
  force: 1,
  form: 0,
  balanced: 0,
};

const f2fTheme = (
  partial: Pick<F2fThemeSummary, "sport" | "gender" | "generated_note" | "note">
): F2fThemeSummary => ({
  eligible_count: 1,
  mix: f2fMix,
  top3_mix: f2fMix,
  top5_mix: f2fMix,
  ...partial,
});

const annF2f: F2fProfile = {
  reference_40: 5,
  reference_source: "actual_40",
  explosion: { predicted_40: 5.12, extrapolated: false, projected: false },
  force: { predicted_40: 5.2, extrapolated: false, projected: false },
  form: { predicted_40: 4.9, extrapolated: false, projected: true },
  eligible_for_labels: true,
  flags: ["force", "explosion"],
  primary: "force",
};

const poorBoard: TestingDayBoardData = {
  session_id: "s1",
  session_date: "2026-09-02",
  phase: "Preseason",
  selected_population_id: null,
  matrix: {
    columns: [
      {
        key: "Vertical Jump\0",
        metric_key: "Vertical Jump",
        display_name: "Vertical Jump",
        component: null,
        units: "in",
      },
    ],
    athletes: [
      {
        athlete_id: "a",
        first_name: "Ann",
        last_name: "Aye",
        gender: "F",
        sport: "volleyball",
        cells: {
          "Vertical Jump\0": {
            display_value: 16,
            zone_label: "poor",
            zone_color: "#dc2626",
            rank: 1,
            tied: false,
            points: 10,
          },
        },
        total_points: 10,
        f2f: annF2f,
      },
    ],
  },
  tests: [
    {
      column_key: "Vertical Jump\0",
      metric: "Vertical Jump",
      metric_display_name: "Vertical Jump",
      component: null,
      units: "in",
      groups: [],
    },
  ],
  f2f_themes: {
    session: f2fTheme({
      sport: null,
      gender: null,
      generated_note: "Roster is Force-deficient (1/1). Top 5 are Force-strong.",
      note: "the gap is Force, not speed",
    }),
    groups: [
      f2fTheme({
        sport: "volleyball",
        gender: "F",
        generated_note: "Roster is Force-deficient (1/1). Top 5 are Force-strong.",
        note: "Volleyball takeaway",
      }),
    ],
  },
};

describe("boardForAudience", () => {
  it("strips poor badges and summaries for athletes", () => {
    const athlete = boardForAudience(poorBoard, "athlete");
    expect(athlete.tests).toEqual([]);
    expect(athlete.matrix.athletes[0].cells["Vertical Jump\0"].zone_label).toBeUndefined();
    expect(athlete.f2f_themes).toBeUndefined();
    expect(athlete.matrix.athletes[0].f2f).toBeUndefined();
    expect(boardForAudience(poorBoard, "coach").tests).toHaveLength(1);
    expect(boardForAudience(poorBoard, "coach").f2f_themes).toEqual(
      poorBoard.f2f_themes
    );
    expect(boardForAudience(poorBoard, "coach").matrix.athletes[0].f2f).toEqual(
      annF2f
    );
  });
});

describe("testingDayPdfFilename", () => {
  it("names coach and athlete attachments", () => {
    expect(testingDayPdfFilename("2026-09-02", "coach")).toBe(
      "testing-day-2026-09-02-coach.pdf"
    );
  });
});

describe("renderTestingDayPdf", () => {
  it("renders an empty board as a PDF buffer", async () => {
    const buf = await renderTestingDayPdf({
      board: {
        ...poorBoard,
        matrix: { columns: [], athletes: [] },
        tests: [],
      },
      audience: "coach",
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("includes Force-to-Form notes and predicted 40s for coaches", async () => {
    const buf = await renderTestingDayPdf({
      board: poorBoard,
      audience: "coach",
    });
    const text = pdfVisibleText(buf);
    expect(text).toContain("Force-to-Form");
    expect(text).toContain("the gap is Force, not speed");
    expect(text).toContain("Volleyball takeaway");
    expect(text).toContain("Ann Aye");
    expect(text).toContain("5.12");
    expect(text).toContain("5.20");
    expect(text).toContain("4.90*");
  });

  it("omits Force-to-Form from athlete PDFs", async () => {
    const buf = await renderTestingDayPdf({
      board: poorBoard,
      audience: "athlete",
    });
    const text = pdfVisibleText(buf);
    expect(text).not.toContain("Force-to-Form");
    expect(text).not.toContain("the gap is Force, not speed");
    expect(text).not.toContain("Force-deficient");
    expect(text).not.toContain("Volleyball takeaway");
    expect(text).not.toContain("4.90*");
  });
});
