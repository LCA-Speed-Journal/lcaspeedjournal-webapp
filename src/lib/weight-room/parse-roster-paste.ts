export type ParsedRosterLine = {
  first_name: string;
  last_name: string;
  raw: string;
  error?: string;
};

export function parseRosterPaste(text: string): ParsedRosterLine[] {
  const out: ParsedRosterLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    if (raw.includes(",")) {
      const [last, ...rest] = raw.split(",");
      const first = rest.join(",").trim();
      const lastName = last.trim();
      if (!first || !lastName) {
        out.push({
          first_name: "",
          last_name: "",
          raw,
          error: "Could not split into first and last name",
        });
        continue;
      }
      out.push({ first_name: first, last_name: lastName, raw });
      continue;
    }
    const parts = raw.split(/\s+/);
    if (parts.length < 2) {
      out.push({
        first_name: "",
        last_name: "",
        raw,
        error: "Could not split into first and last name",
      });
      continue;
    }
    out.push({
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
      raw,
    });
  }
  return out;
}
