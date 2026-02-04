"use client";

import { useState } from "react";
import useSWR from "swr";
import metricsData from "@/lib/metrics.json";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type MetricDef = {
  display_name: string;
  input_units: string;
  input_structure: string;
  default_splits: (number | string)[];
};

const metrics = metricsData as Record<string, MetricDef>;

function metricOptions() {
  return Object.entries(metrics).map(([key, m]) => ({
    key,
    label: m.display_name,
    inputStructure: m.input_structure,
    inputUnits: m.input_units,
    defaultSplits: m.default_splits,
  }));
}

function inputHint(
  metric: ReturnType<typeof metricOptions>[0] | null,
  sessionSplits?: Record<string, number[]> | null
): string {
  if (!metric) return "Select a metric";
  if (metric.inputStructure === "single_interval") {
    return `e.g. 1.45 (${metric.inputUnits})`;
  }
  if (metric.inputStructure === "cumulative") {
    const splits = sessionSplits?.[metric.key] ?? (metric.defaultSplits as number[]);
    const n = Array.isArray(splits) && splits.length > 0 ? splits.length : 2;
    const splitsStr = Array.isArray(splits) && splits.length > 0
      ? splits.map((m) => `${m}m`).join(", ")
      : null;
    const ex = n === 2 ? "0.95|1.85" : n === 3 ? "0.95|1.85|2.65" : "0.95|1.85|2.65|3.40";
    const base = `e.g. ${ex} (${n} pipe- or comma-separated values, ${metric.inputUnits})`;
    return splitsStr ? `Splits: ${splitsStr} — ${base}` : base;
  }
  if (metric.inputStructure === "paired_components") {
    const labels = (metric.defaultSplits as string[])?.join("|") ?? "L|R";
    return `e.g. 450|420 (${labels}, ${metric.inputUnits})`;
  }
  return "";
}

export function EntryForm() {
  const [sessionId, setSessionId] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: sessionsRes } = useSWR<{
    data: {
      id: string;
      session_date: string;
      phase: string;
      phase_week: number;
      day_metrics?: string[] | null;
      day_splits?: Record<string, number[]> | null;
    }[];
  }>("/api/sessions", fetcher);
  const { data: athletesRes } = useSWR<{
    data: {
      id: string;
      first_name: string;
      last_name: string;
      athlete_type?: string;
      graduating_class?: number | null;
    }[];
  }>("/api/athletes", fetcher);

  const sessions = sessionsRes?.data ?? [];
  const athletes = athletesRes?.data ?? [];
  const allOptions = metricOptions();
  const selectedSession = sessions.find((s) => s.id === sessionId);
  const sessionMetrics = selectedSession?.day_metrics;
  const options =
    Array.isArray(sessionMetrics) && sessionMetrics.length > 0
      ? allOptions.filter((o) => sessionMetrics.includes(o.key))
      : allOptions;
  const selectedMetric = options.find((o) => o.key === metricKey) ?? null;

  async function submitEntry() {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          athlete_id: athleteId,
          metric_key: metricKey,
          raw_input: rawInput.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save entry");
        return;
      }
      const count = json.data?.count ?? 1;
      setSuccess(`Saved ${count} ${count === 1 ? "entry" : "entries"}`);
      setRawInput("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitEntry();
  }

  const canSubmit = sessionId && athleteId && metricKey && rawInput.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20 md:p-6"
    >
      <div>
        <label htmlFor="entry_session" className="mb-1 block text-sm font-medium text-foreground">
          Session
        </label>
        <select
          id="entry_session"
          value={sessionId}
          onChange={(e) => {
            const newId = e.target.value;
            setSessionId(newId);
            const sess = sessions.find((s) => s.id === newId);
            const dm = Array.isArray(sess?.day_metrics) ? sess!.day_metrics : null;
            if (metricKey && dm && dm.length > 0 && !dm.includes(metricKey)) {
              setMetricKey("");
              setRawInput("");
            }
          }}
          className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          required
        >
          <option value="">Select session</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {String(s.session_date).slice(0, 10)} — {s.phase} wk {s.phase_week}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="entry_athlete" className="mb-1 block text-sm font-medium text-foreground">
          Athlete
        </label>
        <select
          id="entry_athlete"
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
          className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          required
        >
          <option value="">Select athlete</option>
          {athletes.map((a) => {
            const t = a.athlete_type ?? "athlete";
            const suffix =
              t === "staff" ? " (Staff)" : t === "alumni" ? " (Alumni)" : "";
            return (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name}
                {suffix}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label htmlFor="entry_metric" className="mb-1 block text-sm font-medium text-foreground">
          Metric
          {sessionMetrics && sessionMetrics.length > 0 && (
            <span className="ml-1 font-normal text-foreground-muted">(from session)</span>
          )}
        </label>
        <select
          id="entry_metric"
          value={metricKey}
          onChange={(e) => {
            setMetricKey(e.target.value);
            setRawInput("");
          }}
          className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          required
        >
          <option value="">Select metric</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="entry_raw" className="mb-1 block text-sm font-medium text-foreground">
          Value
        </label>
        <input
          id="entry_raw"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={inputHint(selectedMetric, selectedSession?.day_splits)}
          className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
          required
        />
        <p className="mt-1 text-xs text-foreground-muted">
          {inputHint(selectedMetric, selectedSession?.day_splits)}
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={() => canSubmit && void submitEntry()}
            disabled={loading}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface disabled:opacity-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setError("")}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface"
          >
            Dismiss
          </button>
        </div>
      )}
      {success && (
        <p className="text-sm text-accent" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-3 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}
