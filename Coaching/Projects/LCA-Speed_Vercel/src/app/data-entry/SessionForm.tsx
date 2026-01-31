"use client";

import { useState } from "react";

type SessionFormProps = {
  phases: readonly string[];
  metricOptions: { key: string; label: string }[];
};

export function SessionForm({ phases, metricOptions }: SessionFormProps) {
  const [sessionDate, setSessionDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [phase, setPhase] = useState(phases[0] ?? "Preseason");
  const [phaseWeek, setPhaseWeek] = useState(1);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [sessionNotes, setSessionNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedId(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: sessionDate,
          phase,
          phase_week: phaseWeek,
          day_metrics: selectedMetrics.length > 0 ? selectedMetrics : undefined,
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
      className="max-w-xl space-y-4 rounded-lg border p-4 shadow-sm"
    >
      <div>
        <label htmlFor="session_date" className="mb-1 block text-sm font-medium">
          Session date
        </label>
        <input
          id="session_date"
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phase" className="mb-1 block text-sm font-medium">
            Phase
          </label>
          <select
            id="phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="phase_week" className="mb-1 block text-sm font-medium">
            Phase week (1–5)
          </label>
          <input
            id="phase_week"
            type="number"
            min={1}
            max={5}
            value={phaseWeek}
            onChange={(e) => setPhaseWeek(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium">Day metrics (optional)</span>
        <div className="max-h-40 overflow-y-auto rounded border p-2">
          {metricOptions.slice(0, 50).map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer items-center gap-2 py-1 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedMetrics.includes(m.key)}
                onChange={() => toggleMetric(m.key)}
                className="rounded"
              />
              {m.label}
            </label>
          ))}
          {metricOptions.length > 50 && (
            <p className="text-xs text-zinc-500">
              +{metricOptions.length - 50} more metrics (select from first 50 for now)
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="session_notes" className="mb-1 block text-sm font-medium">
          Session notes (optional)
        </label>
        <textarea
          id="session_notes"
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
          rows={2}
          className="w-full rounded border px-3 py-2"
          placeholder="e.g. Indoor, light day"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {createdId && (
        <p className="text-sm text-green-600" role="status">
          Session created. ID: <code className="font-mono">{createdId.slice(0, 8)}…</code>
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Creating…" : "Create session"}
      </button>
    </form>
  );
}
