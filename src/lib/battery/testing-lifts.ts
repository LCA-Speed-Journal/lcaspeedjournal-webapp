/** Board keys that are weight-room maxes, not speed-journal entries. */
const TESTING_LIFT_MOVEMENTS: Record<string, string> = {
  "Bench-Press": "Bench Press",
  "Hex-Deadlift": "Hex Deadlift",
};

/** Canonical weight-room movement, or null when the key is not a testing lift. */
export function testingLiftMovement(key: string): string | null {
  return TESTING_LIFT_MOVEMENTS[key] ?? null;
}
