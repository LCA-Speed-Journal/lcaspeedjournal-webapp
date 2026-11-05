import type { BatteryMark } from "./score-row";

export type SampleAthlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
};

export type SampleDriMark = { box: string; value: number };

export type SampleRosterMarks = {
  marks: BatteryMark[];
  dri: Map<string, SampleDriMark[]>;
  qualifiers: Map<string, string>;
};

const QUALIFIERS = ["reactive", "compliant", "stiff", "developing"] as const;

function hashId(athleteId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < athleteId.length; index++) {
    hash ^= athleteId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(hash: number, salt: number): number {
  return (Math.imul(hash ^ salt, 2246822519) >>> 0) / 4294967296;
}

function spread(hash: number, salt: number, min: number, max: number): number {
  return Math.round((min + unit(hash, salt) * (max - min)) * 100) / 100;
}

function driMarks(hash: number): SampleDriMark[] {
  const boxes: SampleDriMark[] = [
    { box: "6", value: spread(hash, 11, 0.7, 1.5) },
    { box: "12", value: spread(hash, 12, 1.4, 2.9) },
    { box: "18", value: spread(hash, 13, 0.9, 2.1) },
    { box: "24", value: spread(hash, 14, 0.4, 1.5) },
  ];
  if (hash % 11 === 0) {
    return boxes.map((mark) => {
      if (mark.box === "18") return { box: "18", value: 2.6 };
      if (mark.box === "12") return { box: "12", value: 1.5 };
      return mark;
    });
  }
  if (hash % 13 === 0) {
    return boxes
      .filter((mark) => mark.box !== "12")
      .map((mark) => (mark.box === "18" ? { box: "18", value: 2.4 } : mark));
  }
  if (hash % 15 === 0) {
    return boxes.map((mark) => (mark.box === "12" ? { box: "12", value: 0.42 } : mark));
  }
  if (hash % 21 === 0) {
    return boxes.map((mark) => (mark.box === "12" ? { box: "12", value: 3.15 } : mark));
  }
  return boxes;
}

/**
 * Deterministic marks for the athletes already on the roster.
 * The same id always gets the same marks, and nothing here is written.
 */
export function sampleMarksForRoster(athletes: SampleAthlete[]): SampleRosterMarks {
  const marks: BatteryMark[] = [];
  const dri = new Map<string, SampleDriMark[]>();
  const qualifiers = new Map<string, string>();

  for (const athlete of athletes) {
    const hash = hashId(athlete.athlete_id);
    if (hash % 8 === 0) continue;

    const rsi = hash % 9 === 1 ? 2.1 : spread(hash, 1, 1.15, 2.8);
    marks.push({ athlete_id: athlete.athlete_id, key: "10-5_RSI", value: rsi });
    qualifiers.set(athlete.athlete_id, QUALIFIERS[hash % QUALIFIERS.length]);

    if (hash % 6 !== 1) {
      marks.push({ athlete_id: athlete.athlete_id, key: "20yd_Dash", value: spread(hash, 2, 2.7, 3.35) });
    }
    marks.push({
      athlete_id: athlete.athlete_id,
      key: "40yd_Dash",
      value: hash % 10 === 2 ? 5.05 : spread(hash, 3, 4.7, 5.6),
    });
    marks.push({ athlete_id: athlete.athlete_id, key: "MaxVelocity", value: spread(hash, 4, 16.5, 21.5) });
    dri.set(athlete.athlete_id, driMarks(hash));

    if (hash % 6 !== 2) {
      marks.push({
        athlete_id: athlete.athlete_id,
        key: "Standing-Broad",
        value: spread(hash, 5, 6.8, 9.4),
      });
      marks.push({
        athlete_id: athlete.athlete_id,
        key: "Vertical Jump",
        value: spread(hash, 6, 18, 34),
      });
    }
    marks.push({ athlete_id: athlete.athlete_id, key: "OH-MB_Throw", value: spread(hash, 7, 22, 42) });

    if (hash % 6 !== 3) {
      const best = spread(hash, 8, 1.75, 2.25);
      marks.push(
        { athlete_id: athlete.athlete_id, key: "10x10m_best", value: best },
        { athlete_id: athlete.athlete_id, key: "10x10m_mean", value: Math.round(best * 1.06 * 100) / 100 },
        { athlete_id: athlete.athlete_id, key: "10x10m_decrement", value: spread(hash, 9, 3, 14) }
      );
    }
  }

  return { marks, dri, qualifiers };
}
