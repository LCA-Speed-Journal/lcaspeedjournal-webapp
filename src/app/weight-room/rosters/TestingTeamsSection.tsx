"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { Athlete } from "@/types";

const fetcher = (url: string) =>
  fetch(url).then((response) =>
    response.ok ? response.json() : Promise.reject(new Error(response.statusText))
  );

type TestingGroup = {
  group_key: string;
  label: string;
  sort_order: number;
};

type TestingBattery = {
  id: string;
  title: string;
  grouping_mode: string;
  cutoff_n: number | null;
  groups: TestingGroup[];
  assignments: Record<string, string>;
};

function athleteLabel(athlete: { first_name: string; last_name: string }): string {
  return `${athlete.last_name}, ${athlete.first_name}`;
}

export function TestingTeamsSection({
  hugoGroup,
  members,
}: {
  hugoGroup: string;
  members: Athlete[];
}) {
  const key = `/api/battery/groups?hugo_group=${encodeURIComponent(hugoGroup)}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: TestingBattery[] }>(key, fetcher);
  const batteries = data?.data ?? [];
  const [batteryId, setBatteryId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [saveError, setSaveError] = useState("");
  const selected =
    batteries.find((battery) => battery.id === batteryId) ?? batteries[0] ?? null;

  if (isLoading || error || !selected) {
    if (error) {
      return (
        <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
          <p className="text-sm text-danger">Failed to load testing teams</p>
        </section>
      );
    }
    return null;
  }

  async function onAssign(athleteId: string, groupKey: string) {
    if (!selected) return;
    setBusyId(athleteId);
    setSaveError("");
    try {
      const response = await fetch(`/api/battery/${encodeURIComponent(selected.id)}/groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          group_key: groupKey === "" ? null : groupKey,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSaveError(typeof json.error === "string" ? json.error : "Could not save that team");
        return;
      }
      await mutate();
    } catch {
      setSaveError("Network error — try again");
    } finally {
      setBusyId("");
    }
  }

  const sorted = [...members].sort((a, b) => athleteLabel(a).localeCompare(athleteLabel(b)));

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
        Testing teams
      </h2>
      <p className="mt-2 text-sm text-foreground-muted">
        Varsity, JV, and C-team belong to this battery. Pick one team per athlete. Someone left
        unassigned still shows on the board&apos;s Overall list. The gym board keeps the top-18
        line until you switch it to Teams.
      </p>
      {batteries.length > 1 ? (
        <label className="mt-3 block text-sm text-foreground">
          Battery
          <select
            value={selected.id}
            onChange={(event) => setBatteryId(event.target.value)}
            className="mt-1 block w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            {batteries.map((battery) => (
              <option key={battery.id} value={battery.id}>
                {battery.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 text-sm text-foreground">{selected.title}</p>
      )}
      <p className="mt-2 text-sm">
        <Link href={`/battery/${selected.id}`} className="text-accent hover:underline">
          Open the gym board
        </Link>
      </p>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-foreground-muted">No one on this roster yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((athlete) => (
            <li
              key={athlete.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0 text-sm text-foreground">{athleteLabel(athlete)}</span>
              <label className="flex items-center gap-2 text-sm text-foreground">
                Team
                <select
                  value={selected.assignments[athlete.id] ?? ""}
                  disabled={busyId === athlete.id}
                  onChange={(event) => void onAssign(athlete.id, event.target.value)}
                  className="rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
                  aria-label={`Testing team for ${athleteLabel(athlete)}`}
                >
                  <option value="">Unassigned</option>
                  {selected.groups.map((group) => (
                    <option key={group.group_key} value={group.group_key}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
      {saveError ? <p className="mt-2 text-sm text-danger">{saveError}</p> : null}
    </section>
  );
}
