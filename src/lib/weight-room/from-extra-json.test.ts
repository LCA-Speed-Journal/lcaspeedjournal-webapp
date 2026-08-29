import { describe, it, expect } from "vitest";
import extraSessions from "./extracurricular-sessions.json";
import { extraSessionToDraft, assignTermDates } from "./from-extra-json";

const monday = {
  week: 1,
  week_title: "Intro",
  day: "Monday",
  day_title: "Upper A",
  day_type: "upper",
  warmup_notes: "",
  max_sets: 2,
  movements: [
    {
      label: "1",
      name: "DB Bench",
      block: "Main",
      set_count: 2,
      targets: ["5 @ RPE 8", "5 @ RPE 8"],
      notes: "Normal",
      from_pair: false,
      exercise_html: null,
      cluster_pct_targets: false,
    },
  ],
};

describe("extraSessionToDraft", () => {
  it("maps extra JSON session to a card draft", () => {
    const d = extraSessionToDraft(monday);
    expect(d.hugoGroup).toBe("extracurricular");
    expect(d.weekNumber).toBe(1);
    expect(d.dayName).toBe("Monday");
    expect(d.focus).toBe("Upper A");
    expect(d.title).toContain("Week 1");
    expect(d.title).toContain("Monday");
    expect(d.movements[0]).toMatchObject({
      name: "DB Bench",
      setCount: 2,
      targets: ["5 @ RPE 8", "5 @ RPE 8"],
      notes: "Normal",
    });
  });
});

describe("assignTermDates", () => {
  it("sets week 1 Monday to term start and Friday +4 days", () => {
    const drafts = [
      extraSessionToDraft(monday),
      extraSessionToDraft({ ...monday, day: "Friday", day_title: "Total" }),
    ];
    const dated = assignTermDates(drafts, "2026-09-08");
    expect(dated[0].sessionDate).toBe("2026-09-08");
    expect(dated[1].sessionDate).toBe("2026-09-12");
  });

  it("adds 7 days per extra week", () => {
    const week2Mon = extraSessionToDraft({ ...monday, week: 2 });
    const dated = assignTermDates([week2Mon], "2026-09-08");
    expect(dated[0].sessionDate).toBe("2026-09-15");
  });
});

describe("extracurricular JSON fixture", () => {
  it("contains 50 sessions and maps Week 1 Monday", () => {
    expect(extraSessions).toHaveLength(50);
    const w1m = extraSessions.find((s) => s.week === 1 && s.day === "Monday");
    expect(w1m).toBeTruthy();
    const d = extraSessionToDraft(w1m!);
    expect(d.movements.length).toBeGreaterThan(4);
    expect(d.movements.some((m) => /bench/i.test(m.name))).toBe(true);
  });
});
