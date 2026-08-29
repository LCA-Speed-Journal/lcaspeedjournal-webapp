import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { extraSessionToDraft } from "./from-extra-json";
import {
  isIsoCalendarDate,
  isUuid,
  normalizeTargets,
  parseMovements,
  parseTemplatePatch,
  parseTemplatePayload,
  draftFromTemplate,
  templateFromCsv,
  templateFromDraft,
  validateCsvImportTemplates,
} from "./insert-template";
import type { CsvImportTemplate } from "./csv-import";

describe("isIsoCalendarDate", () => {
  it("accepts a real YYYY-MM-DD", () => {
    expect(isIsoCalendarDate("2026-09-08")).toBe(true);
  });

  it("rejects impossible calendar days and non-ISO strings", () => {
    expect(isIsoCalendarDate("2026-02-30")).toBe(false);
    expect(isIsoCalendarDate("09/08/2026")).toBe(false);
    expect(isIsoCalendarDate("")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts a UUID and rejects other strings", () => {
    expect(isUuid("2c1d3b4e-5f67-489a-ab0c-1d2e3f4a5b6c")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("normalizeTargets", () => {
  it("returns arrays as-is and parses JSONB strings", () => {
    expect(normalizeTargets(["5", "5"])).toEqual(["5", "5"]);
    expect(normalizeTargets('["5 @ RPE 8","5 @ RPE 8"]')).toEqual([
      "5 @ RPE 8",
      "5 @ RPE 8",
    ]);
  });
});

describe("parseMovements", () => {
  it("accepts a valid movement and fills sort_index from the array index", () => {
    const r = parseMovements([
      {
        name: "DB Bench",
        block: "Main",
        set_count: 2,
        targets: ["5 @ RPE 8", "5 @ RPE 8"],
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]).toMatchObject({
      sort_index: 0,
      name: "DB Bench",
      block: "Main",
      set_count: 2,
      from_pair: false,
    });
  });

  it("rejects when set_count does not match targets", () => {
    const r = parseMovements([
      { name: "Goblet", block: "Main", set_count: 2, targets: ["8"] },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("parseTemplatePayload", () => {
  it("requires hugo_group, session_date, focus, title, and movements", () => {
    const r = parseTemplatePayload({
      hugo_group: "soccer",
      session_date: "2026-09-08",
      focus: "Upper A",
      title: "Monday — Upper A",
      week_number: 1,
      day_name: "Monday",
      movements: [
        {
          name: "DB Bench",
          block: "Main",
          set_count: 1,
          targets: ["5"],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hugo_group).toBe("soccer");
    expect(r.value.session_date).toBe("2026-09-08");
  });

  it("rejects an unknown hugo_group", () => {
    const r = parseTemplatePayload({
      hugo_group: "lacrosse",
      session_date: "2026-09-08",
      focus: "Upper A",
      title: "Monday",
      movements: [],
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseTemplatePatch", () => {
  it("allows a partial title update", () => {
    const r = parseTemplatePatch({ title: "New title" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("New title");
    expect(r.value.movements).toBeUndefined();
  });

  it("allows week_number null", () => {
    const r = parseTemplatePatch({ week_number: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.week_number).toBeNull();
  });

  it("rejects an empty object", () => {
    const r = parseTemplatePatch({});
    expect(r.ok).toBe(false);
  });
});

function csvTemplate(
  overrides: Partial<CsvImportTemplate> = {}
): CsvImportTemplate {
  return {
    week_number: 1,
    day_name: "Monday",
    session_date: "2026-09-08",
    focus: "Upper A",
    hugo_group: "soccer",
    title: "Monday — Upper A",
    movements: [
      {
        sort_index: 0,
        label: "1",
        name: "DB Bench",
        block: "Main",
        set_count: 2,
        targets: ["5 @ RPE 8", "5 @ RPE 8"],
        notes: "",
      },
    ],
    ...overrides,
  };
}

describe("validateCsvImportTemplates", () => {
  it("keeps a valid template for insert", () => {
    const r = validateCsvImportTemplates([csvTemplate()]);
    expect(r.ok).toBe(true);
    expect(r.templates).toHaveLength(1);
    expect(r.errors).toEqual([]);
    expect(r.templates[0].session_date).toBe("2026-09-08");
  });

  it("does not insert an impossible date; returns a template error", () => {
    const r = validateCsvImportTemplates([
      csvTemplate({ session_date: "2026-02-30" }),
    ]);
    expect(r.ok).toBe(true);
    expect(r.templates).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/session_date must be YYYY-MM-DD/);
    expect(r.errors[0].message).toMatch(/2026-02-30/);
  });

  it("rejects empty movement name/block the same as JSON POST", () => {
    const r = validateCsvImportTemplates([
      csvTemplate({
        movements: [
          {
            sort_index: 0,
            label: "1",
            name: "",
            block: "",
            set_count: 1,
            targets: ["5"],
            notes: "",
          },
        ],
      }),
    ]);
    expect(r.templates).toHaveLength(0);
    expect(r.errors[0].message).toMatch(/name is required/);
  });

  it("inserts the valid template and errors the bad date in a mixed CSV", () => {
    const r = validateCsvImportTemplates([
      csvTemplate({ session_date: "2026-02-30", focus: "Bad Date" }),
      csvTemplate({ session_date: "2026-09-08", focus: "Upper A" }),
    ]);
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0].focus).toBe("Upper A");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Bad Date/);
  });

  it("skips templates with 0 movements without an error", () => {
    const r = validateCsvImportTemplates([csvTemplate({ movements: [] })]);
    expect(r.templates).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects negative set_count", () => {
    const r = validateCsvImportTemplates([
      csvTemplate({
        movements: [
          {
            sort_index: 0,
            label: "1",
            name: "DB Bench",
            block: "Main",
            set_count: -1,
            targets: [],
            notes: "",
          },
        ],
      }),
    ]);
    expect(r.templates).toHaveLength(0);
    expect(r.errors[0].message).toMatch(/set_count must be a non-negative integer/);
  });
});

describe("templateFromCsv / templateFromDraft", () => {
  it("maps CSV snake_case into insert input", () => {
    const csv: CsvImportTemplate = {
      week_number: 1,
      day_name: "Monday",
      session_date: "2026-09-08",
      focus: "Upper A",
      hugo_group: "extracurricular",
      title: "Monday — Upper A",
      movements: [
        {
          sort_index: 0,
          label: "1",
          name: "DB Bench",
          block: "Main",
          set_count: 2,
          targets: ["5 @ RPE 8", "5 @ RPE 8"],
          notes: "",
        },
      ],
    };
    expect(templateFromCsv(csv).movements[0].from_pair).toBe(false);
    expect(templateFromCsv(csv).hugo_group).toBe("extracurricular");
  });

  it("maps CardDraft camelCase including fromPair", () => {
    const draft = extraSessionToDraft({
      week: 1,
      week_title: "Intro",
      day: "Monday",
      day_title: "Upper A",
      movements: [
        {
          label: "3A",
          name: "DB Bench (Back-Offs)",
          block: "Main",
          set_count: 1,
          targets: ["6 @ RPE 8"],
          notes: "",
          from_pair: true,
        },
      ],
    });
    draft.sessionDate = "2026-09-08";
    const input = templateFromDraft(draft);
    expect(input.hugo_group).toBe("extracurricular");
    expect(input.movements[0]).toMatchObject({
      sort_index: 0,
      name: "DB Bench (Back-Offs)",
      set_count: 1,
      from_pair: true,
    });
  });

  it("draftFromTemplate maps snake_case from_pair and leaves exerciseHtml null", () => {
    const draft = extraSessionToDraft({
      week: 1,
      week_title: "Intro",
      day: "Monday",
      day_title: "Upper A",
      movements: [
        {
          label: "3A",
          name: "DB Bench (Back-Offs)",
          block: "Main",
          set_count: 1,
          targets: ["6 @ RPE 8"],
          notes: "pair",
          from_pair: true,
        },
      ],
    });
    draft.sessionDate = "2026-09-08";
    const roundTrip = draftFromTemplate({
      id: "11111111-1111-4111-8111-111111111111",
      hugo_group: "extracurricular",
      week_number: 1,
      day_name: "Monday",
      session_date: "2026-09-08",
      focus: "Upper A",
      title: draft.title,
      layout: "landscape-letter",
      created_at: "",
      movements: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          template_id: "11111111-1111-4111-8111-111111111111",
          sort_index: 0,
          label: "3A",
          name: "DB Bench (Back-Offs)",
          block: "Main",
          set_count: 1,
          targets: ["6 @ RPE 8"],
          notes: "pair",
          from_pair: true,
        },
      ],
    });
    expect(roundTrip.hugoGroup).toBe("extracurricular");
    expect(roundTrip.movements[0]).toMatchObject({
      label: "3A",
      setCount: 1,
      fromPair: true,
      exerciseHtml: null,
    });
  });
});
