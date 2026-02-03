/**
 * Team Overview API - GET.
 * Returns aggregated stats for active athletes only.
 * Used by TeamOverviewDashboard.
 */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getMetricsRegistry } from "@/lib/parser";
import { getMaxVelocityKey, getVelocityMetricKeys, hasVelocityMetrics } from "@/lib/velocity-metrics";

export async function GET() {
  try {
    // Active athlete IDs (table may lack active column)
    let activeIds: { id: string }[] = [];
    try {
      const q = await sql`
        SELECT id FROM athletes WHERE active = true
      `;
      activeIds = q.rows as { id: string }[];
    } catch {
      const q = await sql`SELECT id FROM athletes`;
      activeIds = q.rows as { id: string }[];
    }

    const ids = activeIds.map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({
        data: {
          active_count: 0,
          event_group_distribution: [],
          team_pr_leaders: [],
          archetype_distribution: { rsi_type: [], sprint_archetype: [] },
          common_superpowers: [],
          common_kryptonite: [],
          recent_notes: [],
        },
      });
    }

    // Event group distribution (active athletes only)
    let eventGroupDist: { event_group_id: string; name: string; count: string }[] = [];
    try {
      const q = await sql`
        SELECT eg.id AS event_group_id, eg.name, COUNT(aeg.athlete_id)::text AS count
        FROM event_groups eg
        LEFT JOIN athlete_event_groups aeg ON aeg.event_group_id = eg.id AND aeg.athlete_id = ANY(${ids})
        GROUP BY eg.id, eg.name, eg.display_order
        ORDER BY eg.display_order, eg.name
      `;
      eventGroupDist = q.rows as { event_group_id: string; name: string; count: string }[];
    } catch {
      // event_groups / athlete_event_groups may not exist
    }

    // Team PR leaders: best value per metric across active athletes, with athlete name
    const registry = getMetricsRegistry();
    const velocityKeys = hasVelocityMetrics() ? getVelocityMetricKeys() : [];
    const maxVelKey = getMaxVelocityKey();
    const teamPrLeaders: {
      metric_key: string;
      display_name: string;
      units: string;
      best_value: number;
      athlete_id: string;
      first_name: string;
      last_name: string;
    }[] = [];

    try {
      const entriesRows = await sql`
        SELECT e.athlete_id, e.metric_key, MIN(e.display_value) AS min_val, MAX(e.display_value) AS max_val, MAX(e.units) AS units
        FROM entries e
        WHERE e.athlete_id = ANY(${ids})
        GROUP BY e.athlete_id, e.metric_key
      `;
      const entries = entriesRows.rows as {
        athlete_id: string;
        metric_key: string;
        min_val: string;
        max_val: string;
        units: string;
      }[];

      const athletesRows = await sql`
        SELECT id, first_name, last_name FROM athletes WHERE id = ANY(${ids})
      `;
      const athletesMap = new Map(
        (athletesRows.rows as { id: string; first_name: string; last_name: string }[]).map((a) => [a.id, a])
      );

      const byMetric = new Map<
        string,
        { value: number; athlete_id: string; units: string; lower_is_better: boolean }
      >();
      let maxVelocityValue: number | null = null;
      let maxVelocityAthleteId: string | null = null;

      for (const r of entries) {
        const def = registry[r.metric_key];
        const units = (def?.display_units ?? r.units ?? "").toLowerCase();
        const lowerIsBetter = units === "s";
        const value = lowerIsBetter ? Number(r.min_val) : Number(r.max_val);

        if (velocityKeys.includes(r.metric_key)) {
          const v = Number(r.max_val);
          if (maxVelocityValue === null || v > maxVelocityValue) {
            maxVelocityValue = v;
            maxVelocityAthleteId = r.athlete_id;
          }
        }

        const key = r.metric_key;
        const existing = byMetric.get(key);
        if (!existing) {
          byMetric.set(key, {
            value,
            athlete_id: r.athlete_id,
            units: def?.display_units ?? r.units ?? "",
            lower_is_better: lowerIsBetter,
          });
        } else {
          const better =
            lowerIsBetter ? value < existing.value : value > existing.value;
          if (better) {
            byMetric.set(key, {
              value,
              athlete_id: r.athlete_id,
              units: def?.display_units ?? r.units ?? "",
              lower_is_better: lowerIsBetter,
            });
          }
        }
      }

      for (const [metric_key, v] of byMetric) {
        const def = registry[metric_key];
        const athlete = athletesMap.get(v.athlete_id);
        if (!athlete) continue;
        teamPrLeaders.push({
          metric_key,
          display_name: def?.display_name ?? metric_key,
          units: v.units,
          best_value: v.value,
          athlete_id: v.athlete_id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
        });
      }
      if (
        hasVelocityMetrics() &&
        maxVelocityValue !== null &&
        maxVelocityAthleteId &&
        !byMetric.has(maxVelKey)
      ) {
        const athlete = athletesMap.get(maxVelocityAthleteId);
        if (athlete) {
          teamPrLeaders.push({
            metric_key: maxVelKey,
            display_name: "Max Velocity",
            units: "mph",
            best_value: maxVelocityValue,
            athlete_id: maxVelocityAthleteId,
            first_name: athlete.first_name,
            last_name: athlete.last_name,
          });
        }
      }
      teamPrLeaders.sort((a, b) => a.display_name.localeCompare(b.display_name));
    } catch {
      // entries or athletes query may fail
    }

    // Archetype distribution
    let rsiCounts: { rsi_type: string; count: string }[] = [];
    let sprintCounts: { sprint_archetype: string; count: string }[] = [];
    try {
      const archRows = await sql`
        SELECT rsi_type, sprint_archetype
        FROM athlete_archetypes
        WHERE athlete_id = ANY(${ids})
      `;
      const arch = archRows.rows as { rsi_type: string | null; sprint_archetype: string | null }[];
      const rsiMap = new Map<string, number>();
      const sprintMap = new Map<string, number>();
      for (const a of arch) {
        if (a.rsi_type && a.rsi_type !== "unset") {
          rsiMap.set(a.rsi_type, (rsiMap.get(a.rsi_type) ?? 0) + 1);
        }
        if (a.sprint_archetype && a.sprint_archetype !== "unset") {
          sprintMap.set(a.sprint_archetype, (sprintMap.get(a.sprint_archetype) ?? 0) + 1);
        }
      }
      rsiCounts = [...rsiMap.entries()].map(([rsi_type, count]) => ({ rsi_type, count: String(count) }));
      sprintCounts = [...sprintMap.entries()].map(([sprint_archetype, count]) => ({
        sprint_archetype,
        count: String(count),
      }));
    } catch {
      // athlete_archetypes may not exist
    }

    // Common superpowers (label or custom_text, count)
    let commonSuperpowers: { label: string; count: number }[] = [];
    try {
      const spRows = await sql`
        SELECT COALESCE(sp.label, ak.custom_text) AS label
        FROM athlete_superpowers ak
        LEFT JOIN superpower_presets sp ON sp.id = ak.preset_id
        WHERE ak.athlete_id = ANY(${ids})
          AND (sp.label IS NOT NULL OR ak.custom_text IS NOT NULL)
      `;
      const counts = new Map<string, number>();
      for (const r of spRows.rows as { label: string }[]) {
        const label = r.label?.trim() ?? "";
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      commonSuperpowers = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      // tables may not exist
    }

    // Common kryptonite
    let commonKryptonite: { label: string; count: number }[] = [];
    try {
      const krRows = await sql`
        SELECT COALESCE(kp.label, ak.custom_text) AS label
        FROM athlete_kryptonite ak
        LEFT JOIN kryptonite_presets kp ON kp.id = ak.preset_id
        WHERE ak.athlete_id = ANY(${ids})
          AND (kp.label IS NOT NULL OR ak.custom_text IS NOT NULL)
      `;
      const counts = new Map<string, number>();
      for (const r of krRows.rows as { label: string }[]) {
        const label = r.label?.trim() ?? "";
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      commonKryptonite = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      // tables may not exist
    }

    // Recent notes (active athletes only)
    let recentNotes: {
      athlete_id: string;
      first_name: string;
      last_name: string;
      note_preview: string;
      created_at: string;
    }[] = [];
    try {
      const notesRows = await sql`
        SELECT n.athlete_id, n.note_text, n.created_at, a.first_name, a.last_name
        FROM athlete_notes n
        JOIN athletes a ON a.id = n.athlete_id
        WHERE n.athlete_id = ANY(${ids})
        ORDER BY n.created_at DESC
        LIMIT 10
      `;
      recentNotes = (notesRows.rows as {
        athlete_id: string;
        note_text: string;
        created_at: string;
        first_name: string;
        last_name: string;
      }[]).map((n) => ({
        athlete_id: n.athlete_id,
        first_name: n.first_name,
        last_name: n.last_name,
        note_preview: n.note_text.length > 120 ? n.note_text.slice(0, 120) + "…" : n.note_text,
        created_at: n.created_at,
      }));
    } catch {
      // athlete_notes may not exist
    }

    return NextResponse.json({
      data: {
        active_count: ids.length,
        event_group_distribution: eventGroupDist.map((r) => ({
          event_group_id: r.event_group_id,
          name: r.name,
          count: Number(r.count),
        })),
        team_pr_leaders: teamPrLeaders,
        archetype_distribution: { rsi_type: rsiCounts, sprint_archetype: sprintCounts },
        common_superpowers: commonSuperpowers,
        common_kryptonite: commonKryptonite,
        recent_notes: recentNotes,
      },
    });
  } catch (err) {
    console.error("GET /api/team-overview:", err);
    return NextResponse.json(
      { error: "Failed to fetch team overview" },
      { status: 500 }
    );
  }
}
