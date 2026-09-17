"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
} from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import { cellKey } from "@/lib/weight-room/confirm-scan";
import {
  buildGridRowsFromTemplate,
  type TemplateMovementForGrid,
} from "@/lib/weight-room/manual-log";
import { parseLoadReps } from "@/lib/weight-room/parse-load-reps";
import { splitWarmupDrills } from "@/lib/weight-room/split-warmup-drills";
import type {
  WorkoutMovementRow,
  WorkoutTemplateRow,
} from "@/lib/weight-room/insert-template";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type RosterAthlete = {
  id: string;
  first_name: string;
  last_name: string;
};

type ManualLogResult = {
  id: string;
  movement_id: string;
  set_index: number;
  raw_text: string | null;
  kind: string | null;
  load: number | null;
  reps: number | null;
  units: string | null;
  corrected: boolean;
};

type ManualLog = {
  id: string;
  athlete_id: string;
  template_id: string;
  scan_id: string | null;
  session_date: string;
  hugo_group: string;
  confirmed_at: string;
  results: ManualLogResult[];
};

type ManualLogPayload = {
  template: WorkoutTemplateRow & { movements: WorkoutMovementRow[] };
  roster: RosterAthlete[];
  logs: ManualLog[];
};

type TemplateListItem = WorkoutTemplateRow & { movement_count?: number };

type ClientRow = {
  source: "template" | "warmup_expand" | "added";
  /** Stable id for cell keys — real UUID or temp-* */
  rowKey: string;
  movementId: string | null;
  setIndex: number;
  defaultText: string;
  name: string;
  block?: string;
  label?: string;
};

type FocusedCell =
  | { kind: "default"; rowKey: string; setIndex: number }
  | {
      kind: "athlete";
      rowKey: string;
      setIndex: number;
      athleteId: string;
    }
  | null;

function errorText(json: { error?: string }, fallback: string): string {
  return json.error ?? fallback;
}

function athleteLabel(a: RosterAthlete): string {
  return `${a.last_name}, ${a.first_name}`;
}

function previewParsed(raw: string): string {
  const p = parseLoadReps(raw);
  if (p.kind === "load_reps") {
    return `${p.load} ${p.units} × ${p.reps}`;
  }
  if (p.kind === "bw") return "BW";
  if (p.kind === "amrap") return `AMRAP ${p.reps}`;
  if (p.kind === "output") return `${p.load} ${p.units}`;
  if (p.kind === "duration") return `${p.load}s`;
  if (p.kind === "reps") return `${p.reps} reps`;
  return raw.trim() ? "unknown" : "—";
}

function isTempId(id: string | null): boolean {
  return typeof id === "string" && id.startsWith("temp-");
}

function newTempId(): string {
  return `temp-${crypto.randomUUID()}`;
}

function toGridMovements(
  movements: WorkoutMovementRow[]
): TemplateMovementForGrid[] {
  return movements.map((m) => ({
    id: m.id,
    name: m.name,
    block: m.block,
    set_count: m.set_count,
    targets: m.targets,
    notes: m.notes ?? "",
    label: m.label ?? "",
  }));
}

/**
 * Build client rows from template movements.
 * Drop warmup_expand rows when a real set_count>0 movement already has that name
 * (after save, inserted drills replace provisional expand rows).
 */
function buildClientRows(movements: WorkoutMovementRow[]): ClientRow[] {
  const realNames = new Set(
    movements
      .filter((m) => m.set_count > 0)
      .map((m) => m.name.trim().toLowerCase())
  );
  const base = buildGridRowsFromTemplate(toGridMovements(movements));
  return base
    .filter((r) => {
      if (r.source !== "warmup_expand") return true;
      return !realNames.has(r.name.trim().toLowerCase());
    })
    .map((r) => {
      const rowKey =
        r.movementId != null ? r.movementId : newTempId();
      return {
        ...r,
        movementId: r.movementId ?? rowKey,
        rowKey,
      };
    });
}

function overridesFromLog(
  log: ManualLog | undefined,
  rows: ClientRow[]
): Record<string, string> {
  if (!log) return {};
  const byKey = new Map<string, string | null>();
  for (const result of log.results) {
    byKey.set(cellKey(result.movement_id, result.set_index), result.raw_text);
  }
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (isTempId(row.rowKey)) continue;
    const key = cellKey(row.rowKey, row.setIndex);
    if (!byKey.has(key)) continue;
    const raw = byKey.get(key);
    out[key] = raw == null ? "" : raw;
  }
  return out;
}

export function ManualLogClient() {
  const [hugoGroup, setHugoGroup] = useState<HugoGroup | "">("");
  const [templateId, setTemplateId] = useState("");
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<
    Record<string, Record<string, string>>
  >({});
  const [focused, setFocused] = useState<FocusedCell>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [journalWarnings, setJournalWarnings] = useState<string[]>([]);

  const templatesKey = hugoGroup
    ? `/api/weight-room/templates?hugo_group=${encodeURIComponent(hugoGroup)}`
    : null;
  const {
    data: templatesRes,
    error: templatesError,
    isLoading: templatesLoading,
  } = useSWR<{ data: TemplateListItem[] }>(templatesKey, fetcher);

  const logKey = templateId
    ? `/api/weight-room/manual-log?template_id=${encodeURIComponent(templateId)}`
    : null;
  const {
    data: logRes,
    error: logError,
    isLoading: logLoading,
    mutate: mutateLog,
  } = useSWR<{ data: ManualLogPayload }>(logKey, fetcher);

  const templates = templatesRes?.data ?? [];
  const payload = logRes?.data;
  const template = payload?.template ?? null;
  const roster = useMemo(() => payload?.roster ?? [], [payload?.roster]);
  const logs = useMemo(() => payload?.logs ?? [], [payload?.logs]);

  const logsByAthlete = useMemo(() => {
    const map = new Map<string, ManualLog>();
    for (const log of logs) map.set(log.athlete_id, log);
    return map;
  }, [logs]);

  // Reset selection when group or template changes
  useEffect(() => {
    setTemplateId("");
    setSelectedAthleteIds([]);
    setRows([]);
    setDefaults({});
    setOverrides({});
    setFocused(null);
    setActionError("");
    setActionMessage("");
    setJournalWarnings([]);
  }, [hugoGroup]);

  useEffect(() => {
    setSelectedAthleteIds([]);
    setRows([]);
    setDefaults({});
    setOverrides({});
    setFocused(null);
    setActionError("");
    setActionMessage("");
    setJournalWarnings([]);
  }, [templateId]);

  // Seed grid from loaded template
  useEffect(() => {
    if (!template) return;
    const nextRows = buildClientRows(template.movements);
    const nextDefaults: Record<string, string> = {};
    for (const row of nextRows) {
      nextDefaults[cellKey(row.rowKey, row.setIndex)] = row.defaultText;
    }
    setRows(nextRows);
    setDefaults(nextDefaults);
    setOverrides(() => {
      const next: Record<string, Record<string, string>> = {};
      for (const athleteId of selectedAthleteIds) {
        next[athleteId] = overridesFromLog(
          logsByAthlete.get(athleteId),
          nextRows
        );
      }
      return next;
    });
    // Seed from loaded template shape, not every unrelated SWR field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, template?.movements?.map((m) => m.id).join(",")]);

  const selectedAthletes = useMemo(
    () =>
      selectedAthleteIds
        .map((id) => roster.find((a) => a.id === id))
        .filter((a): a is RosterAthlete => Boolean(a)),
    [selectedAthleteIds, roster]
  );

  function toggleAthlete(athleteId: string) {
    setSelectedAthleteIds((prev) => {
      if (prev.includes(athleteId)) {
        return prev.filter((id) => id !== athleteId);
      }
      return [...prev, athleteId];
    });
    setOverrides((prev) => {
      if (prev[athleteId]) return prev;
      const log = logsByAthlete.get(athleteId);
      if (!log) return prev;
      return {
        ...prev,
        [athleteId]: overridesFromLog(log, rows),
      };
    });
  }

  // When rows become available after template load, fill overrides for already-selected athletes
  useEffect(() => {
    if (rows.length === 0) return;
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const athleteId of selectedAthleteIds) {
        if (athleteId in next) continue;
        const log = logsByAthlete.get(athleteId);
        if (!log) continue;
        next[athleteId] = overridesFromLog(log, rows);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows, selectedAthleteIds, logsByAthlete]);

  function setDefaultValue(row: ClientRow, value: string) {
    const key = cellKey(row.rowKey, row.setIndex);
    setDefaults((prev) => ({ ...prev, [key]: value }));
    setRows((prev) =>
      prev.map((r) =>
        r.rowKey === row.rowKey && r.setIndex === row.setIndex
          ? { ...r, defaultText: value }
          : r
      )
    );
  }

  function setAthleteCell(athleteId: string, row: ClientRow, value: string) {
    const key = cellKey(row.rowKey, row.setIndex);
    setOverrides((prev) => {
      const athlete = { ...(prev[athleteId] ?? {}) };
      if (value === "") {
        // Empty via typing = restore inherit (not explicit skip)
        delete athlete[key];
      } else {
        athlete[key] = value;
      }
      return { ...prev, [athleteId]: athlete };
    });
  }

  function clearAthleteCell(athleteId: string, row: ClientRow) {
    // Explicit skip: empty string override (distinct from inherit)
    const key = cellKey(row.rowKey, row.setIndex);
    setOverrides((prev) => ({
      ...prev,
      [athleteId]: { ...(prev[athleteId] ?? {}), [key]: "" },
    }));
  }

  function focusedRaw(): string {
    if (!focused) return "";
    const row = rows.find(
      (r) => r.rowKey === focused.rowKey && r.setIndex === focused.setIndex
    );
    if (!row) return "";
    const key = cellKey(row.rowKey, row.setIndex);
    if (focused.kind === "default") {
      return defaults[key] ?? row.defaultText;
    }
    const override = overrides[focused.athleteId]?.[key];
    if (override !== undefined) return override;
    return defaults[key] ?? row.defaultText;
  }

  function onExerciseNameChange(rowKey: string, name: string) {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, name } : r))
    );
  }

  function onExerciseNamePaste(
    e: ClipboardEvent<HTMLInputElement>,
    rowKey: string
  ) {
    const pasted = e.clipboardData.getData("text");
    const drills = splitWarmupDrills(pasted);
    if (drills.length <= 1) return;
    e.preventDefault();

    const idx = rows.findIndex((r) => r.rowKey === rowKey);
    if (idx < 0) return;
    const base = rows[idx]!;
    const exploded: ClientRow[] = drills.map((drill, i) => {
      const id = i === 0 ? base.rowKey : newTempId();
      return {
        source: "warmup_expand" as const,
        movementId: id,
        rowKey: id,
        setIndex: 0,
        defaultText: drill.dose,
        name: drill.name,
        block: base.block ?? "Warmup",
        label: base.label ?? "W",
      };
    });
    const nextDefaults: Record<string, string> = {};
    for (const r of exploded) {
      nextDefaults[cellKey(r.rowKey, r.setIndex)] = r.defaultText;
    }
    setRows((prev) => [
      ...prev.slice(0, idx),
      ...exploded,
      ...prev.slice(idx + 1),
    ]);
    setDefaults((d) => ({ ...d, ...nextDefaults }));
  }

  function addRow() {
    const id = newTempId();
    const row: ClientRow = {
      source: "added",
      movementId: id,
      rowKey: id,
      setIndex: 0,
      defaultText: "",
      name: "",
      block: "Main",
      label: "",
    };
    setRows((prev) => [...prev, row]);
    setDefaults((prev) => ({ ...prev, [cellKey(id, 0)]: "" }));
  }

  async function onSave() {
    if (!template || selectedAthletes.length === 0) return;
    setBusy(true);
    setActionError("");
    setActionMessage("");
    setJournalWarnings([]);

    try {
      const maxSort = template.movements.reduce(
        (max, m) => Math.max(max, m.sort_index),
        -1
      );
      let nextSort = maxSort + 1;

      const newMovements: Array<{
        client_temp_id: string;
        sort_index: number;
        label: string;
        name: string;
        block: string;
        set_count: number;
        targets: string[];
        notes: string;
        from_pair: boolean;
        speed_journal_metric_key: null;
        speed_journal_component: null;
      }> = [];

      const defaultsPayload: Record<string, string> = {};

      for (const row of rows) {
        const key = cellKey(row.rowKey, row.setIndex);
        defaultsPayload[key] =
          defaults[key] ?? row.defaultText ?? "";

        const needsInsert =
          (row.source === "warmup_expand" || row.source === "added") &&
          isTempId(row.rowKey);
        if (!needsInsert) continue;

        newMovements.push({
          client_temp_id: row.rowKey,
          sort_index: nextSort++,
          label: row.source === "warmup_expand" ? "W" : row.label ?? "",
          name: row.name.trim() || "Untitled",
          block:
            row.block?.trim() ||
            (row.source === "warmup_expand" ? "Warmup" : "Main"),
          set_count: 1,
          targets: [defaultsPayload[key]],
          notes: "",
          from_pair: false,
          speed_journal_metric_key: null,
          speed_journal_component: null,
        });
      }

      const athletesPayload = selectedAthletes.map((a) => ({
        athlete_id: a.id,
        cells: { ...(overrides[a.id] ?? {}) },
      }));

      const res = await fetch("/api/weight-room/manual-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          defaults: defaultsPayload,
          athletes: athletesPayload,
          new_movements: newMovements,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { journal_warnings?: string[] };
      };
      if (!res.ok) {
        throw new Error(errorText(json, "Save failed"));
      }

      const warnings = json.data?.journal_warnings ?? [];
      setJournalWarnings(warnings);
      setActionMessage(
        warnings.length > 0
          ? `Saved with ${warnings.length} journal warning${warnings.length === 1 ? "" : "s"}`
          : "Saved"
      );
      await mutateLog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    Boolean(template) && selectedAthletes.length > 0 && rows.length > 0 && !busy;

  const stickyExercise = "sticky left-0 z-20 bg-surface-elevated";
  const stickyDefault = "sticky left-[12rem] z-20 bg-surface-elevated";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Weight room
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              Manual log
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground-muted">
              Spreadsheet entry for a small group. Pick a card, choose athletes as
              columns, inherit defaults or override per cell.
            </p>
          </div>
          <Link
            href="/weight-room"
            className="text-sm text-foreground-muted hover:text-accent"
          >
            ← Hub
          </Link>
        </div>

        <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-surface-elevated p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground-muted">Hugo group</span>
            <select
              className="min-w-[12rem] rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              value={hugoGroup}
              onChange={(e) =>
                setHugoGroup((e.target.value || "") as HugoGroup | "")
              }
            >
              <option value="">Select group…</option>
              {HUGO_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {HUGO_GROUP_META[g].label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground-muted">Template</span>
            <select
              className="min-w-[16rem] rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              value={templateId}
              disabled={!hugoGroup || templatesLoading}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">
                {!hugoGroup
                  ? "Pick a group first"
                  : templatesLoading
                    ? "Loading…"
                    : "Select template…"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.session_date} — {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {templatesError && (
          <p className="mt-3 text-sm text-red-400">
            Failed to load templates
          </p>
        )}
        {logError && (
          <p className="mt-3 text-sm text-red-400">Failed to load manual log</p>
        )}
        {logLoading && templateId && (
          <p className="mt-3 text-sm text-foreground-muted">Loading card…</p>
        )}

        {template && (
          <>
            <section className="mt-6 rounded-xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium text-foreground">
                Athletes ({selectedAthletes.length} selected)
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Default none — check only the athletes logging this session.
              </p>
              <div className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {roster.map((a) => {
                  const checked = selectedAthleteIds.includes(a.id);
                  const hasLog = logsByAthlete.has(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-sm hover:border-accent/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAthlete(a.id)}
                      />
                      <span className="truncate text-foreground">
                        {athleteLabel(a)}
                        {hasLog ? (
                          <span className="ml-1 text-xs text-foreground-muted">
                            (logged)
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
                {roster.length === 0 && (
                  <p className="col-span-full text-sm text-foreground-muted">
                    No athletes on this roster.
                  </p>
                )}
              </div>
            </section>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50"
              >
                Add row
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void onSave()}
                className="rounded-lg border border-accent/60 bg-accent/20 px-4 py-2 text-sm font-medium text-foreground hover:border-accent disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              {actionMessage && (
                <span className="text-sm text-foreground-muted">
                  {actionMessage}
                </span>
              )}
              {actionError && (
                <span className="text-sm text-red-400">{actionError}</span>
              )}
            </div>

            {journalWarnings.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-300">
                {journalWarnings.map((w, i) => (
                  <li key={`${i}-${w}`}>{w}</li>
                ))}
              </ul>
            )}

            {focused && (
              <p className="mt-3 text-xs text-foreground-muted">
                Parse preview:{" "}
                <span className="text-foreground">{previewParsed(focusedRaw())}</span>
              </p>
            )}

            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated text-left text-foreground-muted">
                    <th
                      className={`${stickyExercise} border-r border-border px-3 py-2 font-medium`}
                      style={{ minWidth: "12rem", width: "12rem" }}
                    >
                      Exercise
                    </th>
                    <th
                      className={`${stickyDefault} border-r border-border px-3 py-2 font-medium`}
                      style={{ minWidth: "8rem", width: "8rem" }}
                    >
                      Default
                    </th>
                    {selectedAthletes.map((a) => (
                      <th
                        key={a.id}
                        className="whitespace-nowrap border-r border-border px-3 py-2 font-medium"
                        style={{ minWidth: "7.5rem" }}
                      >
                        {athleteLabel(a)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const dKey = cellKey(row.rowKey, row.setIndex);
                    const defaultVal = defaults[dKey] ?? row.defaultText;
                    const nameEditable =
                      row.source === "warmup_expand" || row.source === "added";
                    return (
                      <tr
                        key={`${row.rowKey}:${row.setIndex}`}
                        className="border-b border-border/60"
                      >
                        <td
                          className={`${stickyExercise} border-r border-border px-2 py-1.5 align-top`}
                          style={{ minWidth: "12rem", width: "12rem" }}
                        >
                          {nameEditable ? (
                            <input
                              className="w-full rounded border border-border bg-background px-2 py-1 text-foreground"
                              value={row.name}
                              placeholder="Exercise name"
                              onChange={(e) =>
                                onExerciseNameChange(row.rowKey, e.target.value)
                              }
                              onPaste={(e) =>
                                onExerciseNamePaste(e, row.rowKey)
                              }
                            />
                          ) : (
                            <div className="px-1 py-1 text-foreground">
                              <span>{row.name}</span>
                              {row.setIndex > 0 ||
                              (template.movements.find((m) => m.id === row.rowKey)
                                ?.set_count ?? 0) > 1 ? (
                                <span className="ml-1 text-xs text-foreground-muted">
                                  set {row.setIndex + 1}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td
                          className={`${stickyDefault} border-r border-border px-2 py-1.5 align-top`}
                          style={{ minWidth: "8rem", width: "8rem" }}
                        >
                          <input
                            className="w-full rounded border border-border bg-background px-2 py-1 text-foreground placeholder:text-foreground-muted/50"
                            value={defaultVal}
                            onChange={(e) =>
                              setDefaultValue(row, e.target.value)
                            }
                            onFocus={() =>
                              setFocused({
                                kind: "default",
                                rowKey: row.rowKey,
                                setIndex: row.setIndex,
                              })
                            }
                          />
                        </td>
                        {selectedAthletes.map((a) => {
                          const cellOverride = overrides[a.id]?.[dKey];
                          const display =
                            cellOverride !== undefined ? cellOverride : "";
                          return (
                            <td
                              key={a.id}
                              className="border-r border-border px-2 py-1.5 align-top"
                            >
                              <div className="flex gap-1">
                                <input
                                  className="w-full min-w-[5rem] rounded border border-border bg-background px-2 py-1 text-foreground placeholder:text-foreground-muted/50"
                                  value={display}
                                  placeholder={defaultVal || "—"}
                                  onChange={(e) =>
                                    setAthleteCell(a.id, row, e.target.value)
                                  }
                                  onFocus={() =>
                                    setFocused({
                                      kind: "athlete",
                                      rowKey: row.rowKey,
                                      setIndex: row.setIndex,
                                      athleteId: a.id,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  title="Clear / skip set"
                                  className="shrink-0 rounded border border-border px-1.5 text-xs text-foreground-muted hover:border-accent/50 hover:text-foreground"
                                  onClick={() => clearAthleteCell(a.id, row)}
                                >
                                  ⌫
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={2 + selectedAthletes.length}
                        className="px-3 py-6 text-center text-foreground-muted"
                      >
                        No exercises on this card. Add a row or pick another
                        template.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
