/** Board keys that are weight-room maxes, not speed-journal entries. */
const TESTING_LIFT_MOVEMENTS: Record<string, string> = {
  "Bench-Press": "Bench Press",
  "Hex-Deadlift": "Hex Deadlift",
};

/** Canonical weight-room movement, or null when the key is not a testing lift. */
export function testingLiftMovement(key: string): string | null {
  return TESTING_LIFT_MOVEMENTS[key] ?? null;
}

export type StrengthMovement = {
  name: string;
  setCount: number;
  targets: readonly string[];
  block: "Main" | "Accessory";
  logged: "load" | "duration";
};

export const DAY_B_STRENGTH_MOVEMENTS: readonly StrengthMovement[] = [
  { name: "Bench Press", setCount: 1, targets: ["1"], block: "Main", logged: "load" },
  { name: "Hex Deadlift", setCount: 1, targets: ["1"], block: "Main", logged: "load" },
  { name: "ISO-Lunge", setCount: 2, targets: ["30s", "30s"], block: "Accessory", logged: "duration" },
  { name: "Spring Ankle", setCount: 2, targets: ["45s", "45s"], block: "Accessory", logged: "duration" },
  { name: "Copenhagens", setCount: 1, targets: ["45s"], block: "Accessory", logged: "duration" },
  { name: "Sprinter Bridging", setCount: 2, targets: ["30s", "30s"], block: "Accessory", logged: "duration" },
];

export function testingStrengthTitle(sessionDate: string): string {
  return `Testing Strength ${sessionDate}`;
}

export type DurationSet = {
  movementName: string;
  setIndex: number;
  seconds: number;
  rawText: string;
};

export function strengthDurationSets(): DurationSet[] {
  const sets: DurationSet[] = [];
  for (const movement of DAY_B_STRENGTH_MOVEMENTS) {
    if (movement.logged !== "duration") continue;
    movement.targets.forEach((target, setIndex) => {
      const match = /^(\d+)s$/.exec(target);
      if (!match) return;
      sets.push({
        movementName: movement.name,
        setIndex,
        seconds: Number(match[1]),
        rawText: target,
      });
    });
  }
  return sets;
}
