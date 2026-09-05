import { SESSION_NOTE_KEY } from "./themes";

export const THEME_NOTE_MAX_CHARS = 500;

const THEME_GROUP_KEY_RE = /^[^|]*\|[MF]?$/;

export type ThemeNotesParseOk = { ok: true; value: Record<string, string> };
export type ThemeNotesParseErr = { ok: false; error: string };
export type ThemeNotesParseResult = ThemeNotesParseOk | ThemeNotesParseErr;

export function isThemeNoteKey(key: string): boolean {
  return key === SESSION_NOTE_KEY || THEME_GROUP_KEY_RE.test(key);
}

export function parseThemeNotesPatch(input: unknown): ThemeNotesParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "notes must be an object" };
  }

  const value: Record<string, string> = {};
  for (const [key, note] of Object.entries(input as Record<string, unknown>)) {
    if (!isThemeNoteKey(key)) {
      return { ok: false, error: `Unknown theme note key: ${key}` };
    }
    if (typeof note !== "string") {
      return { ok: false, error: "Theme notes must be strings" };
    }
    if (note.length > THEME_NOTE_MAX_CHARS) {
      return { ok: false, error: `Theme notes must be ${THEME_NOTE_MAX_CHARS} characters or fewer` };
    }
    value[key] = note;
  }

  return { ok: true, value };
}

export function mergeThemeNotes(
  existing: Record<string, string>,
  patch: Record<string, string>
): Record<string, string> {
  const merged = { ...existing };
  for (const [key, note] of Object.entries(patch)) {
    if (note === "") {
      delete merged[key];
    } else {
      merged[key] = note;
    }
  }
  return merged;
}

export function coerceThemeNotes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, note] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof note === "string") out[key] = note;
  }
  return out;
}
