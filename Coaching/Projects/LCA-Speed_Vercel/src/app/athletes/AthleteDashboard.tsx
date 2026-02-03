"use client";

import { useEffect, useState } from "react";
import { EventsSection } from "./EventsSection";
import { PRsSection } from "./PRsSection";
import { ProgressionFlagsSection } from "./ProgressionFlagsSection";
import { ArchetypesSection } from "./ArchetypesSection";
import { SuperpowersKryptoniteSection } from "./SuperpowersKryptoniteSection";

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number | null;
  athlete_type: string;
  active: boolean;
};

type AthleteDashboardProps = {
  athleteId: string;
};

/**
 * AthleteDashboard - Placeholder for Phase A
 * 
 * This component will eventually show:
 * - Events / event groups
 * - Practice-metric PRs
 * - Progression & flags
 * - Archetypes
 * - Superpowers / kryptonite
 * - Coach notes
 * 
 * For Phase A, we just show athlete info and a placeholder message.
 */
export function AthleteDashboard({ athleteId }: AthleteDashboardProps) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchAthlete() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/athletes/${athleteId}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to load athlete");
          return;
        }
        setAthlete(json.data);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    fetchAthlete();
  }, [athleteId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-foreground-muted">Loading athlete...</p>
      </div>
    );
  }

  if (error || !athlete) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-2xl border-2 border-danger/50 bg-danger/5 p-6 text-center">
          <p className="text-danger">{error || "Athlete not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <header className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
          <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
          <h2 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
            {athlete.first_name} {athlete.last_name}
          </h2>
          <p className="text-sm text-foreground-muted">
            {athlete.gender} • {athlete.athlete_type === "athlete" ? `Class of ${athlete.graduating_class}` : athlete.athlete_type} • {athlete.active ? "Active" : "Inactive"}
          </p>
        </header>

        {/* Sections */}
        <div className="space-y-4">
          <EventsSection athleteId={athleteId} />

          <PRsSection athleteId={athleteId} />

          <ProgressionFlagsSection athleteId={athleteId} />

          <ArchetypesSection athleteId={athleteId} />

          <SuperpowersKryptoniteSection
            athleteId={athleteId}
            kind="superpowers"
            title="Superpowers"
            presetApi="/api/superpower-presets"
            itemApi="/api/athletes"
          />

          <SuperpowersKryptoniteSection
            athleteId={athleteId}
            kind="kryptonite"
            title="Kryptonite"
            presetApi="/api/kryptonite-presets"
            itemApi="/api/athletes"
          />

          <DashboardSection title="Coach Notes" phase="Existing">
            General coach notes for this athlete.
          </DashboardSection>
        </div>
    </div>
  );
}

function DashboardSection({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
          Phase {phase}
        </span>
      </div>
      <p className="text-sm text-foreground-muted">{children}</p>
    </div>
  );
}
