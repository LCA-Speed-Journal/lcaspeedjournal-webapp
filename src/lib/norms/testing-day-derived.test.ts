import { describe, it, expect } from "vitest";
import {
  mergeDerivedSprintColumns,
  pickBestMaxVelocityHits,
  pickBestTwentyYdHits,
} from "./testing-day-derived";
import { testingDayColumnKey } from "./testing-day";

const base = {
  first_name: "A",
  last_name: "B",
  gender: "M" as const,
};

describe("pickBestTwentyYdHits", () => {
  it("keeps the faster of standalone 20 and 40 0-20 split", () => {
    const hits = pickBestTwentyYdHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "0-20yd",
        display_value: 2.9,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "0-20yd",
        display_value: 2.75,
      },
      {
        ...base,
        athlete_id: "b",
        metric_key: "40yd_Dash",
        component: "0-40yd",
        display_value: 5.0,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ athlete_id: "a", display_value: 2.75 });
  });
});

describe("pickBestMaxVelocityHits", () => {
  it("converts fly splits to mph and keeps the fastest", () => {
    const hits = pickBestMaxVelocityHits([
      {
        ...base,
        athlete_id: "a",
        metric_key: "40yd_Dash",
        component: "20-40yd",
        display_value: 2.0,
      },
      {
        ...base,
        athlete_id: "a",
        metric_key: "20yd_Dash",
        component: "10-20yd",
        display_value: 1.2,
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].athlete_id).toBe("a");
    expect(hits[0].display_value).toBeCloseTo(20.45, 5);
  });
});

describe("mergeDerivedSprintColumns", () => {
  it("adds 20yd after 40yd and Max Velocity after the sprint pair", () => {
    const fortyKey = testingDayColumnKey("40yd_Dash", "0-40yd");
    const { columns, hitsByColumn } = mergeDerivedSprintColumns({
      columns: [
        {
          key: fortyKey,
          metric_key: "40yd_Dash",
          display_name: "40yd Dash",
          component: "0-40yd",
          units: "s",
          kind: "test",
        },
      ],
      hitsByColumn: {
        [fortyKey]: [
          {
            athlete_id: "a",
            first_name: "A",
            last_name: "B",
            gender: "M",
            display_value: 5.0,
          },
        ],
      },
      rawEntries: [
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "0-20yd",
          display_value: 2.8,
        },
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "40yd_Dash",
          component: "20-40yd",
          display_value: 2.1,
        },
      ],
    });

    expect(columns.map((c) => c.metric_key)).toEqual([
      "40yd_Dash",
      "20yd_Dash",
      "MaxVelocity",
    ]);
    const twentyKey = testingDayColumnKey("20yd_Dash", "0-20yd");
    const maxVKey = testingDayColumnKey("MaxVelocity", null);
    expect(hitsByColumn[twentyKey][0].display_value).toBe(2.8);
    expect(hitsByColumn[maxVKey][0].display_value).toBeCloseTo(40.9 / 2.1, 5);
  });

  it("keeps 20yd in preferred order when there is no 40yd column", () => {
    const vjKey = testingDayColumnKey("Vertical Jump", null);
    const agilityKey = testingDayColumnKey("5-10-5_Agility", null);
    const { columns } = mergeDerivedSprintColumns({
      columns: [
        {
          key: vjKey,
          metric_key: "Vertical Jump",
          display_name: "Vertical Jump",
          component: null,
          units: "in",
          kind: "test",
        },
        {
          key: agilityKey,
          metric_key: "5-10-5_Agility",
          display_name: "5-10-5",
          component: null,
          units: "s",
          kind: "test",
        },
      ],
      hitsByColumn: {
        [vjKey]: [
          {
            athlete_id: "a",
            first_name: "A",
            last_name: "B",
            gender: "M",
            display_value: 28,
          },
        ],
        [agilityKey]: [
          {
            athlete_id: "a",
            first_name: "A",
            last_name: "B",
            gender: "M",
            display_value: 4.4,
          },
        ],
      },
      rawEntries: [
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "20yd_Dash",
          component: "0-20yd",
          display_value: 2.8,
        },
        {
          athlete_id: "a",
          first_name: "A",
          last_name: "B",
          gender: "M",
          metric_key: "20yd_Dash",
          component: "10-20yd",
          display_value: 1.1,
        },
      ],
    });

    expect(columns.map((c) => c.metric_key)).toEqual([
      "Vertical Jump",
      "20yd_Dash",
      "MaxVelocity",
      "5-10-5_Agility",
    ]);
  });
});
