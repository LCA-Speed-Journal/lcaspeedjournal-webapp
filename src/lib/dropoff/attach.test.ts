import { describe, expect, it } from "vitest";
import { attachDropoff, type DropoffAttempt } from "./attach";

type Row = {
  athlete_id: string;
  units: string;
  display_value: number;
  percent_change?: number;
  trend?: "up" | "neutral" | "down";
  session_initial?: number;
  dropoff_line?: number;
  attempts_above_line?: number;
  crossed_dropoff?: boolean;
};

describe("attachDropoff", () => {
  it("adds the line and leaves the last-session trend alone", () => {
    const rows: Row[] = [
      {
        athlete_id: "a1",
        units: "s",
        display_value: 1.7,
        percent_change: -2.4,
        trend: "up",
      },
    ];
    const attempts: DropoffAttempt[] = [
      { athleteId: "a1", id: "1", createdAt: "2026-10-28T15:01:00.000Z", displayValue: 1.7 },
      { athleteId: "a1", id: "2", createdAt: "2026-10-28T15:02:00.000Z", displayValue: 1.85 },
    ];
    const [row] = attachDropoff(rows, attempts, "time");
    expect(row.percent_change).toBe(-2.4);
    expect(row.trend).toBe("up");
    expect(row.display_value).toBe(1.7);
    expect(row.session_initial).toBe(1.7);
    expect(row.dropoff_line).toBe(1.8);
    expect(row.attempts_above_line).toBe(1);
    expect(row.crossed_dropoff).toBe(true);
  });

  it("leaves a row unchanged when that athlete has no attempts", () => {
    const rows: Row[] = [{ athlete_id: "a1", units: "in", display_value: 28 }];
    expect(attachDropoff(rows, [], "score")).toEqual(rows);
  });
});
