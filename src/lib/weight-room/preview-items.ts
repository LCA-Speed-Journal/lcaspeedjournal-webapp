import extraSessions from "./extracurricular-sessions.json";
import { assignTermDates, extraSessionToDraft } from "./from-extra-json";
import { analyzeCardFit, type CardFit } from "./layout-estimate";
import { makeStressDraft } from "./row-stress";
import { sampleInSeasonSoccer } from "./sample-in-season";
import type { CardDraft } from "./types";
import type { ExtraSessionJson } from "./from-extra-json";

export type PreviewItem = {
  id: string;
  label: string;
  hint: string;
  draft: CardDraft;
  fit: CardFit;
};

const TERM_START = "2026-09-08";

function extraItem(
  id: string,
  label: string,
  hint: string,
  week: number,
  day: string
): PreviewItem {
  const raw = (extraSessions as ExtraSessionJson[]).find(
    (s) => s.week === week && s.day === day
  );
  if (!raw) {
    throw new Error(`Missing extra session Week ${week} ${day}`);
  }
  const draft = assignTermDates([extraSessionToDraft(raw)], TERM_START)[0];
  return { id, label, hint, draft, fit: analyzeCardFit(draft) };
}

function wrap(id: string, label: string, hint: string, draft: CardDraft): PreviewItem {
  return { id, label, hint, draft, fit: analyzeCardFit(draft) };
}

export function getPreviewCatalog(): PreviewItem[] {
  return [
    extraItem(
      "extra-w1-mon",
      "Extra · Week 1 Monday (Upper A)",
      "Mapped from extracurricular JSON — typical 8-row intro day.",
      1,
      "Monday"
    ),
    extraItem(
      "extra-w2-mon",
      "Extra · Week 2 Monday (densest)",
      "12 movements — the fullest extra sheet in the 10-week block.",
      2,
      "Monday"
    ),
    extraItem(
      "extra-w4-mon",
      "Extra · Week 4 Monday (6 set columns)",
      "Cluster week — more Load×Reps cells, fewer rows than Week 2.",
      4,
      "Monday"
    ),
    wrap(
      "soccer-sample",
      "In-season sample · Soccer lower + power",
      "Shorter in-season template (not extra hypertrophy volume).",
      sampleInSeasonSoccer
    ),
    wrap(
      "stress-8",
      "Density · 8 dummy rows",
      "Comfortable one-page budget with notes on every row.",
      makeStressDraft(8)
    ),
    wrap(
      "stress-12",
      "Density · 12 dummy rows",
      "Comfortable dense sheet — heights shrink from ideal.",
      makeStressDraft(12)
    ),
    wrap(
      "stress-14",
      "Density · 14 dummy rows",
      "Dense noted rows; should still fit and stay scan-safe.",
      makeStressDraft(14)
    ),
    wrap(
      "stress-16",
      "Density · 16 dummy rows",
      "Heavier shrink; check Load×Reps cell height in the preview.",
      makeStressDraft(16)
    ),
    wrap(
      "stress-20",
      "Density · 20 dummy rows",
      "Near the min pack; confirm it still fits one page.",
      makeStressDraft(20)
    ),
  ];
}
