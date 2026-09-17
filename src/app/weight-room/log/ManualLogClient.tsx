"use client";

import {
  useEffect,
  useMemo,
  useRef,
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
import { splitComplexName } from "@/lib/weight-room/split-complex-name";
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
  source: "template" | "warmup_expand" | "added" | "complex_split";
  /** Stable id for cell keys — real UUID or temp-* */
  rowKey: string;
  movementId: string | null;
  /** When complex_split: original template movement to omit on save */
  parentMovementId?: string | null;
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
  if (p.kind === "bw") {
    return p.reps != null ? `BW × ${p.reps}` : "BW";
  }
  if (p.kind === "amrap") return `AMRAP ${p.reps}`;
  if (p.kind === "output") return `${p.load} ${p.units}`;
  if (p.kind === "duration") return `${p.load}s`;
  if (p.kind === "reps") return `${p.reps} reps`;
  if (p.kind === "distance") {
    return `${p.reps != null ? `${p.reps}×` : ""}${p.load}${p.units}`;
  }
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
 * Drop warmup_expand / complex_split rows when a real set_count>0 movement
 * already has that name (after save, inserted rows replace provisional ones).
 * Omit session-hidden template movement ids.
 */
function buildClientRows(
  movements: WorkoutMovementRow[],
  omitIds: readonly string[] = []
): ClientRow[] {
  const omit = new Set(omitIds);
  const visible = movements.filter((m) => !omit.has(m.id));
  const realNames = new Set(
    visible
      .filter((m) => m.set_count > 0)
      .map((m) => m.name.trim().toLowerCase())
  );
  const base = buildGridRowsFromTemplate(toGridMovements(visible));
  const tempByComplexGroup = new Map<string, string>();
  return base
    .filter((r) => {
      if (r.source !== "warmup_expand" && r.source !== "complex_split") {
        return true;
      }
      return !realNames.has(r.name.trim().toLowerCase());
    })
    .map((r) => {
      let rowKey: string;
      if (r.movementId != null) {
        rowKey = r.movementId;
      } else if (r.source === "complex_split") {
        const group = `${r.parentMovementId ?? ""}::${r.name}`;
        let id = tempByComplexGroup.get(group);
        if (!id) {
          id = newTempId();
          tempByComplexGroup.set(group, id);
        }
        rowKey = id;
      } else {
        rowKey = newTempId();
      }
      return {
        source: r.source,
        movementId: r.movementId ?? rowKey,
        parentMovementId: r.parentMovementId ?? null,
        rowKey,
        setIndex: r.setIndex,
        defaultText: r.defaultText,
        name: r.name,
        block: r.block,
        label: r.label,
      };
    });
}

function isInsertSource(
  source: ClientRow["source"]
): source is "warmup_expand" | "added" | "complex_split" {
  return (
    source === "warmup_expand" ||
    source === "added" ||
    source === "complex_split"
  );
}

function cleanCellKeys(
  defaults: Record<string, string>,
  overrides: Record<string, Record<string, string>>,
  keys: Iterable<string>
): {
  defaults: Record<string, string>;
  overrides: Record<string, Record<string, string>>;
} {
  const drop = new Set(keys);
  const nextDefaults = { ...defaults };
  for (const key of drop) delete nextDefaults[key];
  const nextOverrides: Record<string, Record<string, string>> = {};
  for (const [athleteId, cells] of Object.entries(overrides)) {
    const nextCells = { ...cells };
    for (const key of drop) delete nextCells[key];
    nextOverrides[athleteId] = nextCells;
  }
  return { defaults: nextDefaults, overrides: nextOverrides };
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
    // Prefer real movement UUID; for complex_split temps, try parent id
    const lookupIds = [
      row.rowKey,
      row.movementId,
      row.parentMovementId ?? undefined,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);

    let matched = false;
    for (const id of lookupIds) {
      if (isTempId(id)) continue;
      const key = cellKey(id, row.setIndex);
      if (!byKey.has(key)) continue;
      const raw = byKey.get(key);
      // Store under the grid row key so the cell UI finds it
      out[cellKey(row.rowKey, row.setIndex)] = raw == null ? "" : raw;
      matched = true;
      break;
    }
    if (matched) continue;
  }
  return out;
}

/** Fingerprint of log results so we re-hydrate when scan/manual data arrives. */
function logResultsFingerprint(log: ManualLog | undefined): string {
  if (!log) return "";
  return log.results
    .map(
      (r) =>
        `${r.movement_id}:${r.set_index}=${r.raw_text ?? ""}`
    )
    .join("|");
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
  const [omitMovementIds, setOmitMovementIds] = useState<string[]>([]);
  const omitMovementIdsRef = useRef(omitMovementIds);
  omitMovementIdsRef.current = omitMovementIds;
  /** athleteId → fingerprint of log used to hydrate overrides (avoid overwrite after edits) */
  const hydratedLogFpRef = useRef<Map<string, string>>(new Map());
  /** Template id we already auto-selected logged athletes for (once per card). */
  const autoSelectedForTemplateRef = useRef<string | null>(null);

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
    setOmitMovementIds([]);
    hydratedLogFpRef.current = new Map();
    autoSelectedForTemplateRef.current = null;
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
    setOmitMovementIds([]);
    hydratedLogFpRef.current = new Map();
    autoSelectedForTemplateRef.current = null;
  }, [templateId]);

  // Once per card: pre-check athletes who already have scan/manual logs
  useEffect(() => {
    if (!template || logLoading) return;
    if (autoSelectedForTemplateRef.current === template.id) return;
    autoSelectedForTemplateRef.current = template.id;
    const loggedIds = logs.map((l) => l.athlete_id);
    if (loggedIds.length === 0) return;
    setSelectedAthleteIds(loggedIds);
    // template object identity changes; we key off template.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, logs, logLoading]);

  // Seed grid from loaded template
  useEffect(() => {
    if (!template) return;
    const nextRows = buildClientRows(
      template.movements,
      omitMovementIdsRef.current
    );
    const nextDefaults: Record<string, string> = {};
    for (const row of nextRows) {
      nextDefaults[cellKey(row.rowKey, row.setIndex)] = row.defaultText;
    }
    setRows(nextRows);
    setDefaults(nextDefaults);
    // Overrides hydrated in dedicated effect once rows + logs + selection are ready
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
        hydratedLogFpRef.current.delete(athleteId);
        setOverrides((o) => {
          if (!(athleteId in o)) return o;
          const next = { ...o };
          delete next[athleteId];
          return next;
        });
        return prev.filter((id) => id !== athleteId);
      }
      return [...prev, athleteId];
    });
  }

  // Hydrate athlete columns from existing scan / prior manual entry.
  // Re-runs when logs arrive after selection so we never save prescription defaults over real data.
  useEffect(() => {
    if (rows.length === 0) return;
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      const selected = new Set(selectedAthleteIds);

      for (const athleteId of selectedAthleteIds) {
        const log = logsByAthlete.get(athleteId);
        const fp = logResultsFingerprint(log);
        const prevFp = hydratedLogFpRef.current.get(athleteId);
        const cur = next[athleteId];

        if (!log) {
          if (!(athleteId in next)) {
            next[athleteId] = {};
            changed = true;
          }
          continue;
        }

        const fromLog = overridesFromLog(log, rows);

        if (cur == null || prevFp !== fp) {
          // First hydrate, or server log data changed — take log as base
          next[athleteId] = fromLog;
          hydratedLogFpRef.current.set(athleteId, fp);
          changed = true;
          continue;
        }

        // Same log: only fill keys the athlete column is still missing (new set rows, etc.)
        let merged = cur;
        for (const [key, value] of Object.entries(fromLog)) {
          if (key in cur) continue;
          if (merged === cur) merged = { ...cur };
          merged[key] = value;
        }
        if (merged !== cur) {
          next[athleteId] = merged;
          changed = true;
        }
      }

      for (const athleteId of Object.keys(next)) {
        if (selected.has(athleteId)) continue;
        delete next[athleteId];
        hydratedLogFpRef.current.delete(athleteId);
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
    const complexParts =
      drills.length > 1 ? [] : splitComplexName(pasted);

    if (drills.length <= 1 && complexParts.length <= 1) return;
    e.preventDefault();

    const groupIndexes = rows
      .map((r, i) => (r.rowKey === rowKey ? i : -1))
      .filter((i) => i >= 0);
    if (groupIndexes.length === 0) return;
    const firstIdx = groupIndexes[0]!;
    const lastIdx = groupIndexes[groupIndexes.length - 1]!;
    const base = rows[firstIdx]!;

    let exploded: ClientRow[];
    if (drills.length > 1) {
      exploded = drills.map((drill, i) => {
        const id = i === 0 ? base.rowKey : newTempId();
        return {
          source: "warmup_expand" as const,
          movementId: id,
          rowKey: id,
          parentMovementId: null,
          setIndex: 0,
          defaultText: drill.dose,
          name: drill.name,
          block: base.block ?? "Warmup",
          label: base.label ?? "W",
        };
      });
    } else {
      const parentId = !isTempId(base.rowKey)
        ? base.rowKey
        : (base.parentMovementId ?? null);
      exploded = complexParts.map((part) => {
        const id = newTempId();
        return {
          source: (parentId ? "complex_split" : "added") as
            | "complex_split"
            | "added",
          movementId: id,
          rowKey: id,
          parentMovementId: parentId,
          setIndex: 0,
          defaultText: "",
          name: part,
          block: base.block ?? "Main",
          label: base.label ?? "",
        };
      });
      if (parentId && !isTempId(parentId)) {
        setOmitMovementIds((prev) =>
          prev.includes(parentId) ? prev : [...prev, parentId]
        );
      }
    }

    const dropKeys = rows
      .filter((r) => r.rowKey === rowKey)
      .map((r) => cellKey(r.rowKey, r.setIndex));
    const nextDefaults: Record<string, string> = {};
    for (const r of exploded) {
      nextDefaults[cellKey(r.rowKey, r.setIndex)] = r.defaultText;
    }
    setRows((prev) => [
      ...prev.slice(0, firstIdx),
      ...exploded,
      ...prev.slice(lastIdx + 1),
    ]);
    setDefaults((d) => {
      const cleaned = { ...d };
      for (const key of dropKeys) delete cleaned[key];
      return { ...cleaned, ...nextDefaults };
    });
    setOverrides((prev) => {
      const { overrides: cleaned } = cleanCellKeys({}, prev, dropKeys);
      return cleaned;
    });
  }

  function addRow() {
    const id = newTempId();
    const row: ClientRow = {
      source: "added",
      movementId: id,
      rowKey: id,
      parentMovementId: null,
      setIndex: 0,
      defaultText: "",
      name: "",
      block: "Main",
      label: "",
    };
    setRows((prev) => [...prev, row]);
    setDefaults((prev) => ({ ...prev, [cellKey(id, 0)]: "" }));
  }

  function addSet(rowKey: string) {
    const group = rows.filter((r) => r.rowKey === rowKey);
    if (group.length === 0) return;
    const sample = group[0]!;
    const newSetIndex =
      Math.max(...group.map((r) => r.setIndex)) + 1;
    const newRow: ClientRow = {
      ...sample,
      setIndex: newSetIndex,
      defaultText: "",
    };
    const lastIdx = rows.map((r) => r.rowKey).lastIndexOf(rowKey);
    setRows((prev) => [
      ...prev.slice(0, lastIdx + 1),
      newRow,
      ...prev.slice(lastIdx + 1),
    ]);
    setDefaults((prev) => ({
      ...prev,
      [cellKey(rowKey, newSetIndex)]: "",
    }));
  }

  function removeSet(rowKey: string) {
    const group = rows.filter((r) => r.rowKey === rowKey);
    if (group.length <= 1) return;
    const maxSet = Math.max(...group.map((r) => r.setIndex));
    const key = cellKey(rowKey, maxSet);
    setRows((prev) =>
      prev.filter((r) => !(r.rowKey === rowKey && r.setIndex === maxSet))
    );
    setDefaults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOverrides((prev) => {
      const { overrides: cleaned } = cleanCellKeys({}, prev, [key]);
      return cleaned;
    });
  }

  function removeMovement(rowKey: string) {
    const group = rows.filter((r) => r.rowKey === rowKey);
    if (group.length === 0) return;
    const keys = group.map((r) => cellKey(r.rowKey, r.setIndex));
    if (!isTempId(rowKey)) {
      setOmitMovementIds((prev) =>
        prev.includes(rowKey) ? prev : [...prev, rowKey]
      );
    }
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
    setDefaults((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
    setOverrides((prev) => {
      const { overrides: cleaned } = cleanCellKeys({}, prev, keys);
      return cleaned;
    });
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
        defaultsPayload[key] = defaults[key] ?? row.defaultText ?? "";
      }

      const insertGroups = new Map<string, ClientRow[]>();
      for (const row of rows) {
        if (!isInsertSource(row.source) || !isTempId(row.rowKey)) continue;
        const list = insertGroups.get(row.rowKey) ?? [];
        list.push(row);
        insertGroups.set(row.rowKey, list);
      }
      for (const [tempId, group] of insertGroups) {
        const sorted = [...group].sort((a, b) => a.setIndex - b.setIndex);
        const sample = sorted[0]!;
        newMovements.push({
          client_temp_id: tempId,
          sort_index: nextSort++,
          label:
            sample.source === "warmup_expand" ? "W" : sample.label ?? "",
          name: sample.name.trim() || "Untitled",
          block:
            sample.block?.trim() ||
            (sample.source === "warmup_expand" ? "Warmup" : "Main"),
          set_count: sorted.length,
          targets: sorted.map(
            (r) => defaultsPayload[cellKey(r.rowKey, r.setIndex)] ?? ""
          ),
          notes: "",
          from_pair: false,
          speed_journal_metric_key: null,
          speed_journal_component: null,
        });
      }

      const complexParents = new Set<string>();
      for (const row of rows) {
        if (
          row.source === "complex_split" &&
          row.parentMovementId &&
          !isTempId(row.parentMovementId)
        ) {
          complexParents.add(row.parentMovementId);
        }
      }

      const omitPayload = [
        ...new Set([...omitMovementIds, ...complexParents]),
      ];

      const movementUpdates: Array<{
        id: string;
        name: string;
        set_count: number;
        targets: string[];
      }> = [];
      const templateGroups = new Map<string, ClientRow[]>();
      for (const row of rows) {
        if (isTempId(row.rowKey) || row.source !== "template") continue;
        if (omitPayload.includes(row.rowKey)) continue;
        const list = templateGroups.get(row.rowKey) ?? [];
        list.push(row);
        templateGroups.set(row.rowKey, list);
      }
      for (const [id, group] of templateGroups) {
        const sorted = [...group].sort((a, b) => a.setIndex - b.setIndex);
        movementUpdates.push({
          id,
          name: sorted[0]!.name.trim() || "Untitled",
          set_count: sorted.length,
          targets: sorted.map(
            (r) => defaultsPayload[cellKey(r.rowKey, r.setIndex)] ?? ""
          ),
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
          omit_movement_ids: omitPayload,
          movement_updates: movementUpdates,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { journal_warnings?: string[] };
      };
      if (!res.ok) {
        throw new Error(errorText(json, "Save failed"));
      }

      const nextOmit = omitPayload;
      omitMovementIdsRef.current = nextOmit;
      setOmitMovementIds(nextOmit);

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

  const setCountByRowKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.rowKey, (map.get(row.rowKey) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const stickyExercise = "sticky left-0 z-20 bg-surface-elevated";
  const stickyDefault = "sticky left-[14rem] z-20 bg-surface-elevated";

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
                Athletes marked (logged) already have scan or manual data for
                this card — they are pre-selected and cells are filled so you
                can edit without overwriting. Uncheck anyone you are not
                updating.
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
                      style={{ minWidth: "14rem", width: "14rem" }}
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
                    const groupSetCount = setCountByRowKey.get(row.rowKey) ?? 1;
                    return (
                      <tr
                        key={`${row.rowKey}:${row.setIndex}`}
                        className="border-b border-border/60"
                      >
                        <td
                          className={`${stickyExercise} border-r border-border px-2 py-1.5 align-top`}
                          style={{ minWidth: "14rem", width: "14rem" }}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground"
                                value={row.name}
                                placeholder="Exercise name"
                                onChange={(e) =>
                                  onExerciseNameChange(
                                    row.rowKey,
                                    e.target.value
                                  )
                                }
                                onPaste={(e) =>
                                  onExerciseNamePaste(e, row.rowKey)
                                }
                              />
                              {groupSetCount > 1 ? (
                                <span className="shrink-0 text-[10px] uppercase tracking-wide text-foreground-muted">
                                  set {row.setIndex + 1}
                                </span>
                              ) : null}
                            </div>
                            {row.setIndex === 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  title="Remove set"
                                  disabled={groupSetCount <= 1}
                                  className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground-muted hover:border-accent/50 hover:text-foreground disabled:opacity-30"
                                  onClick={() => removeSet(row.rowKey)}
                                >
                                  −
                                </button>
                                <button
                                  type="button"
                                  title="Add set"
                                  className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground-muted hover:border-accent/50 hover:text-foreground"
                                  onClick={() => addSet(row.rowKey)}
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  title="Remove movement"
                                  className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground-muted hover:border-red-400/50 hover:text-red-300"
                                  onClick={() => removeMovement(row.rowKey)}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
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
