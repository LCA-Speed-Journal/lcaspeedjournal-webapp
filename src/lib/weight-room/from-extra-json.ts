import type { CardDraft, CardMovement } from "./types";

export type ExtraMovementJson = {
  label: string;
  name: string;
  block: string;
  set_count: number;
  targets: string[];
  notes: string;
  from_pair?: boolean;
  exercise_html?: string | null;
  cluster_pct_targets?: boolean;
};

export type ExtraSessionJson = {
  week: number;
  week_title: string;
  day: string;
  day_title: string;
  day_type?: string;
  warmup_notes?: string;
  max_sets?: number;
  movements: ExtraMovementJson[];
};

const WEEKDAY_OFFSET: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
};

function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapMovement(m: ExtraMovementJson): CardMovement {
  return {
    label: m.label ?? "",
    name: m.name,
    block: m.block,
    setCount: m.set_count,
    targets: [...m.targets],
    notes: m.notes ?? "",
    fromPair: Boolean(m.from_pair),
    exerciseHtml: m.exercise_html ?? null,
  };
}

export function extraSessionToDraft(session: ExtraSessionJson): CardDraft {
  return {
    hugoGroup: "extracurricular",
    weekNumber: session.week,
    dayName: session.day,
    sessionDate: "",
    focus: session.day_title,
    title: `Week ${session.week} (${session.week_title}) — ${session.day} — ${session.day_title}`,
    movements: session.movements.map(mapMovement),
  };
}

export function assignTermDates(
  drafts: CardDraft[],
  termStartMonday: string
): CardDraft[] {
  return drafts.map((draft) => {
    const week = draft.weekNumber ?? 1;
    const offset =
      (week - 1) * 7 + (WEEKDAY_OFFSET[draft.dayName.toLowerCase()] ?? 0);
    return { ...draft, sessionDate: addUtcDays(termStartMonday, offset) };
  });
}
