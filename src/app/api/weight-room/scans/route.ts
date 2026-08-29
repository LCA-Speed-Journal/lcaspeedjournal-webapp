import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { decodeQrFromImage, isScanImageMime, sniffImageMime } from "@/lib/weight-room/decode-qr-image";
import { extractCard } from "@/lib/weight-room/extract-card";
import { getTemplateWithMovements } from "@/lib/weight-room/insert-template";
import { extractCellsWithVision } from "@/lib/weight-room/openai-vision";
import { decodeWeightRoomPayload, encodeStickerPayload } from "@/lib/weight-room/qr-payload";
import type { ScanStatus } from "@/lib/weight-room/constants";
import type { CardScan } from "@/types/weight-room";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Under Vercel's ~4.5 MB function body limit (multipart wrapping uses the rest). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const FILE_FIELD = "file";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function logScanError(message: string, extra?: string): void {
  if (extra) {
    console.error("POST /api/weight-room/scans:", message, extra);
  } else {
    console.error("POST /api/weight-room/scans:", message);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Failed to process scan";
}

function serializeScan(row: Record<string, unknown>): CardScan & {
  first_name?: string | null;
  last_name?: string | null;
  template_title?: string | null;
} {
  const uploadedAt = row.uploaded_at;
  const scan: CardScan & {
    first_name?: string | null;
    last_name?: string | null;
    template_title?: string | null;
  } = {
    id: String(row.id),
    blob_url: String(row.blob_url),
    template_id: row.template_id == null ? null : String(row.template_id),
    athlete_id: row.athlete_id == null ? null : String(row.athlete_id),
    sticker_payload: row.sticker_payload == null ? null : String(row.sticker_payload),
    status: String(row.status) as ScanStatus,
    extraction: row.extraction ?? null,
    error: row.error == null ? null : String(row.error),
    uploaded_at:
      uploadedAt instanceof Date
        ? uploadedAt.toISOString()
        : String(uploadedAt ?? ""),
  };
  if ("first_name" in row) {
    scan.first_name = row.first_name == null ? null : String(row.first_name);
  }
  if ("last_name" in row) {
    scan.last_name = row.last_name == null ? null : String(row.last_name);
  }
  if ("template_title" in row) {
    scan.template_title =
      row.template_title == null ? null : String(row.template_title);
  }
  return scan;
}

function resolveMime(file: File, buffer: Buffer): string | null {
  const declared = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (isScanImageMime(declared)) return declared;
  return sniffImageMime(buffer);
}

export async function GET() {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await sql`
      SELECT
        cs.id,
        cs.blob_url,
        cs.template_id,
        cs.athlete_id,
        cs.sticker_payload,
        cs.status,
        cs.extraction,
        cs.error,
        cs.uploaded_at,
        a.first_name,
        a.last_name,
        t.title AS template_title
      FROM card_scans cs
      LEFT JOIN athletes a ON a.id = cs.athlete_id
      LEFT JOIN workout_templates t ON t.id = cs.template_id
      ORDER BY cs.uploaded_at DESC
      LIMIT 200
    `;
    return NextResponse.json({
      data: (rows as Record<string, unknown>[]).map(serializeScan),
    });
  } catch (err) {
    console.error("GET /api/weight-room/scans:", errorMessage(err));
    return NextResponse.json(
      { error: "Failed to fetch scans" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const rawFile = form.get(FILE_FIELD);
  if (!rawFile || !(rawFile instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (rawFile.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File must be 4 MB or smaller" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await rawFile.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File must be 4 MB or smaller" },
      { status: 400 }
    );
  }

  const mimeType = resolveMime(rawFile, buffer);
  if (!mimeType) {
    return NextResponse.json(
      { error: "File must be image/jpeg, image/png, or image/webp" },
      { status: 400 }
    );
  }

  const scanId = crypto.randomUUID();
  const pathname = `weight-room/scans/${scanId}${EXT_BY_MIME[mimeType]}`;

  let blobUrl: string;
  try {
    const blob = await put(pathname, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (err) {
    logScanError(errorMessage(err));
    return NextResponse.json(
      { error: "Failed to store scan image" },
      { status: 500 }
    );
  }

  let qrTexts: string[] = [];
  let decodeError: string | null = null;
  try {
    qrTexts = await decodeQrFromImage(buffer);
  } catch (err) {
    decodeError = errorMessage(err);
  }

  let templateIdFromQr: string | null = null;
  for (const text of qrTexts) {
    const decoded = decodeWeightRoomPayload(text);
    if (decoded?.kind === "template") {
      templateIdFromQr = decoded.id;
      break;
    }
  }

  let movements: { id: string; name: string; set_count: number }[] = [];
  let templateExists = false;
  let templateLookupError: string | null = null;
  if (templateIdFromQr) {
    try {
      const template = await getTemplateWithMovements(templateIdFromQr);
      if (template) {
        templateExists = true;
        movements = template.movements.map((m) => ({
          id: m.id,
          name: m.name,
          set_count: m.set_count,
        }));
      } else {
        templateLookupError = "template_not_found";
      }
    } catch (err) {
      templateLookupError = errorMessage(err);
      logScanError(templateLookupError, scanId);
    }
  }

  const extracted = await extractCard(
    { image: buffer, movements },
    {
      decodeQr: async () => {
        if (decodeError) throw new Error(decodeError);
        return qrTexts;
      },
      vision: async (image, movs) => extractCellsWithVision(image, movs, mimeType),
    }
  );

  let athleteId: string | null = null;
  let status = extracted.status;
  let scanError = extracted.error;
  if (templateLookupError) {
    status = "uploaded";
    scanError = templateLookupError;
  }
  const stickerPayload =
    extracted.stickerId != null
      ? encodeStickerPayload(extracted.stickerId)
      : extracted.stickerPayload;

  if (stickerPayload) {
    try {
      const { rows: stickerRows } = await sql`
        SELECT athlete_id
        FROM athlete_stickers
        WHERE payload = ${stickerPayload} AND active = true
        LIMIT 1
      `;
      if (stickerRows.length > 0) {
        athleteId = String((stickerRows[0] as { athlete_id: string }).athlete_id);
      } else if (status === "needs_review") {
        status = "unmatched";
      }
    } catch (err) {
      const message = errorMessage(err);
      logScanError(message, scanId);
      status = "uploaded";
      if (!scanError) scanError = message;
    }
  }

  const templateId = templateExists ? extracted.templateId : null;
  const extractionJson =
    extracted.error && Object.keys(extracted.extraction).length === 0
      ? null
      : JSON.stringify({
          cells: extracted.extraction,
          parsed: extracted.cells,
          warnings: extracted.warnings,
        });

  try {
    const { rows } = await sql`
      INSERT INTO card_scans (
        id, blob_url, template_id, athlete_id, sticker_payload, status, extraction, error
      )
      VALUES (
        ${scanId},
        ${blobUrl},
        ${templateId},
        ${athleteId},
        ${stickerPayload},
        ${status},
        ${extractionJson},
        ${scanError}
      )
      RETURNING
        id, blob_url, template_id, athlete_id, sticker_payload, status, extraction, error, uploaded_at
    `;
    return NextResponse.json({ data: serializeScan(rows[0] as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    logScanError(errorMessage(err), scanId);
    return NextResponse.json(
      { error: "Failed to save scan" },
      { status: 500 }
    );
  }
}
