"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RSI_OPTIONS = [
  { value: "", label: "Unset" },
  { value: "elastic", label: "Elastic" },
  { value: "force", label: "Force" },
  { value: "high_rsi", label: "High RSI" },
  { value: "low_rsi", label: "Low RSI" },
  { value: "unset", label: "Unset (explicit)" },
];

const SPRINT_OPTIONS = [
  { value: "", label: "Unset" },
  { value: "bouncer", label: "Bouncer" },
  { value: "spinner", label: "Spinner" },
  { value: "bounder", label: "Bounder" },
  { value: "driver", label: "Driver" },
  { value: "unset", label: "Unset (explicit)" },
];

const FV_SCALE_OPTIONS = [
  { value: "", label: "Unset" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

type ArchetypeData = {
  athlete_id: string;
  rsi_type: string | null;
  sprint_archetype: string | null;
  force_velocity_scale: number | null;
};

type ArchetypesSectionProps = {
  athleteId: string;
};

export function ArchetypesSection({ athleteId }: ArchetypesSectionProps) {
  const { data, mutate } = useSWR<{ data: ArchetypeData }>(
    `/api/athletes/${athleteId}/archetypes`,
    fetcher
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const archetype = data?.data;
  const rsi = archetype?.rsi_type ?? "";
  const sprint = archetype?.sprint_archetype ?? "";
  const fvScale = archetype?.force_velocity_scale != null ? String(archetype.force_velocity_scale) : "";

  async function handleChange(field: "rsi_type" | "sprint_archetype" | "force_velocity_scale", value: string | number | null) {
    const body: Record<string, unknown> = { [field]: value === "" || value === null ? null : value };
    if (field === "force_velocity_scale" && value !== "" && value !== null) {
      body[field] = Number(value);
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/archetypes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to update archetypes");
        return;
      }
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Archetypes
      </h3>
      <p className="mb-4 text-xs text-foreground-muted">
        Coach-assigned qualitative assessments (James Wild sprint archetypes, RSI type, force–velocity scale 1–5).
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
            RSI type
          </label>
          <select
            value={rsi}
            onChange={(e) => handleChange("rsi_type", e.target.value || null)}
            disabled={loading}
            className="w-full min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
          >
            {RSI_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
            Sprint archetype
          </label>
          <select
            value={sprint}
            onChange={(e) => handleChange("sprint_archetype", e.target.value || null)}
            disabled={loading}
            className="w-full min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
          >
            {SPRINT_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-muted">
            Force–velocity scale (1–5)
          </label>
          <select
            value={fvScale}
            onChange={(e) =>
              handleChange(
                "force_velocity_scale",
                e.target.value === "" ? null : e.target.value
              )
            }
            disabled={loading}
            className="w-full min-h-[40px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
          >
            {FV_SCALE_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
