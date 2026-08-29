import OpenAI from "openai";
import type { ExtractCardMovement } from "./extract-card";

const VISION_TIMEOUT_MS = 45_000;

function knownCellKeys(movements: ExtractCardMovement[]): Set<string> {
  const keys = new Set<string>();
  for (const m of movements) {
    for (let i = 0; i < m.set_count; i++) {
      keys.add(`${m.id}:${i}`);
    }
  }
  return keys;
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
    else if (raw == null) out[key] = "";
    else if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = String(raw);
    }
  }
  return out;
}

function parseVisionJson(text: string): Record<string, string> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") return {};
  const rec = parsed as Record<string, unknown>;
  if (rec.cells && typeof rec.cells === "object") {
    return asStringMap(rec.cells);
  }
  return asStringMap(parsed);
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; message?: string };
  if (e.name === "APIConnectionTimeoutError" || e.name === "APIUserAbortError") {
    return true;
  }
  if (e.code === "ETIMEDOUT" || e.code === "ABORT_ERR") return true;
  return typeof e.message === "string" && /timeout/i.test(e.message);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "vision_failed";
}

/**
 * Structured JSON map of `movementId:setIndex` → handwritten text.
 * Never log the image or data URL.
 */
export async function extractCellsWithVision(
  image: Buffer,
  movements: ExtractCardMovement[],
  mimeType: string
): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const allowed = knownCellKeys(movements);
  const movementLines = movements
    .map(
      (m) =>
        `- ${m.name} (id ${m.id}): set indexes 0..${Math.max(0, m.set_count - 1)} (${m.set_count} sets)`
    )
    .join("\n");

  const prompt = `You are reading a photo of a handwritten weight-room workout card.
Return JSON with a "cells" object. Keys MUST be exactly movementId:setIndex (setIndex is 0-based).
Only fill these known boxes:
${movementLines || "(none)"}

Each value is the handwritten load×reps (or BW / AMRAP / inches) in that box, e.g. "185x5".
Omit empty boxes or use an empty string. Do not invent values you cannot read.
Example: {"cells":{"${movements[0]?.id ?? "id"}:0":"185x5"}}`;

  const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const client = new OpenAI({
    apiKey,
    timeout: VISION_TIMEOUT_MS,
    maxRetries: 0,
  });

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const raw = parseVisionJson(text);
    const cells: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (allowed.has(key)) cells[key] = value;
    }
    return cells;
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error("vision timeout");
    }
    throw new Error(errorMessage(err));
  }
}
