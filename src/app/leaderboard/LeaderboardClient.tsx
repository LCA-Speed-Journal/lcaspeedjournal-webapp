"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import useSWR from "swr";

/** Polling interval in ms when page is visible; 0 disables polling. */
const LIVE_LEADERBOARD_REFRESH_MS = 10000;

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    handler();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { PageBackground } from "@/app/components/PageBackground";
import type { LeaderboardRow, LeaderboardAnimationTrigger } from "@/types";
import type { SessionMetric, SessionMetricComponent } from "@/app/api/leaderboard/session-metrics/route";
import { formatLeaderboardName } from "@/lib/display-names";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { computeLeaderboardTriggers } from "./leaderboardDiff";
import { getLeaderboardSections } from "@/lib/leaderboard-sections";
import {
  applyTopNToSections,
  buildGenderColumnsFromSections,
  clampTopN,
  getGridClass,
} from "./displayModes";

type SessionItem = { id: string; session_date: string; phase?: string; phase_week?: number };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function rankClass(rank: number): string {
  if (rank === 1) return "bg-gold/20 text-gold border border-gold/50";
  if (rank === 2) return "bg-silver/20 text-silver border border-silver/50";
  if (rank === 3) return "bg-bronze/20 text-bronze border border-bronze/50";
  return "bg-surface border border-border text-foreground";
}

function componentKey(comp: SessionMetricComponent): string {
  return `${comp.interval_index ?? "n"}_${comp.component ?? "n"}`;
}

function buildLeaderboardUrl(
  sessionId: string,
  metricKey: string,
  component: SessionMetricComponent,
  groupByGender: boolean
): string {
  const params = new URLSearchParams({
    session_id: sessionId,
    metric: metricKey,
  });
  if (component.interval_index != null) {
    params.set("interval_index", String(component.interval_index));
  }
  if (component.component != null && component.component !== "") {
    params.set("component", component.component);
  }
  if (groupByGender) params.set("group_by", "gender");
  return `/api/leaderboard?${params.toString()}`;
}

export function LeaderboardClient() {
  const [sessionId, setSessionId] = useState("");
  const [groupByGender, setGroupByGender] = useState(false);
  const [splitByAlumni, setSplitByAlumni] = useState(false);
  const [topNEnabled, setTopNEnabled] = useState(false);
  const [topN, setTopN] = useState(10);
  const [wideMode, setWideMode] = useState(false);
  const [splitGenderColumns, setSplitGenderColumns] = useState(false);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());
  /** Per-metric set of selected component keys; default to first (Overall) when expanding */
  const [selectedComponentsByMetric, setSelectedComponentsByMetric] = useState<Record<string, Set<string>>>({});
  const [isPending, startTransition] = useTransition();
  const isVisible = usePageVisible();

  const { data: sessionsData } = useSWR<{ data: SessionItem[] }>("/api/sessions", fetcher);
  const sessions = sessionsData?.data ?? [];

  const sessionMetricsUrl =
    sessionId ? `/api/leaderboard/session-metrics?session_id=${encodeURIComponent(sessionId)}` : null;
  const { data: sessionMetricsData } = useSWR<{ data: { metrics: SessionMetric[] } }>(
    sessionMetricsUrl,
    fetcher,
    {
      refreshInterval: sessionId && isVisible ? LIVE_LEADERBOARD_REFRESH_MS : 0,
    }
  );
  const metrics = sessionMetricsData?.data?.metrics ?? [];

  const toggleMetric = (metricId: string, metric?: SessionMetric) => {
    startTransition(() => {
      setExpandedMetrics((prev) => {
        const next = new Set(prev);
        if (next.has(metricId)) {
          next.delete(metricId);
        } else {
          next.add(metricId);
          if (metric && metric.components.length > 0 && !selectedComponentsByMetric[metricId]?.size) {
            setSelectedComponentsByMetric((s) => ({
              ...s,
              [metricId]: new Set([componentKey(metric.components[0])]),
            }));
          }
        }
        return next;
      });
    });
  };

  const toggleComponent = (metricId: string, compKey: string, checked: boolean) => {
    startTransition(() => {
      setSelectedComponentsByMetric((s) => {
        const prev = s[metricId] ?? new Set<string>();
        const next = new Set(prev);
        if (checked) next.add(compKey);
        else next.delete(compKey);
        return { ...s, [metricId]: next };
      });
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className={`relative z-10 ${wideMode || splitGenderColumns ? "max-w-none" : "mx-auto max-w-4xl"}`}>
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <header className="mb-6 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Live leaderboard
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </header>

          <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground-muted">Session</span>
          <select
            value={sessionId}
            onChange={(e) => startTransition(() => setSessionId(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent"
          >
            <option value="">Select session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.session_date}
                {s.phase != null ? ` — ${s.phase}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={groupByGender}
            onChange={(e) =>
              startTransition(() => {
                const checked = e.target.checked;
                setGroupByGender(checked);
                if (!checked) setSplitGenderColumns(false);
              })
            }
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-foreground-muted">Group by gender</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={splitByAlumni}
            onChange={(e) => startTransition(() => setSplitByAlumni(e.target.checked))}
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-foreground-muted">Split alumni</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={topNEnabled}
            onChange={(e) => startTransition(() => setTopNEnabled(e.target.checked))}
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-foreground-muted">Top N</span>
        </label>
        {topNEnabled && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-muted">N</span>
            <input
              type="number"
              min={1}
              max={50}
              value={topN}
              onChange={(e) => startTransition(() => setTopN(clampTopN(Number(e.target.value))))}
              className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent"
            />
          </label>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={wideMode}
            onChange={(e) => startTransition(() => setWideMode(e.target.checked))}
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-foreground-muted">Wide mode</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={splitGenderColumns}
            disabled={!groupByGender}
            onChange={(e) => startTransition(() => setSplitGenderColumns(e.target.checked))}
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="text-sm text-foreground-muted">Split gender columns</span>
        </label>
      </section>

      {!sessionId ? (
        <p className="text-sm text-foreground-muted">
          Select a session to view metrics and leaderboards.
        </p>
      ) : sessionMetricsUrl && !sessionMetricsData ? (
        <p className="text-sm text-foreground-muted">Loading session metrics…</p>
      ) : metrics.length === 0 ? (
        <p className="text-sm text-foreground-muted">No metrics with entries for this session.</p>
      ) : (
        <div className="space-y-4">
          {(isPending && metrics.length > 0) && (
            <p className="mb-2 text-xs text-foreground-muted">Updating…</p>
          )}
          <ul className="space-y-2">
            {metrics.map((metric) => {
              const selectedSet = selectedComponentsByMetric[metric.metric_id] ?? new Set<string>();
              const selectedComponents = metric.components.filter((c) => selectedSet.has(componentKey(c)));
              return (
                <li key={metric.metric_id} className="rounded-lg border border-border bg-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMetric(metric.metric_id, metric)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-foreground hover:bg-surface-elevated transition-colors"
                  >
                    <span>
                      {metric.display_name}
                      <span className="ml-2 text-sm font-normal text-foreground-muted">
                        ({metric.units})
                      </span>
                    </span>
                    <span className="text-foreground-muted">
                      {expandedMetrics.has(metric.metric_id) ? "▼" : "▶"}
                    </span>
                  </button>
                  {expandedMetrics.has(metric.metric_id) && (
                    <div className="border-t border-border bg-surface-elevated px-4 py-3">
                      <p className="mb-2 text-sm font-medium text-foreground-muted">
                        Show leaderboard
                      </p>
                      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
                        {metric.components.map((comp) => {
                          const key = componentKey(comp);
                          const checked = selectedSet.has(key);
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleComponent(metric.metric_id, key, e.target.checked)}
                                  className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
                                />
                                {comp.label}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {selectedComponents.length > 0 ? (
                        <div className="space-y-6">
                          {selectedComponents.map((comp) => (
                            <ComponentLeaderboard
                              key={componentKey(comp)}
                              sessionId={sessionId}
                              metric={metric}
                              component={comp}
                              groupByGender={groupByGender}
                              splitByAlumni={splitByAlumni}
                              topNEnabled={topNEnabled}
                              topN={topN}
                              wideMode={wideMode}
                              splitGenderColumns={splitGenderColumns}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground-muted">
                          Select one or more leaderboards above.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function ComponentLeaderboard({
  sessionId,
  metric,
  component,
  groupByGender,
  splitByAlumni,
  topNEnabled,
  topN,
  wideMode,
  splitGenderColumns,
}: {
  sessionId: string;
  metric: SessionMetric;
  component: SessionMetricComponent;
  groupByGender: boolean;
  splitByAlumni: boolean;
  topNEnabled: boolean;
  topN: number;
  wideMode: boolean;
  splitGenderColumns: boolean;
}) {
  const url = buildLeaderboardUrl(sessionId, metric.metric_key, component, groupByGender);
  const isVisible = usePageVisible();
  const { data, error, isLoading, mutate } = useSWR<{
    data: {
      rows: LeaderboardRow[];
      male?: LeaderboardRow[];
      female?: LeaderboardRow[];
      metric_display_name: string;
      units: string;
    };
  }>(url, fetcher, {
    refreshInterval: isVisible ? LIVE_LEADERBOARD_REFRESH_MS : 0,
  });

  const prevDataRef = useRef<{
    rows: LeaderboardRow[];
    male: LeaderboardRow[];
    female: LeaderboardRow[];
  } | null>(null);
  const [triggerMap, setTriggerMap] = useState<Map<string, LeaderboardAnimationTrigger>>(new Map());
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (url !== lastUrlRef.current) {
      prevDataRef.current = null;
      lastUrlRef.current = url;
    }
    const payload = data?.data;
    if (!payload) return;
    const rows = payload.rows ?? [];
    const male = payload.male ?? [];
    const female = payload.female ?? [];
    if (prevDataRef.current === null) {
      prevDataRef.current = { rows, male, female };
      return;
    }
    const showGrouped = groupByGender && (male.length > 0 || female.length > 0);
    let merged: Map<string, LeaderboardAnimationTrigger>;
    if (showGrouped) {
      merged = new Map(computeLeaderboardTriggers(prevDataRef.current.male, male));
      for (const [id, t] of computeLeaderboardTriggers(prevDataRef.current.female, female)) {
        merged.set(id, t);
      }
    } else {
      merged = computeLeaderboardTriggers(prevDataRef.current.rows, rows);
    }
    setTriggerMap(merged);
    prevDataRef.current = { rows, male, female };
    if (clearTimeoutRef.current != null) clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = setTimeout(() => {
      setTriggerMap(new Map());
      clearTimeoutRef.current = null;
    }, 2000);
    return () => {
      if (clearTimeoutRef.current != null) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
  }, [data, url, groupByGender]);

  const rows = data?.data?.rows ?? [];
  const male = data?.data?.male ?? [];
  const female = data?.data?.female ?? [];
  const defaultUnits = data?.data?.units ?? metric.units;
  const showGrouped = groupByGender && (male.length > 0 || female.length > 0);
  const baseSections = getLeaderboardSections({
    rows,
    male,
    female,
    groupByGender,
    splitByAlumni,
  });
  const sections = applyTopNToSections(baseSections, topN, topNEnabled);
  const gridClass = getGridClass({ wideMode });
  const splitColumnsActive = splitGenderColumns && showGrouped;
  const compactNames = splitColumnsActive && wideMode;
  const splitColumnSections = buildGenderColumnsFromSections(sections);
  const reducedMotion = useReducedMotion();

  return (
    <div className="mt-2">
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {component.label}
      </h3>
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-danger">Failed to load leaderboard.</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface"
          >
            Retry
          </button>
        </div>
      )}
      {isLoading && rows.length === 0 && (
        <p className="text-sm text-foreground-muted">Loading…</p>
      )}
      {!error && !isLoading && rows.length === 0 && (
        <p className="text-sm text-foreground-muted">No entries.</p>
      )}
      {!error && (rows.length > 0 || (isLoading && rows.length > 0)) && (
        <>
          {splitColumnsActive ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-foreground-muted">Boys</p>
                {splitColumnSections.boys.length > 0 ? (
                  <div className="space-y-4">
                    {splitColumnSections.boys.map((section) => (
                      <div key={`boys-${section.title || "all"}`}>
                        {section.title ? (
                          <p className="mb-2 text-xs font-medium text-foreground-muted">{section.title}</p>
                        ) : null}
                        <motion.div layout={!reducedMotion} className={gridClass}>
                          {section.rows.map((r, i) => (
                            <LeaderboardCard
                              key={r.athlete_id}
                              row={r}
                              units={r.units ?? defaultUnits}
                              animationTrigger={triggerMap.get(r.athlete_id) ?? null}
                              displayRank={i + 1}
                              forceCompactName={compactNames}
                            />
                          ))}
                        </motion.div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">No boys entries.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-foreground-muted">Girls</p>
                {splitColumnSections.girls.length > 0 ? (
                  <div className="space-y-4">
                    {splitColumnSections.girls.map((section) => (
                      <div key={`girls-${section.title || "all"}`}>
                        {section.title ? (
                          <p className="mb-2 text-xs font-medium text-foreground-muted">{section.title}</p>
                        ) : null}
                        <motion.div layout={!reducedMotion} className={gridClass}>
                          {section.rows.map((r, i) => (
                            <LeaderboardCard
                              key={r.athlete_id}
                              row={r}
                              units={r.units ?? defaultUnits}
                              animationTrigger={triggerMap.get(r.athlete_id) ?? null}
                              displayRank={i + 1}
                              forceCompactName={compactNames}
                            />
                          ))}
                        </motion.div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">No girls entries.</p>
                )}
              </div>
            </div>
          ) : sections.length === 1 && sections[0].title === "" ? (
            <motion.div layout={!reducedMotion} className={gridClass}>
              {sections[0].rows.map((r) => (
                <LeaderboardCard
                  key={r.athlete_id}
                  row={r}
                  units={r.units ?? defaultUnits}
                  animationTrigger={triggerMap.get(r.athlete_id) ?? null}
                  forceCompactName={compactNames}
                />
              ))}
            </motion.div>
          ) : (
            <div className="space-y-4">
              {sections.map((section) => (
                <div key={section.title}>
                  <p className="mb-2 text-xs font-medium text-foreground-muted">{section.title}</p>
                  <motion.div layout={!reducedMotion} className={gridClass}>
                    {section.rows.map((r, i) => (
                      <LeaderboardCard
                        key={r.athlete_id}
                        row={r}
                        units={r.units ?? defaultUnits}
                        animationTrigger={triggerMap.get(r.athlete_id) ?? null}
                        displayRank={i + 1}
                        forceCompactName={compactNames}
                      />
                    ))}
                  </motion.div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const CARD_TRANSITION = { duration: 0.35, ease: [0, 0, 0.2, 1] as const };
const CARD_TRANSITION_FAST = { duration: 0.25, ease: [0, 0, 0.2, 1] as const };

function getCardVariants(reducedMotion: boolean): Record<string, { initial?: object; animate?: object; transition?: object }> {
  const idleState = { opacity: 1, y: 0, scale: 1 };
  if (reducedMotion) {
    return {
      idle: { initial: idleState, animate: idleState },
      "new-entry": { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } },
      "new-entry-top-three": { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } },
      "new-top-three": { initial: idleState, animate: idleState },
      "new-pb": { initial: idleState, animate: idleState },
      "new-sb": { initial: idleState, animate: idleState },
      "value-updated": { initial: idleState, animate: idleState },
    };
  }
  return {
    idle: { initial: idleState, animate: idleState },
    "new-entry": {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      transition: CARD_TRANSITION,
    },
    "new-entry-top-three": {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0, scale: 1.03 },
      transition: { duration: 0.45, ease: [0, 0, 0.2, 1] },
    },
    "new-top-three": {
      initial: { scale: 1 },
      animate: { scale: [1, 1.03, 1] },
      transition: { duration: 0.5, ease: [0, 0, 0.2, 1] },
    },
    "new-pb": {
      initial: { scale: 1 },
      animate: { scale: [1, 1.03, 1] },
      transition: { duration: 0.4, ease: [0, 0, 0.2, 1] },
    },
    "new-sb": {
      initial: { opacity: 1 },
      animate: { opacity: [1, 0.85, 1] },
      transition: { duration: 0.4, ease: [0, 0, 0.2, 1] },
    },
    "value-updated": {
      initial: { scale: 1 },
      animate: { scale: [1, 1.02, 1] },
      transition: CARD_TRANSITION_FAST,
    },
  };
}

function LeaderboardCard({
  row,
  units,
  animationTrigger = null,
  displayRank,
  forceCompactName = false,
}: {
  row: LeaderboardRow;
  units: string;
  animationTrigger?: LeaderboardAnimationTrigger | null;
  displayRank?: number;
  forceCompactName?: boolean;
}) {
  const rank = displayRank ?? row.rank;
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const variants = getCardVariants(reducedMotion ?? false);
  const hasComparison = row.trend != null && row.percent_change != null;
  const pillLabel = hasComparison
    ? formatPillAriaLabel(row.trend!, row.percent_change!)
    : undefined;
  const pillTitle = row.previous_session_date
    ? `vs ${formatSessionDateForTooltip(row.previous_session_date)}`
    : undefined;
  const variantKey = animationTrigger ?? "idle";
  const fullName = `${row.first_name} ${row.last_name}`.trim();
  const displayName = formatLeaderboardName(
    row.first_name,
    row.last_name,
    row.athlete_type,
    isMobile || forceCompactName
  );

  return (
    <motion.div
      layout
      className={`relative flex flex-col rounded-lg border p-3 ${rankClass(rank)}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
      initial={variantKey}
      animate={variantKey}
      variants={variants}
    >
      <span className="absolute right-2 top-2 text-xs font-mono tabular-nums text-foreground-muted">
        #{rank}
      </span>
      <span
        className={`min-h-0 min-w-0 pr-8 truncate text-base font-semibold leading-tight ${rank === 1 ? "text-gold-text" : ""}`}
        title={displayName !== fullName ? fullName : undefined}
      >
        {displayName}
      </span>
      <span
        className={`mt-2 font-mono text-lg font-semibold tabular-nums ${rank === 1 ? "text-gold-text" : ""}`}
      >
        {formatValue(row.display_value)} <span className="text-sm font-normal text-foreground-muted">{units}</span>
      </span>
      <div className="mt-2 flex items-center justify-between">
        <span className="min-w-0">
          {row.best_type === "pb" && (
            <span
              className="inline-block px-2 py-0.5 rounded-full border text-xs font-semibold bg-pb-bg text-pb-text border-pb-border"
              title="Personal best"
              aria-label="Personal best"
            >
              PB
            </span>
          )}
          {row.best_type === "sb" && (
            <span
              className="inline-block px-2 py-0.5 rounded-full border text-xs font-semibold bg-foreground-muted/20 text-foreground-muted border-border"
              title="Season best"
              aria-label="Season best"
            >
              SB
            </span>
          )}
        </span>
        {hasComparison && (
          <span
            className={`font-mono text-xs tabular-nums px-2 py-0.5 rounded-full border shrink-0 ${pillClass(row.trend!)}`}
            title={pillTitle}
            aria-label={pillLabel}
          >
            {formatPillContent(row.trend!, row.percent_change!)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function pillClass(trend: "up" | "neutral" | "down"): string {
  if (trend === "up") return "bg-success/20 text-success border-success/50";
  if (trend === "down") return "bg-danger/20 text-danger border-danger/50";
  return "bg-foreground-muted/15 text-foreground-muted border-border";
}

function formatPillContent(trend: "up" | "neutral" | "down", percentChange: number): string {
  const abs = Math.abs(percentChange).toFixed(1);
  if (trend === "up") return `↑ ${abs}%`;
  if (trend === "down") return `↓ ${abs}%`;
  return "−";
}

function formatPillAriaLabel(trend: "up" | "neutral" | "down", percentChange: number): string {
  const abs = Math.abs(percentChange).toFixed(1);
  if (trend === "up") return `${abs}% better than last session`;
  if (trend === "down") return `${abs}% worse than last session`;
  return "About the same as last session";
}

function formatSessionDateForTooltip(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T12:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
