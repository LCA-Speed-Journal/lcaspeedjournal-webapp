"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { EstimatedStrengthBlock } from "@/app/reporting/team-progress/EstimatedStrengthBlock";
import type { BaselineRow } from "@/lib/strength/baselines";
import type { WorkoutTemplateRow } from "@/lib/weight-room/insert-template";
import "./print.css";

const SCHOOL_YEAR_FROM = "2025-08-01";
const SCHOOL_YEAR_TO = "2026-12-31";

const DERIVED_PATTERNS = [
  { pattern: "hinge", label: "Hinge" },
  { pattern: "single_leg", label: "Single-leg" },
  { pattern: "pull", label: "Pull" },
] as const;

type DerivedPattern = (typeof DERIVED_PATTERNS)[number]["pattern"];

type RosterAthlete = {
  id: string;
  first_name: string;
  last_name: string;
};

type TemplatesResponse = { data: WorkoutTemplateRow[] };
type RosterResponse = { data: RosterAthlete[] };
type BaselinesResponse = { data: BaselineRow[] };

type WorkingWeightCell = {
  athlete_id: string;
  kind: "load" | "ceiling" | null;
  pounds: number | null;
};

type WorkingWeightsResponse = {
  data: {
    session_date: string;
    athletes: Array<{
      athlete_id: string;
      first_name: string;
      last_name: string;
    }>;
    rows: Array<{ name: string; cells: WorkingWeightCell[] }>;
  };
};

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  let json: { error?: string } = {};
  try {
    json = (await res.json()) as { error?: string };
  } catch {
    json = {};
  }
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/weight-room/extracurricular";
  }
  if (!res.ok) {
    throw new Error(json.error || res.statusText || `Failed (${res.status})`);
  }
  return json as T;
}

function templateLabel(template: WorkoutTemplateRow): string {
  const bits = [template.session_date];
  if (template.title.trim()) bits.push(template.title.trim());
  if (template.week_number != null) {
    const day = template.day_name?.trim();
    bits.push(
      day ? `Week ${template.week_number} ${day}` : `Week ${template.week_number}`
    );
  } else if (template.day_name?.trim()) {
    bits.push(template.day_name.trim());
  }
  return bits.join(" — ");
}

function valueFor(rows: BaselineRow[], pattern: BaselineRow["pattern"]): string {
  const row = rows.find((item) => item.pattern === pattern);
  return row ? String(row.value_lb) : "";
}

function positiveNumber(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatCell(cell: WorkingWeightCell | undefined): string {
  if (!cell || cell.pounds == null) return "";
  if (cell.kind === "ceiling") return `Test ${cell.pounds}`;
  if (cell.kind === "load") return String(cell.pounds);
  return "";
}

function BaselineEditor({ athleteId }: { athleteId: string }) {
  const { data, error, isLoading, mutate } = useSWR<BaselinesResponse>(
    `/api/strength/baselines?athlete_id=${encodeURIComponent(athleteId)}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [squatText, setSquatText] = useState<string | undefined>(undefined);
  const [benchText, setBenchText] = useState<string | undefined>(undefined);
  const [powerText, setPowerText] = useState<string | undefined>(undefined);
  const [editText, setEditText] = useState<Partial<Record<DerivedPattern, string>>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState("");

  const rows = data?.data ?? [];
  const squat = squatText ?? valueFor(rows, "squat");
  const bench = benchText ?? valueFor(rows, "press");
  const power = powerText ?? valueFor(rows, "power");

  async function saveAnchors() {
    const squatLb = positiveNumber(squat);
    const benchLb = positiveNumber(bench);
    const powerLb = positiveNumber(power);
    if (squatLb == null || benchLb == null || powerLb == null) {
      setSaved("");
      setFormError(
        "Enter back squat, bench, and power clean as numbers greater than 0."
      );
      return;
    }
    setBusy(true);
    setFormError("");
    setSaved("");
    try {
      const res = await fetch("/api/strength/baselines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          squat: squatLb,
          bench: benchLb,
          power: powerLb,
        }),
      });
      const json = (await res.json()) as BaselinesResponse & { error?: string };
      if (!res.ok) {
        setFormError(json.error || "Failed to save baselines");
        return;
      }
      await mutate(json, { revalidate: false });
      setSquatText(undefined);
      setBenchText(undefined);
      setPowerText(undefined);
      setEditText({});
      setSaved("Saved");
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePattern(pattern: DerivedPattern, raw: string) {
    const valueLb = positiveNumber(raw);
    if (valueLb == null) {
      setSaved("");
      setFormError("Enter a number greater than 0.");
      return;
    }
    setBusy(true);
    setFormError("");
    setSaved("");
    try {
      const res = await fetch("/api/strength/baselines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          pattern,
          value_lb: valueLb,
        }),
      });
      const json = (await res.json()) as BaselinesResponse & { error?: string };
      if (!res.ok) {
        setFormError(json.error || "Failed to update baseline");
        return;
      }
      await mutate(json, { revalidate: false });
      setEditText((current) => {
        const next = { ...current };
        delete next[pattern];
        return next;
      });
      setSaved("Saved");
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !data) {
    return <p className="mt-3 text-sm text-foreground-muted">Loading baselines…</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error instanceof Error ? error.message : "Failed to load baselines"}
        </p>
      ) : null}
      {formError ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {formError}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-foreground-muted">{saved}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground-muted">Back squat</span>
          <input
            type="number"
            min={1}
            step="any"
            value={squat}
            onChange={(e) => setSquatText(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground-muted">Bench</span>
          <input
            type="number"
            min={1}
            step="any"
            value={bench}
            onChange={(e) => setBenchText(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground-muted">Power clean</span>
          <input
            type="number"
            min={1}
            step="any"
            value={power}
            onChange={(e) => setPowerText(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveAnchors()}
        className="w-fit rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save baselines"}
      </button>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground-muted">
          Hinge, single-leg, and pull save on their own.
        </p>
        {DERIVED_PATTERNS.map((item) => {
          const row = rows.find((entry) => entry.pattern === item.pattern);
          const draft = editText[item.pattern] ?? valueFor(rows, item.pattern);
          return (
            <div
              key={item.pattern}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface px-3 py-3"
            >
              <div className="min-w-[10rem]">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-sm text-foreground-muted">
                  {row ? `${row.value_lb} lb · ${row.origin}` : "Not set"}
                </p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground-muted">Pounds</span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={draft}
                  onChange={(e) =>
                    setEditText((current) => ({
                      ...current,
                      [item.pattern]: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePattern(item.pattern, draft)}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                Save {item.label.toLowerCase()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExtracurricularClient() {
  const [templateId, setTemplateId] = useState("");
  const [athleteId, setAthleteId] = useState("");

  const {
    data: templatesRes,
    error: templatesError,
    isLoading: templatesLoading,
  } = useSWR<TemplatesResponse>(
    "/api/weight-room/templates?hugo_group=extracurricular",
    fetcher
  );
  const {
    data: rosterRes,
    error: rosterError,
    isLoading: rosterLoading,
  } = useSWR<RosterResponse>(
    "/api/weight-room/rosters?hugo_group=extracurricular",
    fetcher
  );
  const {
    data: weightsRes,
    error: weightsError,
    isLoading: weightsLoading,
  } = useSWR<WorkingWeightsResponse>(
    templateId
      ? `/api/strength/working-weights?template_id=${encodeURIComponent(templateId)}`
      : null,
    fetcher
  );

  const templates = templatesRes?.data ?? [];
  const roster = rosterRes?.data ?? [];
  const selected = templates.find((template) => template.id === templateId) ?? null;
  const chartRoster = roster.map((athlete) => ({
    id: athlete.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
  }));
  const tableAthletes = weightsRes?.data.athletes ?? [];
  const tableRows = weightsRes?.data.rows ?? [];
  const tableTitle = selected
    ? templateLabel(selected)
    : (weightsRes?.data.session_date ?? "");

  return (
    <div className="extra-page relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div className="extra-screen-only pointer-events-none absolute inset-0">
        <PageBackground />
      </div>
      <main className="relative z-10 mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="extra-screen-only text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Weight room
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              Extracurricular strength
            </h1>
            <p className="extra-screen-only mt-2 max-w-2xl text-sm text-foreground-muted">
              Growth, baselines, and printable working weights for the
              extracurricular roster.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="extra-print-button rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background"
            >
              Print
            </button>
            <Link
              href="/weight-room"
              className="extra-screen-only text-sm text-foreground-muted hover:text-accent"
            >
              ← Hub
            </Link>
          </div>
        </div>

        <section className="extra-template-picker rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-lg font-semibold text-foreground">Template</h2>
          <label className="mt-3 flex max-w-xl flex-col gap-1 text-sm">
            <span className="text-foreground-muted">Session</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={templatesLoading}
              className={inputClass}
            >
              <option value="">
                {templatesLoading
                  ? "Loading…"
                  : templates.length === 0
                    ? "No extracurricular templates"
                    : "Select template…"}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {templateLabel(template)}
                </option>
              ))}
            </select>
          </label>
          {templatesError ? (
            <p className="mt-3 text-sm text-red-400">
              {templatesError instanceof Error
                ? templatesError.message
                : "Failed to load templates"}
            </p>
          ) : null}
        </section>

        <div className="extra-growth-chart mt-8 rounded-xl border border-border bg-surface-elevated p-4">
          {rosterError ? (
            <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {rosterError instanceof Error
                ? rosterError.message
                : "Failed to load roster"}
            </p>
          ) : null}
          {rosterLoading && roster.length === 0 ? (
            <p className="mb-3 text-sm text-foreground-muted">Loading roster…</p>
          ) : null}
          <EstimatedStrengthBlock
            hugoGroup="extracurricular"
            from={SCHOOL_YEAR_FROM}
            to={SCHOOL_YEAR_TO}
            roster={chartRoster}
          />
        </div>

        <section className="extra-baseline-form mt-8 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-lg font-semibold text-foreground">Baselines</h2>
          <label className="mt-3 flex max-w-md flex-col gap-1 text-sm">
            <span className="text-foreground-muted">Athlete</span>
            <select
              value={roster.some((athlete) => athlete.id === athleteId) ? athleteId : ""}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={rosterLoading}
              className={inputClass}
            >
              <option value="">
                {rosterLoading
                  ? "Loading…"
                  : roster.length === 0
                    ? "No athletes on this roster"
                    : "Select athlete…"}
              </option>
              {roster.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.last_name}, {athlete.first_name}
                </option>
              ))}
            </select>
          </label>
          {athleteId ? <BaselineEditor key={athleteId} athleteId={athleteId} /> : null}
        </section>

        <section className="extra-print-sheet mt-8 overflow-x-auto rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-lg font-semibold text-foreground">
            Working weights
            {tableTitle ? ` · ${tableTitle}` : ""}
          </h2>
          {!templateId ? (
            <p className="mt-3 text-sm text-foreground-muted">
              Pick a template to see working weights.
            </p>
          ) : weightsError ? (
            <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {weightsError instanceof Error
                ? weightsError.message
                : "Failed to load working weights"}
            </p>
          ) : weightsLoading && !weightsRes ? (
            <p className="mt-3 text-sm text-foreground-muted">Loading…</p>
          ) : tableRows.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted">
              No load prescriptions on this template.
            </p>
          ) : (
            <table className="mt-3 w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="text-foreground-muted">
                  <th className="px-2 py-2 font-medium">Movement</th>
                  {tableAthletes.map((athlete) => (
                    <th
                      key={athlete.athlete_id}
                      className="whitespace-nowrap px-2 py-2 font-medium"
                    >
                      {athlete.last_name}, {athlete.first_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr
                    key={`${row.name}-${index}`}
                    className="border-t border-border text-foreground"
                  >
                    <th className="px-2 py-2 text-left font-medium" scope="row">
                      {row.name}
                    </th>
                    {tableAthletes.map((athlete) => {
                      const cell = row.cells.find(
                        (entry) => entry.athlete_id === athlete.athlete_id
                      );
                      return (
                        <td key={athlete.athlete_id} className="px-2 py-2">
                          {formatCell(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
