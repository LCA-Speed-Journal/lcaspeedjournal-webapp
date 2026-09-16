import type { HugoGroup } from "@/lib/weight-room/constants";
import { displayedTestKeys } from "./headlines";
import { aggregateTestSeries, athleteTestDeltas, listAvailableExtraMetrics } from "./test-aggregate";
import { aggregateLiftSeries, athleteLiftDeltas } from "./lift-aggregate";
import { aggregateIsoRocks } from "./iso-rocks";
import { aggregateAthleteF2f } from "./f2f-aggregate";
import {
  loadTeamProgressF2fEntries,
  loadTeamProgressIsoTemplates,
  loadTeamProgressLiftRows,
  loadTeamProgressRoster,
  loadTeamProgressTestEntries,
} from "./load";

export type TeamProgressPayload = {
  hugo_group: HugoGroup;
  from: string;
  to: string;
  roster_count: number;
  athletes_with_tests: number;
  tests: ReturnType<typeof aggregateTestSeries>;
  available_extra_metrics: string[];
  lifts: ReturnType<typeof aggregateLiftSeries>;
  iso_rocks: ReturnType<typeof aggregateIsoRocks>;
  f2f: ReturnType<typeof aggregateAthleteF2f>;
  athletes: Array<{
    id: string;
    first_name: string;
    last_name: string;
    gender: string | null;
    tests: Record<
      string,
      { first: number; last: number; delta: number } | undefined
    >;
    lifts: Record<
      string,
      { first: number; last: number; delta: number } | undefined
    >;
  }>;
};

export async function buildTeamProgressPayload(opts: {
  hugoGroup: HugoGroup;
  from: string;
  to: string;
  addedMetrics?: string[];
  f2fMode?: "latest" | "best";
}): Promise<TeamProgressPayload> {
  const addedMetrics = opts.addedMetrics ?? [];
  const f2fMode = opts.f2fMode === "best" ? "best" : "latest";
  const roster = await loadTeamProgressRoster(opts.hugoGroup);
  const athleteIds = roster.map((a) => a.id);

  const [testRows, liftRows, isoRows, f2fEntries] = await Promise.all([
    loadTeamProgressTestEntries({
      athleteIds,
      from: opts.from,
      to: opts.to,
    }),
    loadTeamProgressLiftRows({
      hugoGroup: opts.hugoGroup,
      from: opts.from,
      to: opts.to,
    }),
    loadTeamProgressIsoTemplates({
      hugoGroup: opts.hugoGroup,
      from: opts.from,
      to: opts.to,
    }),
    loadTeamProgressF2fEntries({
      athleteIds,
      from: opts.from,
      to: opts.to,
    }),
  ]);

  const metricKeys = displayedTestKeys(opts.hugoGroup, addedMetrics);
  // If group never ran 40 but ran 20, surface 20yd as core fallback when no 40 data
  const has40 = testRows.some(
    (r) => r.metric_key === "40yd_Dash" && r.component === "0-40yd"
  );
  const has20 = testRows.some(
    (r) => r.metric_key === "20yd_Dash" && r.component === "0-20yd"
  );
  const usedTwentyFallback = !has40 && has20;
  const keys = metricKeys.flatMap((k) => {
    if (k === "40yd_Dash" && usedTwentyFallback) return ["20yd_Dash"];
    return [k];
  });

  const tests = aggregateTestSeries({
    rows: testRows,
    metricKeys: keys,
    hugoGroup: opts.hugoGroup,
    addedMetrics,
    minN: 3,
  })
    .filter((t) => t.points.length > 0)
    .map((t) =>
      t.metric_key === "20yd_Dash" && usedTwentyFallback
        ? { ...t, source: "core" as const }
        : t
    );

  const shownKeys = new Set(tests.map((t) => t.metric_key));
  const available_extra_metrics = listAvailableExtraMetrics(
    testRows,
    opts.hugoGroup,
    addedMetrics
  ).filter((k) => !shownKeys.has(k));

  const lifts = aggregateLiftSeries(liftRows, 2);
  const iso_rocks = aggregateIsoRocks(isoRows);
  const f2f = aggregateAthleteF2f({
    athletes: roster,
    entries: f2fEntries,
    endMode: f2fMode,
  });

  const athletesWithTests = new Set(testRows.map((r) => r.athlete_id));

  const athletes = roster.map((a) => {
    const testDeltas: Record<
      string,
      { first: number; last: number; delta: number } | undefined
    > = {};
    for (const t of tests) {
      const map = athleteTestDeltas(testRows, t.metric_key, t.lower_is_better);
      const d = map.get(a.id);
      if (d) testDeltas[t.metric_key] = d;
    }
    const liftDeltas: Record<
      string,
      { first: number; last: number; delta: number } | undefined
    > = {};
    for (const lift of lifts) {
      const map = athleteLiftDeltas(liftRows, lift.lift_id);
      const d = map.get(a.id);
      if (d) liftDeltas[lift.lift_id] = d;
    }
    return {
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      gender: a.gender,
      tests: testDeltas,
      lifts: liftDeltas,
    };
  });

  return {
    hugo_group: opts.hugoGroup,
    from: opts.from,
    to: opts.to,
    roster_count: roster.length,
    athletes_with_tests: athletesWithTests.size,
    tests,
    available_extra_metrics,
    lifts,
    iso_rocks,
    f2f,
    athletes,
  };
}
