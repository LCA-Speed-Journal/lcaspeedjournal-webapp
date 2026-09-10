import type { CardDraft } from "./types";

/** Landscape letter height minus typical 0.35in top/bottom margins. */
export const PAGE_BODY_IN = 7.8;
export const HEADER_IN = 0.8;
export const TABLE_HEAD_IN = 0.32;
export const MOVEMENT_ROW_IN = 0.28;
export const NOTES_ROW_IN = 0.16;
export const WARMUP_ROW_IN = 0.4;
export const MIN_SCAN_ROW_IN = 0.26;
export const MAX_SCAN_SAFE_SETS = 6;
export const MAX_SCAN_SAFE_MOVEMENTS = 12;
export const PRINT_CROWDING_WARNING =
  "Check the preview to make sure all movements fit on one page before printing.";

export type CardFit = {
  estimatedHeightIn: number;
  pageBodyIn: number;
  fits: boolean;
  scanSafe: boolean;
  movementCount: number;
  maxSets: number;
  warnings: string[];
};

function movementHeight(block: string, setCount: number, notes: string): number {
  if (block.toLowerCase() === "warmup" && setCount <= 0) {
    return WARMUP_ROW_IN;
  }
  return MOVEMENT_ROW_IN + (notes.trim() ? NOTES_ROW_IN : 0);
}

export function analyzeCardFit(draft: CardDraft): CardFit {
  const movementCount = draft.movements.length;
  const maxSets = draft.movements.reduce(
    (max, m) => Math.max(max, m.setCount),
    0
  );
  const rowsHeight = draft.movements.reduce(
    (sum, m) => sum + movementHeight(m.block, m.setCount, m.notes),
    0
  );
  const estimatedHeightIn = HEADER_IN + TABLE_HEAD_IN + rowsHeight;
  const fits = estimatedHeightIn <= PAGE_BODY_IN;
  const warnings: string[] = [];

  if (!fits) {
    warnings.push(
      `Estimated ${estimatedHeightIn.toFixed(2)}in exceeds ${PAGE_BODY_IN}in page body`
    );
  }
  if (maxSets > MAX_SCAN_SAFE_SETS) {
    warnings.push(
      `${maxSets} set columns is above the scan-safe max of ${MAX_SCAN_SAFE_SETS}`
    );
  }
  if (movementCount > MAX_SCAN_SAFE_MOVEMENTS) {
    warnings.push(
      `${movementCount} movements is above the scan-safe max of ${MAX_SCAN_SAFE_MOVEMENTS}`
    );
  }

  const rowBudget =
    movementCount > 0
      ? (PAGE_BODY_IN - HEADER_IN - TABLE_HEAD_IN) / movementCount
      : PAGE_BODY_IN;
  if (rowBudget < MIN_SCAN_ROW_IN) {
    warnings.push(
      `Average row budget ${rowBudget.toFixed(2)}in is below ${MIN_SCAN_ROW_IN}in scan minimum`
    );
  }

  const scanSafe =
    fits &&
    maxSets <= MAX_SCAN_SAFE_SETS &&
    movementCount <= MAX_SCAN_SAFE_MOVEMENTS &&
    rowBudget >= MIN_SCAN_ROW_IN;

  return {
    estimatedHeightIn,
    pageBodyIn: PAGE_BODY_IN,
    fits,
    scanSafe,
    movementCount,
    maxSets,
    warnings,
  };
}

/** Print stays available past scan-safe limits; crowding is a preview check. */
export function crowdingPrintWarning(fit: CardFit | null): string | null {
  if (!fit || fit.scanSafe) return null;
  return PRINT_CROWDING_WARNING;
}
