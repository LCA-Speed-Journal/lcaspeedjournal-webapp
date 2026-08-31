import type { CardDraft } from "./types";

/** Dummy card used to probe how many exercise rows still fit on one landscape letter page. */
export function makeStressDraft(rowCount: number, setCount = 4): CardDraft {
  const n = Math.max(0, Math.floor(rowCount));
  const targets = Array.from({ length: setCount }, () => "5 @ RPE 8");
  return {
    hugoGroup: "extracurricular",
    weekNumber: 0,
    dayName: "Density",
    sessionDate: "2026-09-08",
    focus: `Row stress (${n})`,
    title: `Density test — ${n} movements × ${setCount} sets`,
    movements: Array.from({ length: n }, (_, i) => ({
      label: String(i + 1),
      name: `Dummy Lift ${i + 1}`,
      block: "Main",
      setCount,
      targets,
      notes: "Placeholder note to match typical coaching cue height",
      fromPair: false,
      exerciseHtml: null,
      speedJournalMetricKey: null,
    })),
  };
}
