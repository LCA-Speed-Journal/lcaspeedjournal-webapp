"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import metricsData from "@/lib/metrics.json";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type MetricDef = {
  display_name: string;
  input_units: string;
  input_structure: string;
  default_splits: (number | string)[];
};

const metrics = metricsData as Record<string, MetricDef>;

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
  sessionSplits?: Record<string, number[]> | null
): string {
  if (!metric) return "Select a metric";
  if (metric.inputStructure === "single_interval") {
    return `e.g. 1.45 (${metric.inputUnits})`;
  }
  if (metric.inputStructure === "cumulative") {
    const splits = sessionSplits?.[metric.key] ?? (metric.defaultSplits as number[]);
    const n = Array.isArray(splits) && splits.length > 0 ? splits.length : 2;
    const splitsStr = Array.isArray(splits) && splits.length > 0
      ? splits.map((m) => `${m}m`).join(", ")
      : null;
    const ex = n === 2 ? "0.95|1.85" : n === 3 ? "0.95|1.85|2.65" : "0.95|1.85|2.65|3.40";
    const base = `e.g. ${ex} (${n} pipe- or comma-separated values, ${metric.inputUnits})`;
    return splitsStr ? `Splits: ${splitsStr} — ${base}` : base;
  }
  if (metric.inputStructure === "paired_components") {
    const labels = (metric.defaultSplits as string[])?.join("|") ?? "L|R";
    return `e.g. 450|420 (${labels}, ${metric.inputUnits})`;
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

export function EntryForm() {
  const { mutate: globalMutate } = useSWRConfig();
  const [sessionId, setSessionId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<{ id: string; displayName: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [metricKey, setMetricKey] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [splitValues, setSplitValues] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const athleteInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

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

  useEffect(() => {
    if (dropdownOpen) setHighlightedIndex(0);
  }, [athleteQuery, athletes, activeOnly, dropdownOpen]);

  useEffect(() => {
    const el = listboxRef.current?.querySelector(
      `#entry_athlete_option_${filteredAthletes[highlightedIndex]?.id}`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, filteredAthletes]);

  const allOptions = metricOptions();
  const selectedSession = sessions.find((s) => s.id === sessionId);
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
    const rawToSend = showMobileSplits
      ? splitValues.map((v) => v.trim()).join("|")
      : rawInput.trim();
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
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
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitEntry();
  }

  const allSplitsFilled =
    !showMobileSplits || splitValues.length === 0 ||
    splitValues.every((v) => v.trim() !== "");
  const hasValue = showMobileSplits
    ? allSplitsFilled && splitValues.length === splitCount
    : rawInput.trim() !== "";
  const canSubmit = sessionId && athleteId && metricKey && hasValue;

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20 md:p-6"
    >
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
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(closeDropdown, 150)}
            onKeyDown={(e) => {
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
                setHighlightedIndex((i) =>
                  i < filteredAthletes.length - 1 ? i + 1 : 0
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((i) =>
                  i > 0 ? i - 1 : filteredAthletes.length - 1
                );
                return;
              }
              if (e.key === "Enter" && filteredAthletes[highlightedIndex]) {
                e.preventDefault();
                selectAthlete(filteredAthletes[highlightedIndex]);
              }
            }}
            placeholder="Search or select athlete…"
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 pr-8 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls="entry_athlete_listbox"
            aria-activedescendant={
              dropdownOpen && filteredAthletes[highlightedIndex]
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
                <li className="px-3 py-2 text-sm text-foreground-muted">
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
            </ul>
          )}
        </div>
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
            placeholder={inputHint(selectedMetric, selectedSession?.day_splits)}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
            required
          />
        )}
        <p className="mt-1 text-xs text-foreground-muted">
          {inputHint(selectedMetric, selectedSession?.day_splits)}
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
