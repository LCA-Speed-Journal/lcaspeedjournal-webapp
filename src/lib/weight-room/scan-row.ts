import { sql } from "@/lib/db";
import type { ScanStatus } from "@/lib/weight-room/constants";
import type { ScanListRow } from "@/types/weight-room";

export function serializeScan(row: Record<string, unknown>): ScanListRow {
  const uploadedAt = row.uploaded_at;
  const scan: ScanListRow = {
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

export async function loadScanRow(id: string): Promise<Record<string, unknown> | null> {
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
    WHERE cs.id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as Record<string, unknown>;
}

export async function sessionLogExists(
  athleteId: string | null,
  templateId: string | null
): Promise<boolean> {
  if (!athleteId || !templateId) return false;
  const { rows } = await sql`
    SELECT 1 FROM session_logs
    WHERE athlete_id = ${athleteId} AND template_id = ${templateId}
    LIMIT 1
  `;
  return rows.length > 0;
}
