"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import metricsData from "@/lib/metrics.json";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PHASES = [
  "Preseason",
  "Preparation",
  "Competition",
  "Championship",
  "Other",
] as const;

type MetricMeta = {
  display_name: string;
  input_structure?: string;
  default_splits?: (number | string)[];
};
const metricOptions = Object.entries(metricsData as Record<string, MetricMeta>).map(
  ([key, m]) => ({
    key,
    label: m.display_name,
    input_structure: m.input_structure ?? "single_interval",
    default_splits: m.default_splits ?? [],
  })
);

function parseSplitsInput(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n <= 0)) return null;
  return nums;
}

type SessionData = {
  session_date: string;
  phase: string;
  phase_week: number;
  day_metrics?: string[] | null;
  day_splits?: Record<string, number[]> | null;
  session_notes?: string | null;
};

export function EditSessionClient({ sessionId }: { sessionId: string }) {
  const { mutate } = useSWRConfig();
  const sessionKey = `/api/sessions/${sessionId}`;
  const { data, error, isLoading } = useSWR<{ data?: SessionData }>(sessionKey, fetcher);
  const [initialized, setInitialized] = useState(false);

  const [sessionDate, setSessionDate] = useState("");
  const [phase, setPhase] = useState<string>(PHASES[0]);
  const [phaseWeek, setPhaseWeek] = useState(1);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [sessionNotes, setSessionNotes] = useState("");
  const [metricSearch, setMetricSearch] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    if (!data?.data || initialized) return;
    const s = data.data;
    setSessionDate(String(s.session_date).slice(0, 10));
    setPhase(s.phase ?? PHASES[0]);
    setPhaseWeek(Number(s.phase_week) ?? 1);
    setSelectedMetrics(Array.isArray(s.day_metrics) ? s.day_metrics : []);
    const splits: Record<string, string> = {};
    if (s.day_splits && typeof s.day_splits === "object") {
      for (const [k, v] of Object.entries(s.day_splits)) {
        if (Array.isArray(v)) splits[k] = v.join(", ");
      }
    }
    setCustomSplits(splits);
    setSessionNotes(s.session_notes ?? "");
    setInitialized(true);
  }, [data, initialized]);

  const filteredMetrics =
    metricSearch.trim() === ""
      ? metricOptions
      : metricOptions.filter((m) =>
          m.label.toLowerCase().includes(metricSearch.trim().toLowerCase())
        );

  function toggleMetric(key: string) {
    const isDeselecting = selectedMetrics.includes(key);
    if (isDeselecting) {
      setCustomSplits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  const cumulativeMetrics = metricOptions.filter(
    (m) => m.input_structure === "cumulative" && selectedMetrics.includes(m.key)
  );

  function buildDaySplits(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    for (const m of cumulativeMetrics) {
      const input = customSplits[m.key]?.trim();
      if (!input) continue;
      const parsed = parseSplitsInput(input);
      if (parsed && parsed.length > 0) out[m.key] = parsed;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  async function handleSessionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaveLoading(true);
    try {
      const day_splits = buildDaySplits();
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: sessionDate,
          phase,
          phase_week: phase === "Other" ? 0 : phaseWeek,
          day_metrics: selectedMetrics.length > 0 ? selectedMetrics : null,
          day_splits: day_splits ?? null,
          session_notes: sessionNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Failed to update session");
        return;
      }
      setSaveSuccess("Session saved.");
      void mutate(sessionKey);
    } catch {
      setSaveError("Network error");
    } finally {
      setSaveLoading(false);
    }
  }

  if (isLoading) return <p className="text-foreground-muted">Loading session…</p>;
  if (error) return <p className="text-danger">Failed to load session.</p>;
  if (!data?.data) return <p className="text-foreground-muted">Session not found.</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold text-foreground">Edit session</h2>
        <form
          onSubmit={handleSessionSubmit}
          className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20"
        >
          <div>
            <label htmlFor="edit_session_date" className="mb-1 block text-sm font-medium text-foreground">
              Session date
            </label>
            <input
              id="edit_session_date"
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit_phase" className="mb-1 block text-sm font-medium text-foreground">
                Phase
              </label>
              <select
                id="edit_phase"
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {phase !== "Other" && (
              <div>
                <label htmlFor="edit_phase_week" className="mb-1 block text-sm font-medium text-foreground">
                  Phase week (1–5)
                </label>
                <input
                  id="edit_phase_week"
                  type="number"
                  min={1}
                  max={5}
                  value={phaseWeek}
                  onChange={(e) => setPhaseWeek(Number(e.target.value))}
                  className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
                />
              </div>
            )}
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-foreground">Day metrics (optional)</span>
            <input
              type="text"
              placeholder="Search metrics…"
              value={metricSearch}
              onChange={(e) => setMetricSearch(e.target.value)}
              className="mb-2 w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
            />
            <div className="max-h-40 overflow-y-auto rounded border border-border bg-surface-elevated p-2">
              {filteredMetrics.map((m) => (
                <label
                  key={m.key}
                  className="flex cursor-pointer items-center gap-2 py-1 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.key)}
                    onChange={() => toggleMetric(m.key)}
                    className="rounded border-border bg-surface text-accent focus:ring-accent"
                  />
                  {m.label}
                </label>
              ))}
              {filteredMetrics.length === 0 && (
                <p className="text-xs text-foreground-muted">No metrics match</p>
              )}
            </div>
          </div>

          {cumulativeMetrics.length > 0 && (
            <div>
              <span className="mb-2 block text-sm font-medium text-foreground">
                Custom splits (optional) — comma-separated meters
              </span>
              <div className="space-y-2">
                {cumulativeMetrics.map((m) => (
                  <div key={m.key} className="flex items-center gap-3">
                    <label htmlFor={`edit_splits_${m.key}`} className="min-w-[120px] text-sm text-foreground">
                      {m.label}
                    </label>
                    <input
                      id={`edit_splits_${m.key}`}
                      type="text"
                      value={customSplits[m.key] ?? ""}
                      onChange={(e) =>
                        setCustomSplits((prev) => ({ ...prev, [m.key]: e.target.value }))
                      }
                      placeholder={(m.default_splits as number[])?.join(", ")}
                      className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm font-mono text-foreground placeholder:text-foreground-muted focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="edit_session_notes" className="mb-1 block text-sm font-medium text-foreground">
              Session notes (optional)
            </label>
            <textarea
              id="edit_session_notes"
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground placeholder:text-foreground-muted focus:border-accent"
              placeholder="e.g. Indoor, light day"
            />
          </div>

          {saveError && (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-sm text-accent" role="status">
              {saveSuccess}
            </p>
          )}

          <button
            type="submit"
            disabled={saveLoading}
            className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saveLoading ? "Saving…" : "Save session"}
          </button>
        </form>
      </section>
    </div>
  );
}
