import type { ParsedLoadReps } from "@/types/weight-room";
import type { ScanStatus } from "./constants";
import { parseLoadReps } from "./parse-load-reps";
import { decodeWeightRoomPayload } from "./qr-payload";

export type ExtractCardMovement = {
  id: string;
  name: string;
  set_count: number;
};

export type ExtractCardInput = {
  image: Buffer;
  movements?: ExtractCardMovement[];
};

export type ExtractCardDeps = {
  decodeQr: (image: Buffer) => Promise<string[]>;
  vision: (
    image: Buffer,
    movements: ExtractCardMovement[]
  ) => Promise<Record<string, string>>;
};

export type ExtractCardResult = {
  status: ScanStatus;
  templateId: string | null;
  stickerPayload: string | null;
  stickerId: string | null;
  cells: Record<string, ParsedLoadReps>;
  extraction: Record<string, string>;
  error: string | null;
  warnings: string[];
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "extraction_failed";
}

function emptyResult(
  partial: Partial<ExtractCardResult> & Pick<ExtractCardResult, "status">
): ExtractCardResult {
  return {
    templateId: null,
    stickerPayload: null,
    stickerId: null,
    cells: {},
    extraction: {},
    error: null,
    warnings: [],
    ...partial,
  };
}

function parseQrTexts(texts: string[]): {
  templateId: string | null;
  stickerId: string | null;
  stickerPayload: string | null;
} {
  let templateId: string | null = null;
  let stickerId: string | null = null;
  let stickerPayload: string | null = null;

  for (const text of texts) {
    const decoded = decodeWeightRoomPayload(text);
    if (!decoded) continue;
    if (decoded.kind === "template" && !templateId) {
      templateId = decoded.id;
    }
    if (decoded.kind === "sticker" && !stickerId) {
      stickerId = decoded.id;
      stickerPayload = text;
    }
  }

  return { templateId, stickerId, stickerPayload };
}

function parseCells(
  extraction: Record<string, string>
): Record<string, ParsedLoadReps> {
  const cells: Record<string, ParsedLoadReps> = {};
  for (const [key, raw] of Object.entries(extraction)) {
    cells[key] = parseLoadReps(raw);
  }
  return cells;
}

export async function extractCard(
  input: ExtractCardInput,
  deps: ExtractCardDeps
): Promise<ExtractCardResult> {
  let qrTexts: string[];
  try {
    qrTexts = await deps.decodeQr(input.image);
  } catch (err) {
    return emptyResult({
      status: "uploaded",
      error: errorMessage(err),
    });
  }

  const { templateId, stickerId, stickerPayload } = parseQrTexts(qrTexts);
  const identities = { templateId, stickerId, stickerPayload };
  const movements = input.movements ?? [];

  if (!templateId) {
    return emptyResult({
      status: "uploaded",
      error: "unknown_template",
      ...identities,
    });
  }

  if (movements.length === 0) {
    return emptyResult({
      status: stickerId ? "needs_review" : "unmatched",
      error: null,
      ...identities,
    });
  }

  let extraction: Record<string, string>;
  try {
    extraction = await deps.vision(input.image, movements);
  } catch (err) {
    return emptyResult({
      status: "uploaded",
      error: errorMessage(err),
      ...identities,
    });
  }

  const status: ScanStatus = stickerId ? "needs_review" : "unmatched";
  return {
    status,
    templateId,
    stickerId,
    stickerPayload,
    cells: parseCells(extraction),
    extraction,
    error: null,
    warnings: [],
  };
}
