"use client";

import { useEffect, useRef, useState } from "react";
import { PageBackground } from "@/app/components/PageBackground";

type Column = { key: string; label: string; units: string };
type Athlete = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  values: Record<string, number | null>;
};

const UNIT_HINT: Record<string, string> = {
  s: "s",
  mph: "mph",
  ft: "ft",
  in: "in",
  "%": "%",
};

export function SampleEditor({ batteryId }: { batteryId: string }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/battery/${encodeURIComponent(batteryId)}/sample`)
      .then(async (response) => {
        const body = (await response.json()) as { data?: { columns: Column[]; athletes: Athlete[] }; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error || "Could not load sample marks");
        return body.data;
      })
      .then((data) => {
        if (cancelled) return;
        setColumns(data.columns);
        setAthletes(data.athletes);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sample marks");
      });
    return () => {
      cancelled = true;
    };
  }, [batteryId]);

  function update(athleteId: string, key: string, raw: string) {
    const draftKey = `${athleteId}:${key}`;
    setDrafts((current) => ({ ...current, [draftKey]: raw }));
    window.clearTimeout(timers.current[draftKey]);
    timers.current[draftKey] = window.setTimeout(() => {
      const value = raw.trim() === "" ? null : Number(raw);
      if (value != null && !Number.isFinite(value)) return;
      void fetch(`/api/battery/${encodeURIComponent(batteryId)}/sample`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, key, value }),
      }).then((response) => {
        setNote(response.ok ? "The gym board picks this up within a second." : "That number did not save.");
      });
    }, 300);
  }

  async function restore() {
    const response = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/sample`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    if (!response.ok) {
      setNote("Could not restore the generated marks.");
      return;
    }
    const reload = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/sample`);
    const body = (await reload.json()) as { data?: { athletes: Athlete[] } };
    if (body.data) setAthletes(body.data.athletes);
    setDrafts({});
    setNote("Generated marks restored.");
  }

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <PageBackground />
      <div className="relative z-10 px-4 pb-10 pt-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Adjust sample marks</h1>
            <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
              Change a number here and watch the gym board. Distances are feet or inches; the board
              shows broad and med ball as feet and inches. Nothing is saved to the database.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void restore()}
            className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium"
          >
            Restore generated marks
          </button>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {note ? (
          <p className="mb-3 text-sm text-foreground-muted" role="status">
            {note}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-foreground-muted">
                <th className="sticky left-0 bg-background px-2 py-2">Athlete</th>
                {columns.map((column) => (
                  <th key={column.key} className="px-2 py-2 font-medium">
                    {column.label}
                    {UNIT_HINT[column.units] ? (
                      <span className="mt-0.5 block normal-case tracking-normal">{UNIT_HINT[column.units]}</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {athletes.map((athlete) => (
                <tr key={athlete.athlete_id} className="border-b border-border/70">
                  <th className="sticky left-0 bg-background px-2 py-1 text-left font-semibold">
                    {athlete.last_name}, {athlete.first_name}
                  </th>
                  {columns.map((column) => {
                    const value = athlete.values[column.key];
                    const draftKey = `${athlete.athlete_id}:${column.key}`;
                    const shown = drafts[draftKey] ?? (value == null || Number.isNaN(value) ? "" : String(value));
                    return (
                      <td key={column.key} className="px-1 py-1">
                        <input
                          aria-label={`${athlete.first_name} ${athlete.last_name} ${column.label}`}
                          inputMode="decimal"
                          value={shown}
                          onChange={(event) => update(athlete.athlete_id, column.key, event.target.value)}
                          className="w-20 rounded border border-border bg-surface px-2 py-1 font-mono text-foreground"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
