"use client";

import { useState } from "react";
import useSWR from "swr";
import type { EventGroup } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type MetricWithData = {
  metric_key: string;
  category: string;
  display_name: string;
};

type EventsSectionProps = {
  athleteId: string;
};

export function EventsSection({ athleteId }: EventsSectionProps) {
  const { data: assignedData, mutate: mutateAssigned } = useSWR<{ data: EventGroup[] }>(
    `/api/athletes/${athleteId}/event-groups`,
    fetcher
  );
  const { data: allData } = useSWR<{ data: EventGroup[] }>(
    "/api/event-groups",
    fetcher
  );
  const { data: metricsData } = useSWR<{ data: MetricWithData[] }>(
    `/api/athletes/${athleteId}/metrics-with-data`,
    fetcher
  );

  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const assigned = assignedData?.data ?? [];
  const allGroups = allData?.data ?? [];
  const metricsWithData = metricsData?.data ?? [];

  const unassigned = allGroups.filter(
    (g) => !assigned.some((a) => a.id === g.id)
  );

  async function handleAssign(eventGroupId: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/event-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_group_id: eventGroupId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to assign event group");
        return;
      }
      setAdding(false);
      mutateAssigned();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(eventGroupId: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/athletes/${athleteId}/event-groups?event_group_id=${encodeURIComponent(eventGroupId)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to remove event group");
        return;
      }
      mutateAssigned();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const byCategory = metricsWithData.reduce((acc, m) => {
    const c = m.category ?? "Other";
    if (!acc[c]) acc[c] = [];
    acc[c].push(m);
    return acc;
  }, {} as Record<string, MetricWithData[]>);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Events & Event Groups
      </h3>

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Coach-assigned groups
        </p>
        <div className="flex flex-wrap gap-2">
          {assigned.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
            >
              {g.name}
              <button
                type="button"
                onClick={() => handleRemove(g.id)}
                disabled={loading}
                className="rounded-full p-0.5 hover:bg-accent/20 disabled:opacity-50"
                aria-label={`Remove ${g.name}`}
              >
                <span className="text-xs leading-none">×</span>
              </button>
            </span>
          ))}
          {adding ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
              <select
                className="min-h-[28px] rounded border-0 bg-transparent text-sm text-foreground focus:ring-0"
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    handleAssign(id);
                    e.target.value = "";
                  }
                }}
                disabled={loading}
                defaultValue=""
              >
                <option value="">Select…</option>
                {unassigned.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded p-0.5 text-foreground-muted hover:bg-surface-elevated"
                aria-label="Cancel"
              >
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={loading || unassigned.length === 0}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-foreground-muted hover:border-accent/50 hover:text-accent disabled:opacity-50"
            >
              + Add group
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Metrics with data
        </p>
        {metricsWithData.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No metric entries yet for this athlete.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byCategory).map(([category, items]) => (
              <div key={category}>
                <span className="text-xs font-semibold text-accent">{category}</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {items.map((m) => (
                    <span
                      key={m.metric_key}
                      className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                    >
                      {m.display_name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
