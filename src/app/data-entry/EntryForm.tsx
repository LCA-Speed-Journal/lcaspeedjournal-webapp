"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import metricsData from "@/lib/metrics.json";
import { segmentInputToCumulativeInput } from "@/lib/parser";
import {
  addOptionVisible,
  buildAthleteCreatePayload,
  isAddOptionIndex,
  nextHighlightIndex,
  parseNameFromQuery,
  pickerOptionCount,
} from "@/lib/quick-athlete";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type MetricDef = {
  display_name: string;
  input_units: string;
  input_structure: string;
  default_splits: (number | string)[];
};

const metrics = metricsData as Record<string, MetricDef>;

function isSplitMetricKey(metricKey: string): boolean {
  return metricKey.endsWith("_Split");
}

function metricOptions() {
  return Object.entries(metrics).map(([key, m]) => ({
    key,
    label: m.display_name,
    inputStructure: m.input_structure,
    inputUnits: m.input_units,
    defaultSplits: m.default_splits,
  }));
}

function inputHint(
  metric: ReturnType<typeof metricOptions>[0] | null,
  sessionSplits?: Record<string, number[]> | null,
  splitEntryMode?: "cumulative" | "segment"
): string {
  if (!metric) return "Select a metric";
  const isSplitMetric = isSplitMetricKey(metric.key);
  const splitConfig = sessionSplits?.[metric.key];
  const splitCount = Array.isArray(splitConfig) && splitConfig.length > 0 ? splitConfig.length : 0;

  if (metric.inputStructure === "single_interval") {
    if (isSplitMetric && splitCount > 0) {
      const splitsStr = splitConfig!.map((m) => `${m}m`).join(", ");
      if (splitEntryMode === "segment" && splitCount > 1) {
        const ex = splitCount === 2 ? "0.95|0.90" : "0.95|0.90|0.80";
        return `Splits: ${splitsStr} — e.g. ${ex} (segment times, ${metric.inputUnits})`;
      }
      return `Splits: ${splitsStr} — e.g. 1.85 (${metric.inputUnits})`;
    }
    return `e.g. 1.45 (${metric.inputUnits})`;
  }
  if (metric.inputStructure === "cumulative") {
    const splits = sessionSplits?.[metric.key] ?? (metric.defaultSplits as number[]);
    const n = Array.isArray(splits) && splits.length > 0 ? splits.length : 2;
    const splitsStr = Array.isArray(splits) && splits.length > 0
      ? splits.map((m) => `${m}m`).join(", ")
      : null;
    if (splitEntryMode === "segment") {
      const ex =
        n === 1
          ? "1.85"
          : n === 2
            ? "0.95|0.90"
            : n === 3
              ? "0.95|0.90|0.80"
              : "0.95|0.90|0.80|0.75";
      const base = `e.g. ${ex} (segment times, ${n} values, ${metric.inputUnits})`;
      return splitsStr ? `Splits: ${splitsStr} — ${base}` : base;
    }
    const ex =
      n === 1
        ? "1.85"
        : n === 2
          ? "0.95|1.85"
          : n === 3
            ? "0.95|1.85|2.65"
            : "0.95|1.85|2.65|3.40";
    const base = `e.g. ${ex} (${n} pipe- or comma-separated values, ${metric.inputUnits})`;
    return splitsStr ? `Splits: ${splitsStr} — ${base}` : base;
  }
  if (metric.inputStructure === "paired_components") {
    const labels = (metric.defaultSplits as string[])?.join("|") ?? "L|R";
    return `e.g. 450|420 (${labels}, ${metric.inputUnits})`;
  }
  if (metric.inputStructure === "sided_optional") {
    return `e.g. 4.52 (Athlete-Comfort) or 4.48|4.56 (L|R, ${metric.inputUnits})`;
  }
  return "";
}

type AthleteItem = {
  id: string;
  first_name: string;
  last_name: string;
  athlete_type?: string;
  graduating_class?: number | null;
};

function athleteDisplayName(a: AthleteItem): string {
  const t = a.athlete_type ?? "athlete";
  const suffix = t === "staff" ? " (Staff)" : t === "alumni" ? " (Alumni)" : "";
  return `${a.first_name} ${a.last_name}${suffix}`;
}

type EntryFormProps = {
  /** When set, session dropdown is hidden and this id is used for POST. */
  sessionId?: string;
  /** Called after successful POST (e.g. to mutate entries list). */
  onSuccess?: () => void;
};

export function EntryForm({ sessionId: sessionIdProp, onSuccess }: EntryFormProps = {}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [sessionId, setSessionId] = useState(sessionIdProp ?? "");
  const [activeOnly, setActiveOnly] = useState(true);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<{ id: string; displayName: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [metricKey, setMetricKey] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [splitValues, setSplitValues] = useState<string[]>([]);
  const [splitEntryMode, setSplitEntryMode] = useState<"cumulative" | "segment">("cumulative");
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const athleteInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const quickCreatingRef = useRef(false);
  const quickCreateGenRef = useRef(0);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickFirst, setQuickFirst] = useState("");
  const [quickLast, setQuickLast] = useState("");
  const [quickGender, setQuickGender] = useState<"M" | "F">("M");
  const [quickAlumni, setQuickAlumni] = useState(false);
  const [quickGrade, setQuickGrade] = useState<"" | "9" | "10" | "11" | "12">("");
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState("");

  useEffect(() => {
    if (sessionIdProp) setSessionId(sessionIdProp);
  }, [sessionIdProp]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const { data: sessionsRes } = useSWR<{
    data: {
      id: string;
      session_date: string;
      phase: string;
      phase_week: number;
      day_metrics?: string[] | null;
      day_splits?: Record<string, number[]> | null;
    }[];
  }>("/api/sessions", fetcher);
  const { data: athletesAllRes } = useSWR<{ data: AthleteItem[] }>("/api/athletes", fetcher);
  const { data: athletesActiveRes } = useSWR<{ data: AthleteItem[] }>("/api/athletes?active=true", fetcher);

  const sessions = sessionsRes?.data ?? [];
  const athletes = activeOnly ? (athletesActiveRes?.data ?? []) : (athletesAllRes?.data ?? []);
  const athleteId = selectedAthlete?.id ?? "";
  const athleteSearch = athleteQuery.trim().toLowerCase();
  const filteredAthletes = athleteSearch
    ? athletes.filter(
        (a) =>
          `${a.first_name} ${a.last_name}`.toLowerCase().includes(athleteSearch)
      )
    : athletes;
  const showAddOption = addOptionVisible(athleteQuery);
  const optionCount = pickerOptionCount(filteredAthletes.length, athleteQuery);
  const addHighlighted = isAddOptionIndex(
    highlightedIndex,
    filteredAthletes.length,
    athleteQuery
  );

  const openDropdown = useCallback(() => setDropdownOpen(true), []);
  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setHighlightedIndex(0);
  }, []);
  const selectAthlete = useCallback((a: AthleteItem) => {
    setSelectedAthlete({ id: a.id, displayName: athleteDisplayName(a) });
    setAthleteQuery("");
    setDropdownOpen(false);
  }, []);

  const closeQuickCreate = useCallback(() => {
    quickCreateGenRef.current += 1;
    setQuickCreateOpen(false);
    setQuickFirst("");
    setQuickLast("");
    setQuickGender("M");
    setQuickAlumni(false);
    setQuickGrade("");
    setQuickCreateError("");
  }, []);

  const openQuickCreate = useCallback(() => {
    const parsed = parseNameFromQuery(athleteQuery);
    setQuickFirst(parsed.first);
    setQuickLast(parsed.last);
    setQuickGender("M");
    setQuickAlumni(false);
    setQuickGrade("");
    setQuickCreateError("");
    setQuickCreateOpen(true);
    setDropdownOpen(false);
    setHighlightedIndex(0);
  }, [athleteQuery]);

  async function submitQuickCreate() {
    const first = quickFirst.trim();
    const last = quickLast.trim();
    if (!first || !last || quickCreatingRef.current) return;
    quickCreatingRef.current = true;
    setQuickCreateError("");
    setQuickCreating(true);
    const gen = quickCreateGenRef.current;
    try {
      const payload = buildAthleteCreatePayload({
        firstName: first,
        lastName: last,
        gender: quickGender,
        alumniStaff: quickAlumni,
        grade: quickAlumni || quickGrade === "" ? null : Number(quickGrade),
      });
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (gen !== quickCreateGenRef.current) return;
      if (!res.ok) {
        setQuickCreateError(json.error ?? "Failed to create athlete");
        return;
      }
      const created = json.data as AthleteItem;
      if (!created?.id) {
        setQuickCreateError("Failed to create athlete");
        return;
      }
      selectAthlete(created);
      closeQuickCreate();
      void globalMutate("/api/athletes");
      void globalMutate("/api/athletes?active=true");
    } catch {
      if (gen !== quickCreateGenRef.current) return;
      setQuickCreateError("Network error");
    } finally {
      quickCreatingRef.current = false;
      setQuickCreating(false);
    }
  }

  useEffect(() => {
    if (dropdownOpen) setHighlightedIndex(0);
  }, [athleteQuery, athletes, activeOnly, dropdownOpen]);

  useEffect(() => {
    const id = addHighlighted
      ? "entry_athlete_option_add"
      : filteredAthletes[highlightedIndex]
        ? `entry_athlete_option_${filteredAthletes[highlightedIndex].id}`
        : null;
    if (!id) return;
    const el = listboxRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, filteredAthletes, addHighlighted]);

  const effectiveSessionId = sessionIdProp ?? sessionId;
  const allOptions = metricOptions();
  const selectedSession = sessions.find((s) => s.id === effectiveSessionId);
  const sessionMetrics = selectedSession?.day_metrics;
  const options =
    Array.isArray(sessionMetrics) && sessionMetrics.length > 0
      ? allOptions.filter((o) => sessionMetrics.includes(o.key))
      : allOptions;
  const selectedMetric = options.find((o) => o.key === metricKey) ?? null;

  const cumulativeSplits =
    selectedSession?.day_splits?.[metricKey] ?? selectedMetric?.defaultSplits;
  const splitCount = Array.isArray(cumulativeSplits) && cumulativeSplits.length > 0
    ? cumulativeSplits.length
    : 0;
  const selectedMetricIsSplit = selectedMetric != null && isSplitMetricKey(selectedMetric.key);
  const showSplitEntryToggle =
    selectedMetric != null &&
    splitCount > 0 &&
    (selectedMetric.inputStructure === "cumulative" || selectedMetricIsSplit);
  const showMobileSplits =
    isMobile &&
    selectedMetric?.inputStructure === "cumulative" &&
    splitCount > 0;

  useEffect(() => {
    if (showMobileSplits && splitValues.length !== splitCount) {
      setSplitValues(Array(splitCount).fill(""));
    }
    if (!showMobileSplits && splitValues.length > 0) {
      setSplitValues([]);
    }
  }, [showMobileSplits, splitCount, metricKey, sessionId]);

  async function submitEntry() {
    setError("");
    setSuccess("");
    setLoading(true);
    let rawToSend: string;
    if (showMobileSplits) {
      const str = splitValues.map((v) => v.trim()).join("|");
      if (splitEntryMode === "segment") {
        const converted = segmentInputToCumulativeInput(str);
        if (converted === null) {
          setError("Enter numbers for each segment");
          setLoading(false);
          return;
        }
        rawToSend = converted;
      } else {
        rawToSend = str;
      }
    } else if (showSplitEntryToggle && splitEntryMode === "segment") {
      const converted =
        selectedMetricIsSplit
          ? rawInput.trim()
          : segmentInputToCumulativeInput(rawInput.trim());
      if (converted === null) {
        setError("Enter numbers for each segment");
        setLoading(false);
        return;
      }
      rawToSend = converted;
    } else {
      rawToSend = rawInput.trim();
    }
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: effectiveSessionId,
          athlete_id: athleteId,
          metric_key: metricKey,
          raw_input: rawToSend,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save entry");
        return;
      }
      const count = json.data?.count ?? 1;
      setSuccess(`Saved ${count} ${count === 1 ? "entry" : "entries"}`);
      setRawInput("");
      if (showMobileSplits) setSplitValues(Array(splitCount).fill(""));
      // Invalidate leaderboard cache so live leaderboard (and any open tab) refetches
      void globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/leaderboard"),
        undefined,
        { revalidate: true }
      );
      onSuccess?.();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quickCreateOpen) {
      void submitQuickCreate();
      return;
    }
    void submitEntry();
  }

  const allSplitsFilled =
    !showMobileSplits || splitValues.length === 0 ||
    splitValues.every((v) => v.trim() !== "");
  const hasValue = showMobileSplits
    ? allSplitsFilled && splitValues.length === splitCount
    : rawInput.trim() !== "";
  const canSubmit = effectiveSessionId && athleteId && metricKey && hasValue;

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20 md:p-6"
    >
      {!sessionIdProp && (
        <div>
          <label htmlFor="entry_session" className="mb-1 block text-sm font-medium text-foreground">
            Session
          </label>
          <select
            id="entry_session"
            value={sessionId}
            onChange={(e) => {
              const newId = e.target.value;
              setSessionId(newId);
              const sess = sessions.find((s) => s.id === newId);
              const dm = Array.isArray(sess?.day_metrics) ? sess!.day_metrics : null;
              if (metricKey && dm && dm.length > 0 && !dm.includes(metricKey)) {
                setMetricKey("");
                setRawInput("");
                setSplitValues([]);
                setSplitEntryMode("cumulative");
              }
            }}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
            required
          >
            <option value="">Select session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.session_date).slice(0, 10)} — {s.phase} wk {s.phase_week}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={() => setActiveOnly((v) => !v)}
            className="rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm font-medium text-foreground">Active only</span>
        </label>
        <label htmlFor="entry_athlete" className="mb-1 block text-sm font-medium text-foreground">
          Athlete
        </label>
        <div className="relative">
          <input
            id="entry_athlete"
            ref={athleteInputRef}
            type="text"
            autoComplete="off"
            value={selectedAthlete ? selectedAthlete.displayName : athleteQuery}
            onChange={(e) => {
              setAthleteQuery(e.target.value);
              setSelectedAthlete(null);
              setDropdownOpen(true);
              closeQuickCreate();
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(closeDropdown, 150)}
            onKeyDown={(e) => {
              if (quickCreateOpen && e.key === "Enter") {
                e.preventDefault();
                return;
              }
              if (!dropdownOpen) {
                if (e.key === "ArrowDown" || e.key === " ") openDropdown();
                return;
              }
              if (e.key === "Escape") {
                closeDropdown();
                athleteInputRef.current?.blur();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((i) => nextHighlightIndex(i, optionCount, 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((i) => nextHighlightIndex(i, optionCount, -1));
                return;
              }
              if (e.key === "Enter") {
                if (addHighlighted) {
                  e.preventDefault();
                  openQuickCreate();
                  return;
                }
                if (filteredAthletes[highlightedIndex]) {
                  e.preventDefault();
                  selectAthlete(filteredAthletes[highlightedIndex]);
                }
              }
            }}
            placeholder="Search or select athlete…"
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 pr-8 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls="entry_athlete_listbox"
            aria-activedescendant={
              dropdownOpen && addHighlighted
                ? "entry_athlete_option_add"
                : dropdownOpen && filteredAthletes[highlightedIndex]
                  ? `entry_athlete_option_${filteredAthletes[highlightedIndex].id}`
                  : undefined
            }
          />
          {selectedAthlete && (
            <button
              type="button"
              onClick={() => {
                setSelectedAthlete(null);
                setAthleteQuery("");
                athleteInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-foreground-muted hover:bg-surface hover:text-foreground"
              aria-label="Clear athlete"
            >
              Clear
            </button>
          )}
          {dropdownOpen && (
            <ul
              id="entry_athlete_listbox"
              ref={listboxRef}
              role="listbox"
              className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-border bg-surface-elevated py-1 shadow-lg"
            >
              {filteredAthletes.length === 0 ? (
                <li className="px-3 py-2 text-sm text-foreground-muted" role="presentation">
                  No athletes match
                </li>
              ) : (
                filteredAthletes.map((a, i) => (
                  <li
                    key={a.id}
                    id={`entry_athlete_option_${a.id}`}
                    role="option"
                    aria-selected={selectedAthlete?.id === a.id}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      i === highlightedIndex
                        ? "bg-accent/20 text-foreground"
                        : "text-foreground hover:bg-surface"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectAthlete(a);
                    }}
                  >
                    {athleteDisplayName(a)}
                  </li>
                ))
              )}
              {showAddOption ? (
                <li
                  id="entry_athlete_option_add"
                  role="option"
                  aria-selected={addHighlighted}
                  className={`cursor-pointer px-3 py-2 text-sm font-medium ${
                    addHighlighted
                      ? "bg-accent/20 text-foreground"
                      : "text-accent hover:bg-surface"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    openQuickCreate();
                  }}
                >
                  Add {athleteQuery.trim()}…
                </li>
              ) : null}
            </ul>
          )}
        </div>
        {quickCreateOpen ? (
          <div
            className="mt-3 space-y-3 rounded-lg border border-border bg-surface-elevated p-3"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const target = e.target as HTMLElement | null;
              if (target?.closest("button")) return;
              e.preventDefault();
              e.stopPropagation();
              void submitQuickCreate();
            }}
          >
            <p className="text-sm font-medium text-foreground">New athlete</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="quick_first" className="mb-1 block text-xs text-foreground-muted">
                  First name
                </label>
                <input
                  id="quick_first"
                  type="text"
                  value={quickFirst}
                  onChange={(e) => setQuickFirst(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="quick_last" className="mb-1 block text-xs text-foreground-muted">
                  Last name
                </label>
                <input
                  id="quick_last"
                  type="text"
                  value={quickLast}
                  onChange={(e) => setQuickLast(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="quick_gender" className="mb-1 block text-xs text-foreground-muted">
                  M / F
                </label>
                <select
                  id="quick_gender"
                  value={quickGender}
                  onChange={(e) => setQuickGender(e.target.value as "M" | "F")}
                  className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
                <input
                  type="checkbox"
                  checked={quickAlumni}
                  onChange={() => {
                    setQuickAlumni((v) => {
                      const next = !v;
                      if (next) setQuickGrade("");
                      return next;
                    });
                  }}
                  className="rounded border-border bg-surface text-accent focus:ring-accent"
                />
                <span className="text-sm text-foreground">Alumni/staff</span>
              </label>
              {!quickAlumni ? (
                <div className="col-span-2">
                  <label htmlFor="quick_grade" className="mb-1 block text-xs text-foreground-muted">
                    Grade (optional)
                  </label>
                  <select
                    id="quick_grade"
                    value={quickGrade}
                    onChange={(e) =>
                      setQuickGrade(e.target.value as "" | "9" | "10" | "11" | "12")
                    }
                    className="min-h-[44px] w-full rounded border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-accent"
                  >
                    <option value="">Skip</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                  </select>
                </div>
              ) : null}
            </div>
            {quickCreateError ? (
              <p className="text-sm text-danger" role="alert">
                {quickCreateError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  quickCreating || !quickFirst.trim() || !quickLast.trim()
                }
                onClick={() => void submitQuickCreate()}
                className="min-h-[44px] flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
              >
                {quickCreating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={closeQuickCreate}
                className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="entry_metric" className="mb-1 block text-sm font-medium text-foreground">
          Metric
          {sessionMetrics && sessionMetrics.length > 0 && (
            <span className="ml-1 font-normal text-foreground-muted">(from session)</span>
          )}
        </label>
        <select
          id="entry_metric"
          value={metricKey}
          onChange={(e) => {
            setMetricKey(e.target.value);
            setRawInput("");
            setSplitValues([]);
            setSplitEntryMode("cumulative");
          }}
          className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          required
        >
          <option value="">Select metric</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="entry_raw" className="mb-1 block text-sm font-medium text-foreground">
          Value
        </label>
        {showSplitEntryToggle && (
          <div className="mb-2 flex gap-1 rounded border border-border bg-surface-elevated p-1">
            <button
              type="button"
              onClick={() => setSplitEntryMode("cumulative")}
              className={`flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                splitEntryMode === "cumulative"
                  ? "bg-accent text-background"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              Cumulative
            </button>
            <button
              type="button"
              onClick={() => setSplitEntryMode("segment")}
              className={`flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                splitEntryMode === "segment"
                  ? "bg-accent text-background"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              Segment
            </button>
          </div>
        )}
        {showMobileSplits ? (
          <div className="space-y-2">
            {splitValues.map((val, i) => (
              <div key={i}>
                <label
                  htmlFor={`entry_split_${i}`}
                  className="mb-0.5 block text-xs text-foreground-muted"
                >
                  Split {i + 1}
                </label>
                <input
                  id={`entry_split_${i}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={val}
                  onChange={(e) => {
                    const next = [...splitValues];
                    next[i] = e.target.value;
                    setSplitValues(next);
                  }}
                  className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
                />
              </div>
            ))}
          </div>
        ) : (
          <input
            id="entry_raw"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={inputHint(selectedMetric, selectedSession?.day_splits, splitEntryMode)}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
            required
          />
        )}
        <p className="mt-1 text-xs text-foreground-muted">
          {inputHint(selectedMetric, selectedSession?.day_splits, splitEntryMode)}
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={() => canSubmit && void submitEntry()}
            disabled={loading}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface disabled:opacity-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setError("")}
            className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface"
          >
            Dismiss
          </button>
        </div>
      )}
      {success && (
        <p className="text-sm text-accent" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-3 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}
