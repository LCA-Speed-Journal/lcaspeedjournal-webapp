"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ProgressionPoint } from "@/types";
import { speedJournalSchoolYearRange } from "@/lib/team-progress/date-presets";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";

const ProgressionChart = dynamic(
  () => import("@/app/historical/ProgressionChart").then((m) => m.default),
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type FlagItem = {
  id: string;
  flag_type: "system" | "coach";
  title: string;
  description?: string | null;
  created_at?: string;
  resolved_at?: string | null;
};

type TestSeries = {
  metric_key: string;
  display_name: string;
  units: string;
  points: ProgressionPoint[];
};

type LiftSeries = {
  lift_id: string;
  label: string;
  units: "lb";
  points: ProgressionPoint[];
};

type BundleData = {
  from: string;
  to: string;
  hugo_primary: string | null;
  tests: TestSeries[];
  lifts: LiftSeries[];
};

type ProgressionFlagsSectionProps = {
  athleteId: string;
};

export function ProgressionFlagsSection({ athleteId }: ProgressionFlagsSectionProps) {
  const [range] = useState(speedJournalSchoolYearRange);
  const from = range.from;
  const to = range.to;

  const { data: flagsData, mutate: mutateFlags } = useSWR<{
    data: FlagItem[];
    stored: FlagItem[];
    system: FlagItem[];
  }>(`/api/athletes/${athleteId}/flags`, fetcher);

  const bundleUrl = useMemo(() => {
    if (!athleteId) return null;
    return `/api/athletes/${athleteId}/dashboard-progression?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [athleteId, from, to]);

  const { data: bundleRes } = useSWR<{ data: BundleData }>(bundleUrl, fetcher);

  const [newFlagTitle, setNewFlagTitle] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const flags = flagsData?.data ?? [];
  const activeFlags = flags.filter((f) => !f.resolved_at);
  const bundle = bundleRes?.data;
  const tests = bundle?.tests ?? [];
  const lifts = bundle?.lifts ?? [];
  const sportLabel = bundle?.hugo_primary
    ? HUGO_GROUP_META[bundle.hugo_primary as HugoGroup]?.label ??
      bundle.hugo_primary
    : null;

  async function handleAddFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!newFlagTitle.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newFlagTitle.trim(),
          description: newFlagDesc.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to add flag");
        return;
      }
      setNewFlagTitle("");
      setNewFlagDesc("");
      mutateFlags();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(flagId: string) {
    if (flagId.startsWith("system-")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag_id: flagId, resolved: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to resolve flag");
        return;
      }
      mutateFlags();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Progression & Flags
      </h3>

      <div className="mb-6 space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          {sportLabel
            ? `Primary metrics for ${sportLabel} plus squat / press / hinge`
            : "Primary metrics plus squat / press / hinge"}{" "}
          · {from} → {to}
        </p>
        {tests.length === 0 && lifts.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No test or lift marks in this window.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tests.map((t) => (
              <div
                key={t.metric_key}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {t.display_name}
                  </span>
                  <Link
                    href={`/historical?athlete_id=${athleteId}&metric=${encodeURIComponent(t.metric_key)}&from=${from}&to=${to}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Full chart
                  </Link>
                </div>
                <div className="h-44 w-full overflow-hidden rounded">
                  <ProgressionChart
                    points={t.points}
                    metricDisplayName={t.display_name}
                    units={t.units}
                  />
                </div>
              </div>
            ))}
            {lifts.map((lift) => (
              <div
                key={lift.lift_id}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {lift.label}
                  </span>
                </div>
                <div className="h-44 w-full overflow-hidden rounded">
                  <ProgressionChart
                    points={lift.points}
                    metricDisplayName={lift.label}
                    units={lift.units}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Flags
        </p>
        {activeFlags.length === 0 && (
          <p className="text-sm text-foreground-muted">No active flags.</p>
        )}
        <ul className="mb-4 space-y-2">
          {activeFlags.map((f) => (
            <li
              key={f.id}
              className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 ${
                f.flag_type === "system"
                  ? "border-accent/30 bg-accent/5"
                  : "border-border bg-surface"
              }`}
            >
              <div>
                <span className="text-xs font-medium text-foreground-muted">
                  {f.flag_type === "system" ? "System" : "Coach"}
                </span>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                {f.description && (
                  <p className="text-xs text-foreground-muted">
                    {f.description}
                  </p>
                )}
              </div>
              {f.flag_type === "coach" && !f.resolved_at && (
                <button
                  type="button"
                  onClick={() => handleResolve(f.id)}
                  disabled={loading}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-elevated disabled:opacity-50"
                >
                  Resolve
                </button>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={handleAddFlag} className="space-y-2">
          <input
            type="text"
            value={newFlagTitle}
            onChange={(e) => setNewFlagTitle(e.target.value)}
            placeholder="Add coach flag (title)"
            className="w-full min-h-[36px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={newFlagDesc}
            onChange={(e) => setNewFlagDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full min-h-[32px] rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !newFlagTitle.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
          >
            Add flag
          </button>
        </form>
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
