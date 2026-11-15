export type ParsedRosterLine = {
  first_name: string;
  last_name: string;
  raw: string;
  grade: number | null;
  error?: string;
};

const GRADE_TOKENS = new Set(["9", "10", "11", "12"]);

function gradeFromToken(token: string): number | null {
  const trimmed = token.trim();
  if (!GRADE_TOKENS.has(trimmed)) return null;
  return Number(trimmed);
}

function unparsed(raw: string): ParsedRosterLine {
  return {
    first_name: "",
    last_name: "",
    raw,
    grade: null,
    error: "Could not split into first and last name",
  };
}

export function parseRosterPaste(text: string): ParsedRosterLine[] {
  const out: ParsedRosterLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    if (raw.includes(",")) {
      const [last, ...rest] = raw.split(",");
      let grade: number | null = null;
      let firstParts = rest;
      if (rest.length >= 2) {
        const parsedGrade = gradeFromToken(rest[rest.length - 1]);
        if (parsedGrade != null) {
          grade = parsedGrade;
          firstParts = rest.slice(0, -1);
        }
      }
      const first = firstParts.join(",").trim();
      const lastName = last.trim();
      if (!first || !lastName) {
        out.push(unparsed(raw));
        continue;
      }
      out.push({ first_name: first, last_name: lastName, raw, grade });
      continue;
    }
    const parts = raw.split(/\s+/);
    if (parts.length < 2) {
      out.push(unparsed(raw));
      continue;
    }
    out.push({
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
      raw,
      grade: null,
    });
  }
  return out;
}
