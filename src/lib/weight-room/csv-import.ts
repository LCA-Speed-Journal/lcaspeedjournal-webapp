import { isHugoGroup, type HugoGroup } from "./constants";

const EXPECTED_HEADER =
  "week,day,session_date,focus,hugo_group,label,name,block,set_count,targets,notes";

export type CsvImportMovement = {
  sort_index: number;
  label: string;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string;
};

export type CsvImportTemplate = {
  week_number: number | null;
  day_name: string;
  session_date: string;
  focus: string;
  hugo_group: HugoGroup;
  title: string;
  movements: CsvImportMovement[];
};

export type CsvImportRowError = {
  row: number;
  message: string;
};

export type CsvImportResult =
  | { ok: true; templates: CsvImportTemplate[]; errors: CsvImportRowError[] }
  | { ok: false; error: string };

/** RFC-ish: commas inside quotes, and "" as a literal quote. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

function cell(cells: string[], index: number): string {
  return (cells[index] ?? "").trim();
}

function templateKey(group: string, date: string, focus: string): string {
  return `${group}\0${date}\0${focus}`;
}

export function parseWorkoutCsv(text: string): CsvImportResult {
  const lines = text.split(/\r?\n/);
  let headerRow = 0;
  while (headerRow < lines.length && lines[headerRow].trim() === "") {
    headerRow += 1;
  }

  if (headerRow >= lines.length || lines[headerRow].trim() !== EXPECTED_HEADER) {
    return { ok: false, error: "Missing or invalid CSV header" };
  }

  const templates: CsvImportTemplate[] = [];
  const indexByKey = new Map<string, number>();
  const errors: CsvImportRowError[] = [];

  for (let i = headerRow + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.trim() === "") continue;

    const row = i + 1;
    const cells = splitCsvLine(rawLine);
    const weekRaw = cell(cells, 0);
    const dayName = cell(cells, 1);
    const sessionDate = cell(cells, 2);
    const focus = cell(cells, 3);
    const hugoGroupRaw = cell(cells, 4);
    const label = cell(cells, 5);
    const name = cell(cells, 6);
    const block = cell(cells, 7);
    const setCountRaw = cell(cells, 8);
    const targetsRaw = cell(cells, 9);
    const notes = cell(cells, 10);

    if (!sessionDate) {
      errors.push({ row, message: "Missing session_date" });
      continue;
    }

    if (!isHugoGroup(hugoGroupRaw)) {
      errors.push({ row, message: `Unknown hugo_group: ${hugoGroupRaw}` });
      continue;
    }

    let weekNumber: number | null = null;
    if (weekRaw !== "") {
      const parsedWeek = Number.parseInt(weekRaw, 10);
      if (!Number.isInteger(parsedWeek) || String(parsedWeek) !== weekRaw) {
        errors.push({ row, message: `Invalid week: ${weekRaw}` });
        continue;
      }
      weekNumber = parsedWeek;
    }

    const setCount = Number.parseInt(setCountRaw, 10);
    if (!Number.isInteger(setCount) || String(setCount) !== setCountRaw) {
      errors.push({ row, message: `Invalid set_count: ${setCountRaw}` });
      continue;
    }

    const targets =
      setCount === 0 && targetsRaw === ""
        ? []
        : targetsRaw.split("|").map((t) => t.trim());

    if (targets.length !== setCount) {
      errors.push({
        row,
        message: `set_count ${setCount} does not match ${targets.length} target(s)`,
      });
      continue;
    }

    const key = templateKey(hugoGroupRaw, sessionDate, focus);
    let template = templates[indexByKey.get(key) ?? -1];
    if (!template) {
      template = {
        week_number: weekNumber,
        day_name: dayName,
        session_date: sessionDate,
        focus,
        hugo_group: hugoGroupRaw,
        title: `${dayName} — ${focus}`,
        movements: [],
      };
      indexByKey.set(key, templates.length);
      templates.push(template);
    }

    template.movements.push({
      sort_index: template.movements.length,
      label,
      name,
      block,
      set_count: setCount,
      targets,
      notes,
    });
  }

  return { ok: true, templates, errors };
}
