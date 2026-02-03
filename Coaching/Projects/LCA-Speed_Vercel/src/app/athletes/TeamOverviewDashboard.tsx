"use client";

/**
 * TeamOverviewDashboard - Phase E: real team-level data.
 * Shows event-group distribution, team PR leaders, archetype distribution,
 * common superpowers/kryptonite, and recent coach notes for active athletes.
 */
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TeamOverviewData = {
  active_count: number;
  event_group_distribution: { event_group_id: string; name: string; count: number }[];
  team_pr_leaders: {
    metric_key: string;
    display_name: string;
    units: string;
    best_value: number;
    athlete_id: string;
    first_name: string;
    last_name: string;
  }[];
  archetype_distribution: {
    rsi_type: { rsi_type: string; count: string }[];
    sprint_archetype: { sprint_archetype: string; count: string }[];
  };
  common_superpowers: { label: string; count: number }[];
  common_kryptonite: { label: string; count: number }[];
  recent_notes: {
    athlete_id: string;
    first_name: string;
    last_name: string;
    note_preview: string;
    created_at: string;
  }[];
};

export function TeamOverviewDashboard() {
  const { data, error, isLoading } = useSWR<{ data: TeamOverviewData }>(
    "/api/team-overview",
    fetcher
  );

  const overview = data?.data;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-foreground-muted">Loading team overview...</p>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-2xl border-2 border-danger/50 bg-danger/5 p-6 text-center">
          <p className="text-danger">
            {error ? "Failed to load team overview" : "No data"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <header className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
          <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
          <h2 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
            Team Overview
          </h2>
          <p className="text-sm text-foreground-muted">
            {overview.active_count} active athlete
            {overview.active_count !== 1 ? "s" : ""} on the roster
          </p>
        </header>

        {/* Event group distribution */}
        <section className="rounded-xl border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-lg font-semibold text-foreground">
            Event group distribution
          </h3>
          {overview.event_group_distribution.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No event groups assigned yet. Use Manage Event Groups to add
              groups and assign athletes.
            </p>
          ) : (
            <ul className="space-y-2">
              {overview.event_group_distribution.map((eg) => (
                <li
                  key={eg.event_group_id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground">
                    {eg.name}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {eg.count} athlete{eg.count !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Team PR leaders */}
        <section className="rounded-xl border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-lg font-semibold text-foreground">
            Team PR leaders
          </h3>
          {overview.team_pr_leaders.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No metric data yet. Enter session data to see team leaders per
              metric.
            </p>
          ) : (
            <ul className="space-y-2">
              {overview.team_pr_leaders.map((pr) => (
                <li
                  key={pr.metric_key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground">
                    {pr.display_name}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {pr.first_name} {pr.last_name} — {pr.best_value} {pr.units}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Archetype distribution */}
        <section className="rounded-xl border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-lg font-semibold text-foreground">
            Archetype distribution
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                RSI type
              </p>
              {overview.archetype_distribution.rsi_type.length === 0 ? (
                <p className="text-sm text-foreground-muted">No RSI types set</p>
              ) : (
                <ul className="space-y-1">
                  {overview.archetype_distribution.rsi_type.map((r) => (
                    <li
                      key={r.rsi_type}
                      className="text-sm text-foreground"
                    >
                      {r.rsi_type}: {r.count}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                Sprint archetype
              </p>
              {overview.archetype_distribution.sprint_archetype.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No sprint archetypes set
                </p>
              ) : (
                <ul className="space-y-1">
                  {overview.archetype_distribution.sprint_archetype.map((s) => (
                    <li
                      key={s.sprint_archetype}
                      className="text-sm text-foreground"
                    >
                      {s.sprint_archetype}: {s.count}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Common superpowers & kryptonite */}
        <section className="rounded-xl border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-lg font-semibold text-foreground">
            Common superpowers & kryptonite
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                Superpowers
              </p>
              {overview.common_superpowers.length === 0 ? (
                <p className="text-sm text-foreground-muted">None assigned</p>
              ) : (
                <ul className="space-y-1">
                  {overview.common_superpowers.map((s) => (
                    <li key={s.label} className="text-sm text-foreground">
                      {s.label} ({s.count})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                Kryptonite
              </p>
              {overview.common_kryptonite.length === 0 ? (
                <p className="text-sm text-foreground-muted">None assigned</p>
              ) : (
                <ul className="space-y-1">
                  {overview.common_kryptonite.map((k) => (
                    <li key={k.label} className="text-sm text-foreground">
                      {k.label} ({k.count})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Recent notes */}
        <section className="rounded-xl border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-lg font-semibold text-foreground">
            Recent coach notes
          </h3>
          {overview.recent_notes.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No coach notes yet across the team.
            </p>
          ) : (
            <ul className="space-y-3">
              {overview.recent_notes.map((n) => (
                <li
                  key={`${n.athlete_id}-${n.created_at}`}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <p className="text-xs font-medium text-foreground-muted">
                    {n.first_name} {n.last_name} •{" "}
                    {new Date(n.created_at).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {n.note_preview}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-foreground-muted">
          Select an athlete from the roster to view their individual dashboard
        </p>
    </div>
  );
}
