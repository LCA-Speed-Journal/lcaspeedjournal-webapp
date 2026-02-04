"use client";

import { useState } from "react";

type MetricOption = {
  key: string;
  label: string;
  input_structure?: string;
  default_splits?: (number | string)[];
};

type SessionFormProps = {
  phases: readonly string[];
  metricOptions: MetricOption[];
};

function parseSplitsInput(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n <= 0)) return null;
  return nums;
}

export function SessionForm({ phases, metricOptions }: SessionFormProps) {
  const [sessionDate, setSessionDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [phase, setPhase] = useState(phases[0] ?? "Preseason");
  const [phaseWeek, setPhaseWeek] = useState(1);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [sessionNotes, setSessionNotes] = useState("");
  const [metricSearch, setMetricSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedId(null);
    setLoading(true);
    try {
      const day_splits = buildDaySplits();
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: sessionDate,
          phase,
          phase_week: phase === "Other" ? 0 : phaseWeek,
          day_metrics: selectedMetrics.length > 0 ? selectedMetrics : undefined,
          day_splits,
          session_notes: sessionNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create session");
        return;
      }
      setCreatedId(json.data?.id ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20"
    >
      <div>
        <label htmlFor="session_date" className="mb-1 block text-sm font-medium text-foreground">
          Session date
        </label>
        <input
          id="session_date"
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phase" className="mb-1 block text-sm font-medium text-foreground">
            Phase
          </label>
          <select
            id="phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground focus:border-accent"
          >
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {phase !== "Other" && (
          <div>
            <label htmlFor="phase_week" className="mb-1 block text-sm font-medium text-foreground">
              Phase week (1–5)
            </label>
            <input
              id="phase_week"
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
            Custom splits (optional) — comma-separated meters, e.g. 5,5 or 10,10
          </span>
          <p className="mb-2 text-xs text-foreground-muted">
            Override defaults for cumulative metrics. Leave blank to use metric default.
          </p>
          <div className="space-y-2">
            {cumulativeMetrics.map((m) => {
              const defaultStr = (m.default_splits as number[]).join(", ");
              return (
                <div key={m.key} className="flex items-center gap-3">
                  <label
                    htmlFor={`splits_${m.key}`}
                    className="min-w-[120px] text-sm text-foreground"
                  >
                    {m.label}
                  </label>
                  <input
                    id={`splits_${m.key}`}
                    type="text"
                    value={customSplits[m.key] ?? ""}
                    onChange={(e) =>
                      setCustomSplits((prev) => ({
                        ...prev,
                        [m.key]: e.target.value,
                      }))
                    }
                    placeholder={defaultStr}
                    className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm font-mono text-foreground placeholder:text-foreground-muted focus:border-accent"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="session_notes" className="mb-1 block text-sm font-medium text-foreground">
          Session notes (optional)
        </label>
        <textarea
          id="session_notes"
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground placeholder:text-foreground-muted focus:border-accent"
          placeholder="e.g. Indoor, light day"
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {createdId && (
        <p className="text-sm text-accent" role="status">
          Session created. ID: <code className="font-mono">{createdId.slice(0, 8)}…</code>
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating…" : "Create session"}
      </button>
    </form>
  );
}
