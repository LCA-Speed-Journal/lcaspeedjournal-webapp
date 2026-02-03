"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ProgressionPoint } from "@/types";

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

type ProgressionFlagsSectionProps = {
  athleteId: string;
};

function useProgression(athleteId: string, metric: string | null) {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const url =
    metric && athleteId
      ? `/api/progression?athlete_id=${encodeURIComponent(athleteId)}&metric=${encodeURIComponent(metric)}&from=${from}&to=${to}`
      : null;
  return useSWR<{ data: { points?: ProgressionPoint[]; metric_display_name: string; units: string } }>(
    url,
    fetcher
  );
}

export function ProgressionFlagsSection({ athleteId }: ProgressionFlagsSectionProps) {
  const { data: flagsData, mutate: mutateFlags } = useSWR<{
    data: FlagItem[];
    stored: FlagItem[];
    system: FlagItem[];
  }>(`/api/athletes/${athleteId}/flags`, fetcher);
  const { data: metricsData } = useSWR<{ data: { metric_key: string; display_name: string }[] }>(
    `/api/athletes/${athleteId}/metrics-with-data`,
    fetcher
  );

  const [newFlagTitle, setNewFlagTitle] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const flags = flagsData?.data ?? [];
  const activeFlags = flags.filter((f) => !f.resolved_at);
  const metricsWithData = metricsData?.data ?? [];
  const metricKeys = useMemo(() => {
    const keys: string[] = [];
    const maxVel = metricsWithData.find((m) => m.metric_key === "MaxVelocity");
    if (maxVel) keys.push("MaxVelocity");
    const other = metricsWithData.filter((m) => m.metric_key !== "MaxVelocity").slice(0, 2 - keys.length);
    other.forEach((m) => keys.push(m.metric_key));
    return keys.slice(0, 2);
  }, [metricsWithData]);

  const prog1 = useProgression(athleteId, metricKeys[0] ?? null);
  const prog2 = useProgression(athleteId, metricKeys[1] ?? null);

  const points1 = prog1.data?.data?.points ?? [];
  const points2 = prog2.data?.data?.points ?? [];
  const name1 = prog1.data?.data?.metric_display_name ?? metricKeys[0] ?? "";
  const name2 = prog2.data?.data?.metric_display_name ?? metricKeys[1] ?? "";
  const units1 = prog1.data?.data?.units ?? "";
  const units2 = prog2.data?.data?.units ?? "";

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function handleAddFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!newFlagTitle.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newFlagTitle.trim(), description: newFlagDesc.trim() || undefined }),
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

      {/* Mini progression charts */}
      {(metricKeys[0] || metricKeys[1]) && (
        <div className="mb-6 space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Last 90 days
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {metricKeys[0] && (
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{name1}</span>
                  <Link
                    href={`/historical?athlete_id=${athleteId}&metric=${encodeURIComponent(metricKeys[0])}&from=${from}&to=${to}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Full chart
                  </Link>
                </div>
                <div className="h-44 w-full overflow-hidden rounded">
                  <ProgressionChart
                    points={points1}
                    metricDisplayName={name1}
                    units={units1}
                  />
                </div>
              </div>
            )}
            {metricKeys[1] && (
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{name2}</span>
                  <Link
                    href={`/historical?athlete_id=${athleteId}&metric=${encodeURIComponent(metricKeys[1])}&from=${from}&to=${to}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Full chart
                  </Link>
                </div>
                <div className="h-44 w-full overflow-hidden rounded">
                  <ProgressionChart
                    points={points2}
                    metricDisplayName={name2}
                    units={units2}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flags */}
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
                  <p className="text-xs text-foreground-muted">{f.description}</p>
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
