export type StrengthPattern =
  | "squat"
  | "hinge"
  | "single_leg"
  | "press"
  | "pull"
  | "power";

export type StrengthParent = "squat" | "bench" | "clean";

export type ExerciseRatio = {
  name: string;
  parent: StrengthParent;
  ratio: number;
  pattern: StrengthPattern;
  aliases: readonly string[];
};

type ExerciseSeed = {
  name: string;
  ratio: number;
  aliases?: readonly string[];
};

function rows(
  pattern: StrengthPattern,
  parent: StrengthParent,
  seeds: readonly ExerciseSeed[]
): ExerciseRatio[] {
  return seeds.map((seed) => ({
    name: seed.name,
    parent,
    ratio: seed.ratio,
    pattern,
    aliases: seed.aliases ?? [],
  }));
}

export const EXERCISES: readonly ExerciseRatio[] = [
  ...rows("squat", "squat", [
    { name: "Back Squat", ratio: 1 },
    { name: "Front Squat", ratio: 0.8 },
    { name: "Goblet Squat", ratio: 0.64, aliases: ["DB Goblet Squat"] },
    { name: "Rack squat", ratio: 1.2 },
    { name: "Safety Squat", ratio: 1.33 },
    { name: "Sport Back Squat", ratio: 1 },
    { name: "Leg Press", ratio: 1.5 },
  ]),
  ...rows("hinge", "squat", [
    { name: "Hex Deadlift", ratio: 1.15, aliases: ["Trap-Bar Deadlift", "Trap Bar Deadlift"] },
    { name: "Deadlift", ratio: 1.2 },
    { name: "Straight Leg DL", ratio: 0.65 },
    {
      name: "RDL",
      ratio: 0.75,
      aliases: ["BB RDL", "Romanian Deadlift", "Deficit RDL", "BB Deficit RDL", "B-Stance RDL"],
    },
    { name: "RDL Shrug", ratio: 0.75 },
    { name: "DB RDL", ratio: 0.33, aliases: ["DB B-Stance RDL"] },
    { name: "DB RDL Shrug", ratio: 0.33 },
    { name: "DB RDL InLine", ratio: 0.33 },
  ]),
  ...rows("single_leg", "squat", [
    {
      name: "DB Split Squat",
      ratio: 0.5,
      aliases: ["Split Squat", "Split-Squat", "Bulgarian Split-Squat", "Bulgarian Split Squat"],
    },
    {
      name: "Lunge",
      ratio: 0.4,
      aliases: [
        "Forward-to-Reverse Lunge",
        "DB Forward-to-Reverse Lunge",
        "DB Reverse Lunge",
        "Reverse Lunge",
        "Walking Lunge",
        "DB Walking Lunge",
      ],
    },
    { name: "Step up", ratio: 0.5 },
    { name: "Front Step Up", ratio: 0.4 },
    { name: "DB Step up", ratio: 0.3, aliases: ["DB Step-Up"] },
    { name: "SL Squat", ratio: 0.45 },
  ]),
  ...rows("press", "bench", [
    { name: "Bench Press", ratio: 1, aliases: ["BB Bench", "Bench"] },
    { name: "Incline Bench", ratio: 0.8 },
    { name: "DB Bench", ratio: 0.35, aliases: ["DB Bench Press"] },
    { name: "DB Incline Bench", ratio: 0.3 },
    { name: "DB Shoulder Press", ratio: 0.25, aliases: ["Seated DB Shoulder Press"] },
    { name: "Arnold Press", ratio: 0.2 },
    { name: "Close Grip Bench", ratio: 0.8 },
    { name: "Dips", ratio: 0.8 },
    { name: "JM Press", ratio: 0.6 },
    { name: "JM DB Press", ratio: 0.3 },
  ]),
  ...rows("pull", "bench", [
    { name: "Lat Pull Down", ratio: 0.75, aliases: ["Pulldown", "Pull-Up/Pulldown"] },
    { name: "BB BO Row", ratio: 0.65, aliases: ["Row"] },
    { name: "DB BO Row", ratio: 0.35, aliases: ["1-Arm DB Row"] },
    { name: "DB Prone Row", ratio: 0.35 },
    { name: "Pull Up", ratio: 0.6 },
    { name: "Chin Up", ratio: 0.6 },
    { name: "Lat Pull Supine", ratio: 0.55 },
    { name: "Lat Pull Chin Grip", ratio: 0.75 },
    { name: "Squat Lat Row", ratio: 0.55 },
    { name: "SA Lat Pull Down", ratio: 0.35 },
  ]),
  ...rows("power", "clean", [
    { name: "Power Clean", ratio: 1 },
    { name: "Clean", ratio: 0.9 },
    { name: "Clean & Jerk", ratio: 0.7 },
    { name: "Jerk", ratio: 0.7 },
    { name: "Push Press", ratio: 0.65 },
    { name: "Snatch", ratio: 0.7 },
    { name: "Power Snatch", ratio: 0.7 },
    { name: "Hang Snatch", ratio: 0.7 },
    { name: "DB Hang Clean", ratio: 0.5 },
    { name: "DB Push Press", ratio: 0.35, aliases: ["DB Push-Press"] },
    { name: "DB Jerk", ratio: 0.35 },
    { name: "DB Hang Snatch", ratio: 0.25 },
    { name: "DB Clean & Jerk", ratio: 0.4 },
    { name: "Clean Pulls", ratio: 1.25 },
    { name: "SA Snatch", ratio: 0.25 },
  ]),
];

const PATTERN_REFERENCE_NAME: Record<StrengthPattern, string> = {
  squat: "Back Squat",
  hinge: "Hex Deadlift",
  single_leg: "DB Split Squat",
  press: "Bench Press",
  pull: "Lat Pull Down",
  power: "Power Clean",
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One logged forward-to-reverse rep is a forward lunge plus a reverse lunge. */
export function isForwardToReverseLunge(name: string): boolean {
  const key = normalizeName(name);
  return key.includes("forward") && key.includes("reverse") && key.includes("lunge");
}

/** Exact normalized equality so a short alias cannot match a longer card name. */
const BY_NORMALIZED_NAME = new Map<string, ExerciseRatio>();

for (const exercise of EXERCISES) {
  for (const label of [exercise.name, ...exercise.aliases]) {
    const key = normalizeName(label);
    const existing = BY_NORMALIZED_NAME.get(key);
    if (existing && existing !== exercise) {
      throw new Error(`Exercise name "${key}" maps to both ${existing.name} and ${exercise.name}`);
    }
    BY_NORMALIZED_NAME.set(key, exercise);
  }
}

export function lookupExercise(name: string): ExerciseRatio | null {
  return BY_NORMALIZED_NAME.get(normalizeName(name)) ?? null;
}

export function patternReference(pattern: StrengthPattern): ExerciseRatio {
  const name = PATTERN_REFERENCE_NAME[pattern];
  const exercise = EXERCISES.find((row) => row.name === name);
  if (!exercise) {
    throw new Error(`Missing pattern reference for ${pattern}`);
  }
  return exercise;
}
