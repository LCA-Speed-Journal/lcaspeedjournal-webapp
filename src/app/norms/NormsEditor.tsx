"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { uniqueCutsPerGender } from "@/lib/norms/editor";
import {
  cellsToGrid,
  emptyCutsGrid,
  gridToCells,
  type CutsGrid,
} from "@/lib/norms/cuts-grid";
import {
  cutsEditorMetrics,
  defaultCutsComponent,
  FORTY_YD_COMPONENTS,
  FORTY_YD_DASH,
  metricLabel,
  NORMS_DEFAULTS_METRIC_KEYS,
} from "@/lib/norms/editor-metrics";
import { ZONE_LABELS, type ZoneLabel } from "@/lib/norms/palette";
import {
  HUGO_GROUPS,
  HUGO_GROUP_META,
  type HugoGroup,
} from "@/lib/weight-room/constants";

type ManagePopulation = {
  id: string;
  name: string;
  notes: string | null;
  archived_at: string | Date | null;
  created_at: string | Date;
};

type ThresholdRow = {
  gender: "M" | "F";
  label: ZoneLabel;
  threshold: number;
  component?: string | null;
};

type SportDefault = {
  hugo_group: string;
  metric_key: string;
  population_id: string;
};

const inputClass =
  "w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent";

const btnClass =
  "rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50";

const btnAccentClass =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-50";

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/norms";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await readApiError(res, `Request failed (${res.status})`));
  }
  return res.json() as Promise<T>;
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string" && json.error.trim()) {
      return json.error;
    }
  } catch {
    // not JSON
  }
  return fallback;
}

function isArchived(pop: ManagePopulation): boolean {
  return pop.archived_at != null && pop.archived_at !== "";
}

export function NormsEditor() {
  const cutMetrics = useMemo(() => cutsEditorMetrics(), []);
  const [selectedId, setSelectedId] = useState<string>("");
  const [cutMetric, setCutMetric] = useState<string>("Vertical Jump");
  const [cutComponent, setCutComponent] = useState(() =>
    defaultCutsComponent("Vertical Jump")
  );

  const {
    data: popsData,
    error: popsError,
    isLoading: popsLoading,
    mutate: mutatePops,
  } = useSWR<{ data: ManagePopulation[] }>(
    "/api/norms/populations/manage",
    jsonFetcher
  );
  const populations = popsData?.data ?? [];

  const {
    data: defaultsData,
    error: defaultsError,
    mutate: mutateDefaults,
  } = useSWR<{ data: SportDefault[] }>("/api/norms/defaults", jsonFetcher);
  const defaults = defaultsData?.data ?? [];

  const selected =
    populations.find((p) => p.id === selectedId) ?? populations[0] ?? null;
  const cutPopulationId = selected?.id ?? "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-12 sm:px-6">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-6xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Manage
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Norms</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Named populations, sparse cuts (empty cells stay empty), and which
          table each Hugo sport uses by default. No research numbers are seeded
          — fill only the labels you have.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Home
          </Link>
          <Link
            href="/weight-room"
            className="inline-block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Weight room
          </Link>
        </div>

        <div className="mt-8 flex flex-col gap-6">
          <PopulationPane
            populations={populations}
            loading={popsLoading}
            loadError={popsError instanceof Error ? popsError.message : ""}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
            onMutate={mutatePops}
          />
          <CutsPane
            populations={populations}
            populationId={cutPopulationId}
            onPopulationId={setSelectedId}
            metricKey={cutMetric}
            onMetricKey={(key) => {
              setCutMetric(key);
              setCutComponent((prev) =>
                key === FORTY_YD_DASH
                  ? prev || defaultCutsComponent(key)
                  : ""
              );
            }}
            component={cutComponent}
            onComponent={setCutComponent}
            metrics={cutMetrics}
          />
          <DefaultsPane
            populations={populations}
            defaults={defaults}
            loadError={
              defaultsError instanceof Error ? defaultsError.message : ""
            }
            onMutate={mutateDefaults}
          />
        </div>
      </main>
    </div>
  );
}

function PopulationPane({
  populations,
  loading,
  loadError,
  selectedId,
  onSelect,
  onMutate,
}: {
  populations: ManagePopulation[];
  loading: boolean;
  loadError: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onMutate: () => Promise<unknown>;
}) {
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = populations.find((p) => p.id === selectedId) ?? null;

  async function createPop(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/norms/populations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          notes: newNotes.trim() === "" ? undefined : newNotes,
        }),
      });
      const json = (await res.json()) as {
        data?: ManagePopulation;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || `Create failed (${res.status})`);
        return;
      }
      setNewName("");
      setNewNotes("");
      await onMutate();
      if (json.data?.id) onSelect(json.data.id);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(name: string, notes: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/norms/populations/${selected.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          notes: notes.trim() === "" ? null : notes,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || `Save failed (${res.status})`);
        return;
      }
      await onMutate();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/norms/populations/${selected.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || `Update failed (${res.status})`);
        return;
      }
      await onMutate();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
        Populations
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Create, rename, or archive a table. Archive is blocked while a sport
        default still points here.
      </p>

      {loadError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {loadError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={createPop} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-foreground">
          New name
          <input
            className={`${inputClass} mt-1`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-foreground">
          Notes
          <input
            className={`${inputClass} mt-1`}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className={btnAccentClass} disabled={busy}>
            Create
          </button>
        </div>
      </form>

      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {loading && populations.length === 0 ? (
          <li className="px-3 py-2 text-sm text-foreground-muted">Loading…</li>
        ) : null}
        {populations.map((pop) => {
          const active = pop.id === selectedId;
          return (
            <li key={pop.id}>
              <button
                type="button"
                onClick={() => onSelect(pop.id)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-elevated ${
                  active ? "bg-accent/10" : ""
                }`}
              >
                <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {pop.name}
                  {isArchived(pop) ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs font-normal text-foreground-muted">
                      Archived
                    </span>
                  ) : null}
                </span>
                {pop.notes ? (
                  <span className="text-xs text-foreground-muted">{pop.notes}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <PopulationEditForm
          key={selected.id}
          selected={selected}
          busy={busy}
          onSaveRename={saveRename}
          onSetArchived={setArchived}
        />
      ) : null}
    </section>
  );
}

function PopulationEditForm({
  selected,
  busy,
  onSaveRename,
  onSetArchived,
}: {
  selected: ManagePopulation;
  busy: boolean;
  onSaveRename: (name: string, notes: string) => Promise<void>;
  onSetArchived: (archived: boolean) => Promise<void>;
}) {
  const [editName, setEditName] = useState(selected.name);
  const [editNotes, setEditNotes] = useState(selected.notes ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSaveRename(editName, editNotes);
      }}
      className="mt-4 grid gap-3 sm:grid-cols-2"
    >
      <label className="block text-sm text-foreground">
        Rename
        <input
          className={`${inputClass} mt-1`}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm text-foreground">
        Notes
        <input
          className={`${inputClass} mt-1`}
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className={btnAccentClass} disabled={busy}>
          Save name / notes
        </button>
        {isArchived(selected) ? (
          <button
            type="button"
            className={btnClass}
            disabled={busy}
            onClick={() => void onSetArchived(false)}
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            className={btnClass}
            disabled={busy}
            onClick={() => void onSetArchived(true)}
          >
            Archive
          </button>
        )}
      </div>
    </form>
  );
}

function CutsPane({
  populations,
  populationId,
  onPopulationId,
  metricKey,
  onMetricKey,
  component,
  onComponent,
  metrics,
}: {
  populations: ManagePopulation[];
  populationId: string;
  onPopulationId: (id: string) => void;
  metricKey: string;
  onMetricKey: (key: string) => void;
  component: string;
  onComponent: (value: string) => void;
  metrics: { key: string; label: string }[];
}) {
  const showComponent = metricKey === FORTY_YD_DASH;
  const sliceKey = `${populationId}|${metricKey}|${showComponent ? component : ""}`;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
        Cuts
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Six labels × boys / girls. Leave a cell empty to delete it on save.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm text-foreground">
          Population
          <select
            className={`${inputClass} mt-1`}
            value={populationId}
            onChange={(e) => onPopulationId(e.target.value)}
          >
            {populations.length === 0 ? (
              <option value="">No populations</option>
            ) : null}
            {populations.map((pop) => (
              <option key={pop.id} value={pop.id}>
                {pop.name}
                {isArchived(pop) ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-foreground">
          Metric
          <select
            className={`${inputClass} mt-1`}
            value={metricKey}
            onChange={(e) => onMetricKey(e.target.value)}
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {showComponent ? (
          <label className="block text-sm text-foreground">
            Component
            <select
              className={`${inputClass} mt-1`}
              value={component}
              onChange={(e) => onComponent(e.target.value)}
            >
              <option value="">(none)</option>
              {FORTY_YD_COMPONENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end text-xs text-foreground-muted">
            No component for this metric (stored as none).
          </p>
        )}
      </div>

      {populationId ? (
        <CutsGridForm
          key={sliceKey}
          populationId={populationId}
          metricKey={metricKey}
          component={showComponent ? component : ""}
        />
      ) : (
        <p className="mt-4 text-sm text-foreground-muted">
          Select a population to edit cuts.
        </p>
      )}
    </section>
  );
}

function CutsGridForm({
  populationId,
  metricKey,
  component,
}: {
  populationId: string;
  metricKey: string;
  component: string;
}) {
  const qs = new URLSearchParams({
    population_id: populationId,
    metric_key: metricKey,
  });
  if (component) qs.set("component", component);

  const { data, error, isLoading, mutate } = useSWR<{ data: ThresholdRow[] }>(
    `/api/norms/thresholds?${qs.toString()}`,
    jsonFetcher
  );

  const [grid, setGrid] = useState<CutsGrid | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState("");
  const [busy, setBusy] = useState(false);

  const display = grid ?? (data?.data ? cellsToGrid(data.data) : emptyCutsGrid());

  function setCell(label: ZoneLabel, gender: "M" | "F", value: string) {
    setGrid((prev) => {
      const next = prev ?? cellsToGrid(data?.data ?? []);
      return {
        ...next,
        [label]: { ...next[label], [gender]: value },
      };
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveOk("");
    const { cells, invalid } = gridToCells(display);
    if (invalid.length > 0) {
      const first = invalid[0];
      setSaveError(
        `Invalid number for ${first.label} / ${first.gender === "M" ? "boys" : "girls"}: "${first.raw}"`
      );
      return;
    }
    const unique = uniqueCutsPerGender(cells);
    if (!unique.ok) {
      setSaveError(unique.error);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/norms/thresholds?${qs.toString()}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error || `Save failed (${res.status})`);
        return;
      }
      setGrid(null);
      await mutate();
      setSaveOk("Cuts saved.");
    } catch {
      setSaveError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="mt-4">
      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error instanceof Error ? error.message : "Failed to load cuts"}
        </p>
      ) : null}
      {saveError ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {saveError}
        </p>
      ) : null}
      {saveOk ? (
        <p className="mb-3 text-sm text-success">{saveOk}</p>
      ) : null}
      {isLoading && !data ? (
        <p className="text-sm text-foreground-muted">Loading cuts…</p>
      ) : (
        <div className="grid gap-3">
          <div className="hidden text-xs font-medium uppercase tracking-wider text-foreground-muted sm:grid sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-2">
            <span>Label</span>
            <span>Boys (M)</span>
            <span>Girls (F)</span>
          </div>
          {ZONE_LABELS.map((label) => (
            <div
              key={label}
              className="grid gap-2 rounded-lg border border-border bg-surface-elevated p-3 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
            >
              <div className="inline-flex items-center gap-2 font-medium text-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: `var(--zone-${label})` }}
                  aria-hidden
                />
                <span className="capitalize">{label}</span>
              </div>
              {(["M", "F"] as const).map((gender) => (
                <label
                  key={gender}
                  className="block text-xs text-foreground-muted sm:text-sm sm:text-foreground"
                >
                  <span className="sm:sr-only">
                    {gender === "M" ? "Boys (M)" : "Girls (F)"}
                  </span>
                  <input
                    className={`${inputClass} mt-1 sm:mt-0`}
                    inputMode="decimal"
                    value={display[label][gender]}
                    onChange={(e) => setCell(label, gender, e.target.value)}
                    aria-label={`${label} ${gender === "M" ? "boys" : "girls"}`}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      <button type="submit" className={`${btnAccentClass} mt-4`} disabled={busy || isLoading}>
        Save cuts
      </button>
    </form>
  );
}

function DefaultsPane({
  populations,
  defaults,
  loadError,
  onMutate,
}: {
  populations: ManagePopulation[];
  defaults: SportDefault[];
  loadError: string;
  onMutate: () => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const activePops = populations.filter((p) => !isArchived(p));
  const byCell = new Map(
    defaults.map((d) => [`${d.hugo_group}|${d.metric_key}`, d.population_id])
  );

  async function saveCell(
    hugo_group: HugoGroup,
    metric_key: string,
    population_id: string | null
  ) {
    const key = `${hugo_group}|${metric_key}`;
    setBusyKey(key);
    setError("");
    try {
      const res = await fetch("/api/norms/defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hugo_group, metric_key, population_id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || `Save failed (${res.status})`);
        return;
      }
      await onMutate();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
        Sport defaults
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Hugo group × metric → population, or none. Missing means no badge for
        that sport.
      </p>
      {loadError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {loadError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {HUGO_GROUPS.map((group) => (
          <div
            key={group}
            className="rounded-lg border border-border bg-surface-elevated p-3"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {HUGO_GROUP_META[group].label}
            </h3>
            <div className="mt-2 grid gap-2">
              {NORMS_DEFAULTS_METRIC_KEYS.map((metric) => {
                const key = `${group}|${metric}`;
                const current = byCell.get(key) ?? "";
                const currentPop = populations.find((p) => p.id === current);
                const options = [...activePops];
                if (
                  currentPop &&
                  isArchived(currentPop) &&
                  !options.some((p) => p.id === currentPop.id)
                ) {
                  options.push(currentPop);
                }
                return (
                  <label key={metric} className="block text-sm text-foreground">
                    {metricLabel(metric)}
                    <select
                      className={`${inputClass} mt-1`}
                      value={current}
                      disabled={busyKey === key}
                      onChange={(e) => {
                        const v = e.target.value;
                        void saveCell(group, metric, v === "" ? null : v);
                      }}
                    >
                      <option value="">None</option>
                      {options.map((pop) => (
                        <option key={pop.id} value={pop.id}>
                          {pop.name}
                          {isArchived(pop) ? " (archived)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
