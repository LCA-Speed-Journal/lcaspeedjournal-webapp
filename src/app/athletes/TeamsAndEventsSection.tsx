"use client";

import { useState } from "react";
import useSWR from "swr";
import type { EventGroup } from "@/types";
import {
  HUGO_GROUPS,
  HUGO_GROUP_META,
  type HugoGroup,
} from "@/lib/weight-room/constants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AthleteMembership = {
  hugo_group?: string | null;
  hugo_groups?: string[];
  hugo_primary?: string | null;
};

type MetricWithData = {
  metric_key: string;
  category: string;
  display_name: string;
};

type TeamsAndEventsSectionProps = {
  athleteId: string;
};

export function TeamsAndEventsSection({ athleteId }: TeamsAndEventsSectionProps) {
  const athleteKey = `/api/athletes/${athleteId}`;
  const { data, error: loadError, isLoading, mutate } = useSWR<{
    data?: AthleteMembership;
    error?: string;
  }>(athleteKey, fetcher);

  const { data: assignedData, mutate: mutateAssigned } = useSWR<{
    data: EventGroup[];
  }>(`/api/athletes/${athleteId}/event-groups`, fetcher);
  const { data: allData } = useSWR<{ data: EventGroup[] }>("/api/event-groups", fetcher);
  const { data: metricsData } = useSWR<{ data: MetricWithData[] }>(
    `/api/athletes/${athleteId}/metrics-with-data`,
    fetcher
  );

  const [pendingGroup, setPendingGroup] = useState<HugoGroup | null>(null);
  const [pendingPrimary, setPendingPrimary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const athlete = data?.data;
  const assigned = assignedData?.data ?? [];
  const allGroups = allData?.data ?? [];
  const metricsWithData = metricsData?.data ?? [];
  const unassigned = allGroups.filter(
    (g) => !assigned.some((a) => a.id === g.id)
  );

  function isChecked(group: HugoGroup) {
    if (athlete?.hugo_groups) {
      return athlete.hugo_groups.includes(group);
    }
    return athlete?.hugo_group === group;
  }

  async function handleToggle(group: HugoGroup, checked: boolean) {
    setError("");
    setPendingGroup(group);
    try {
      const res = checked
        ? await fetch("/api/weight-room/rosters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ athlete_id: athleteId, hugo_group: group }),
          })
        : await fetch(
            `/api/weight-room/rosters?athlete_id=${encodeURIComponent(athleteId)}&hugo_group=${encodeURIComponent(group)}`,
            { method: "DELETE" }
          );
      const json = await res.json();
      if (!res.ok && !(res.status === 404 && !checked)) {
        setError(json.error ?? "Failed to update Hugo team");
        return;
      }
      await mutate();
    } catch {
      setError("Network error");
    } finally {
      setPendingGroup(null);
    }
  }

  async function handleSetPrimary(group: HugoGroup) {
    if (!isChecked(group) || athlete?.hugo_primary === group) return;
    setError("");
    setPendingPrimary(true);
    try {
      const res = await fetch("/api/weight-room/rosters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, hugo_group: group }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to set primary sport");
        return;
      }
      await mutate();
    } catch {
      setError("Network error");
    } finally {
      setPendingPrimary(false);
    }
  }

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

  const byCategory = metricsWithData.reduce(
    (acc, m) => {
      const c = m.category ?? "Other";
      if (!acc[c]) acc[c] = [];
      acc[c].push(m);
      return acc;
    },
    {} as Record<string, MetricWithData[]>
  );

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-1 text-lg font-semibold text-foreground">
        Teams & events
      </h3>
      <p className="mb-3 text-xs text-foreground-muted">
        Primary sport sets default performance norms.
      </p>

      {isLoading && !athlete && (
        <p className="text-sm text-foreground-muted">Loading teams…</p>
      )}

      {(loadError || data?.error) && !athlete && (
        <p className="text-sm text-danger" role="alert">
          {data?.error ?? "Failed to load Hugo teams"}
        </p>
      )}

      {athlete && (
        <div className="mb-4 grid grid-cols-2 gap-1.5 lg:grid-cols-3">
          {HUGO_GROUPS.map((group) => {
            const label = HUGO_GROUP_META[group].label;
            const checked = isChecked(group);
            const isPrimary = athlete.hugo_primary === group;
            const rowBusy = pendingGroup === group || pendingPrimary;
            const primaryDisabled =
              !checked || pendingPrimary || pendingGroup !== null;
            return (
              <div
                key={group}
                className={`flex min-h-[36px] items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground ${
                  rowBusy ? "opacity-50" : "hover:border-accent/50"
                }`}
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={rowBusy}
                    onChange={(e) => handleToggle(group, e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent,#00f5d4)]"
                  />
                  <span className="truncate">{label}</span>
                </label>
                <label
                  className={`flex shrink-0 items-center gap-1 text-[10px] ${
                    checked
                      ? "text-foreground-muted"
                      : "text-foreground-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={`hugo-primary-${athleteId}`}
                    checked={isPrimary}
                    disabled={primaryDisabled}
                    onChange={() => handleSetPrimary(group)}
                    className="h-3.5 w-3.5 accent-[var(--color-accent,#00f5d4)]"
                  />
                  Primary
                </label>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Event groups
        </p>
        <div className="flex flex-wrap gap-2">
          {assigned.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-sm font-medium text-accent"
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
              className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-foreground-muted hover:border-accent/50 hover:text-accent disabled:opacity-50"
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
                <span className="text-xs font-semibold text-accent">
                  {category}
                </span>
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
    </section>
  );
}
