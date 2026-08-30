"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  HUGO_GROUPS,
  HUGO_GROUP_META,
  type HugoGroup,
} from "@/lib/weight-room/constants";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AthleteMembership = {
  hugo_group?: string | null;
  hugo_groups?: string[];
};

type HugoTeamsSectionProps = {
  athleteId: string;
};

export function HugoTeamsSection({ athleteId }: HugoTeamsSectionProps) {
  const athleteKey = `/api/athletes/${athleteId}`;
  const { data, error: loadError, isLoading, mutate } = useSWR<{
    data?: AthleteMembership;
    error?: string;
  }>(athleteKey, fetcher);

  const [pendingGroup, setPendingGroup] = useState<HugoGroup | null>(null);
  const [error, setError] = useState("");

  const athlete = data?.data;

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

  return (
    <section className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
      <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
      <h3 className="mb-1 text-lg font-semibold text-foreground">Hugo teams</h3>
      <p className="mb-4 text-xs text-foreground-muted">
        Assign this athlete to one or more sports. Used for weight-room cards and
        rosters.
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {HUGO_GROUPS.map((group) => {
            const label = HUGO_GROUP_META[group].label;
            const checked = isChecked(group);
            const disabled = pendingGroup === group;
            return (
              <label
                key={group}
                className={`flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground ${
                  disabled ? "opacity-50" : "hover:border-accent/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => handleToggle(group, e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent,#00f5d4)]"
                />
                {label}
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
