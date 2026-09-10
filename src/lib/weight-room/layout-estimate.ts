import type { CardDraft } from "./types";

/** Landscape letter height minus typical 0.35in top/bottom margins. */
export const PAGE_BODY_IN = 7.8;
export const HEADER_IN = 0.8;
export const TABLE_HEAD_IN = 0.32;
export const MAX_SCAN_SAFE_SETS = 6;
export const PRINT_CROWDING_WARNING =
  "Check the preview to make sure all movements fit on one page before printing.";

export const FILL_ROW_MIN_IN = 3 / 16;
export const FILL_ROW_IDEAL_IN = 5 / 16;
export const FILL_ROW_MAX_IN = 7 / 16;

export const NOTES_ROW_MIN_IN = 1 / 8;
export const NOTES_ROW_IDEAL_IN = 3 / 16;
export const NOTES_ROW_MAX_IN = 1 / 4;

export const ZERO_SET_ROW_MIN_IN = 1 / 4;
export const ZERO_SET_ROW_IDEAL_IN = 5 / 16;
export const ZERO_SET_ROW_MAX_IN = 3 / 8;

export type CardRowHeights = {
  fillRowIn: number;
  notesRowIn: number;
  zeroSetRowIn: number;
  usedHeightIn: number;
  leftoverIn: number;
};

function isZeroSetMovement(setCount: number): boolean {
  return setCount <= 0;
}

function lerp(from: number, to: number, t: number): number {
  return from + t * (to - from);
}

function growTowardMax(
  current: number,
  max: number,
  count: number,
  leftover: number
): { height: number; leftover: number } {
  if (count <= 0 || leftover <= 0) return { height: current, leftover };
  const add = Math.min(max - current, leftover / count);
  return { height: current + add, leftover: leftover - add * count };
}

export function computeCardRowHeights(draft: CardDraft): CardRowHeights {
  let nFill = 0;
  let nNotes = 0;
  let nZero = 0;
  for (const m of draft.movements) {
    if (isZeroSetMovement(m.setCount)) {
      nZero += 1;
    } else {
      nFill += 1;
      if (m.notes.trim()) nNotes += 1;
    }
  }

  const available = PAGE_BODY_IN - HEADER_IN - TABLE_HEAD_IN;
  const idealSum =
    nFill * FILL_ROW_IDEAL_IN +
    nNotes * NOTES_ROW_IDEAL_IN +
    nZero * ZERO_SET_ROW_IDEAL_IN;
  const minSum =
    nFill * FILL_ROW_MIN_IN +
    nNotes * NOTES_ROW_MIN_IN +
    nZero * ZERO_SET_ROW_MIN_IN;

  let fillRowIn = FILL_ROW_IDEAL_IN;
  let notesRowIn = NOTES_ROW_IDEAL_IN;
  let zeroSetRowIn = ZERO_SET_ROW_IDEAL_IN;

  if (idealSum <= available) {
    let leftover = available - idealSum;
    const fillGrown = growTowardMax(fillRowIn, FILL_ROW_MAX_IN, nFill, leftover);
    fillRowIn = fillGrown.height;
    leftover = fillGrown.leftover;
    const zeroGrown = growTowardMax(
      zeroSetRowIn,
      ZERO_SET_ROW_MAX_IN,
      nZero,
      leftover
    );
    zeroSetRowIn = zeroGrown.height;
    leftover = zeroGrown.leftover;
    const notesGrown = growTowardMax(
      notesRowIn,
      NOTES_ROW_MAX_IN,
      nNotes,
      leftover
    );
    notesRowIn = notesGrown.height;
  } else if (minSum > available) {
    fillRowIn = FILL_ROW_MIN_IN;
    notesRowIn = NOTES_ROW_MIN_IN;
    zeroSetRowIn = ZERO_SET_ROW_MIN_IN;
  } else {
    const t = (idealSum - available) / (idealSum - minSum);
    fillRowIn = lerp(FILL_ROW_IDEAL_IN, FILL_ROW_MIN_IN, t);
    notesRowIn = lerp(NOTES_ROW_IDEAL_IN, NOTES_ROW_MIN_IN, t);
    zeroSetRowIn = lerp(ZERO_SET_ROW_IDEAL_IN, ZERO_SET_ROW_MIN_IN, t);
  }

  const rowsHeight =
    nFill * fillRowIn + nNotes * notesRowIn + nZero * zeroSetRowIn;
  const usedHeightIn = HEADER_IN + TABLE_HEAD_IN + rowsHeight;
  return {
    fillRowIn,
    notesRowIn,
    zeroSetRowIn,
    usedHeightIn,
    leftoverIn: Math.max(0, PAGE_BODY_IN - usedHeightIn),
  };
}

export type CardFit = {
  estimatedHeightIn: number;
  pageBodyIn: number;
  fits: boolean;
  scanSafe: boolean;
  movementCount: number;
  maxSets: number;
  warnings: string[];
};

export function analyzeCardFit(draft: CardDraft): CardFit {
  const heights = computeCardRowHeights(draft);
  const movementCount = draft.movements.length;
  const maxSets = draft.movements.reduce(
    (max, m) => Math.max(max, m.setCount),
    0
  );
  const estimatedHeightIn = heights.usedHeightIn;
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

  return {
    estimatedHeightIn,
    pageBodyIn: PAGE_BODY_IN,
    fits,
    scanSafe: fits && maxSets <= MAX_SCAN_SAFE_SETS,
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
