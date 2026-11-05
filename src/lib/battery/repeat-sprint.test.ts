import { describe, expect, it } from "vitest";
import { latestRepeatSeriesTimes, scoreRepeatSprint, type RepeatSeriesRep } from "./repeat-sprint";

describe("scoreRepeatSprint", () => {
  it("scores a full set of ten", () => {
    const times = [1.7, ...Array(9).fill(1.9)];
    const scored = scoreRepeatSprint(times);
    expect(scored).not.toBeNull();
    expect(scored!.best).toBeCloseTo(1.7);
    expect(scored!.mean).toBeCloseTo(1.88);
    expect(scored!.decrement).toBeCloseTo(10.588, 2);
  });

  it("returns null until all ten reps exist", () => {
    expect(scoreRepeatSprint([1.7, 1.8])).toBeNull();
  });

  it("scores ten identical reps as zero decrement", () => {
    const scored = scoreRepeatSprint(Array(10).fill(1.8));
    expect(scored!.decrement).toBeCloseTo(0);
  });
});

describe("latestRepeatSeriesTimes", () => {
  it("uses the later 10x10 series and does not blend a too-fast typo", () => {
    const rows: RepeatSeriesRep[] = [];
    for (let interval = 1; interval <= 10; interval += 1) {
      rows.push({
        athlete_id: "a",
        raw_input: "2,2,2,2,2,2,2,2,2,2",
        interval_index: interval,
        value: 2,
        created_at: 1_000,
      });
      rows.push({
        athlete_id: "a",
        raw_input: "1.70,1.80,1.80,1.80,1.80,1.80,1.80,1.80,1.80,1.80",
        interval_index: interval,
        value: interval === 1 ? 1.7 : 1.8,
        created_at: 2_000,
      });
    }
    rows.push({
      athlete_id: "a",
      raw_input: "1.40,2,2,2,2,2,2,2,2,2",
      interval_index: 1,
      value: 1.4,
      created_at: 500,
    });
    for (let interval = 2; interval <= 10; interval += 1) {
      rows.push({
        athlete_id: "a",
        raw_input: "1.40,2,2,2,2,2,2,2,2,2",
        interval_index: interval,
        value: 2,
        created_at: 500,
      });
    }

    const times = latestRepeatSeriesTimes(rows).get("a");
    expect(times).toEqual([1.7, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8]);
    expect(scoreRepeatSprint(times ?? [])!.best).toBe(1.7);
    expect(times).not.toContain(2);
    expect(times).not.toContain(1.4);
  });
});
