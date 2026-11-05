"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { segmentInputToCumulativeInput } from "@/lib/parser";
import {
  addOptionVisible,
  buildAthleteCreatePayload,
  isAddOptionIndex,
  nextHighlightIndex,
  parseNameFromQuery,
  pickerOptionCount,
} from "@/lib/quick-athlete";
import { sessionSetupMetricOptions } from "@/lib/metric-utils";
import { FORTY_YD_DASH } from "@/lib/norms/editor-metrics";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  isHugoGroup,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import { filterAthletesByHugoGroup } from "@/lib/weight-room/hugo-memberships";
import {
  contextHugoGroupForSave,
  guestFields,
  otherSportMatches,
  shouldClearAthleteOnSportChange,
} from "@/lib/guest-athletes";
import {
  EMPTY_SPEED_RUN_DRAFT,
  previewSpeedRun,
  SpeedRunFields,
  type SpeedRunDraft,
} from "@/components/speed/SpeedRunFields";
import { overallAttemptsFor, type DropoffEntry } from "@/lib/dropoff/attempts";
import { formatDropoffCaption } from "@/lib/dropoff/format";
import { isDropoffMetric } from "@/lib/dropoff/metrics";
import { directionFromUnits, summarizeDropoff } from "@/lib/dropoff/summarize";
import { LEGACY_SPEED_KEYS } from "@/lib/speed/windows";

const SPEED_RUN_KEY = "SpeedRun";
const REPEAT_REP_COUNT = 10;
const DRI_BOX_LABELS = ["6", "12", "18", "24"] as const;
const RSI_QUALIFIERS = [
  { value: "reactive", label: "Reactive", selected: "bg-blue-500 text-white" },
  { value: "compliant", label: "Compliant", selected: "bg-red-500 text-white" },
  { value: "stiff", label: "Stiff", selected: "bg-green-600 text-white" },
  { value: "developing", label: "Developing", selected: "bg-yellow-400 text-neutral-950" },
] as const;

type BatteryBib = {
  bib: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  grade_digit: number;
};

function emptyReps(): string[] {
  return Array.from({ length: REPEAT_REP_COUNT }, () => "");
}

function clearUnknownBibError(prev: string): string {
  return prev === "Unknown bib" ? "" : prev;
}

function sessionAllowsMetric(dayMetrics: string[] | null | undefined, key: string): boolean {
  if (!Array.isArray(dayMetrics) || dayMetrics.length === 0) return true;
  if (dayMetrics.includes(key)) return true;
  return key === SPEED_RUN_KEY && dayMetrics.some((metric) => LEGACY_SPEED_KEYS.has(metric));
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isSplitMetricKey(metricKey: string): boolean {
  return metricKey.endsWith("_Split");
}

function metricOptions() {
  return sessionSetupMetricOptions().map((m) => ({
    key: m.key,
    label: m.label,
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
  hugo_group?: string | null;
  hugo_groups?: string[];
};

function athleteSportLabel(a: AthleteItem): string | null {
  const groups =
    a.hugo_groups && a.hugo_groups.length > 0
      ? a.hugo_groups
      : a.hugo_group
        ? [a.hugo_group]
        : [];
  if (groups.length === 0) return null;
  return groups
    .map((g) => (isHugoGroup(g) ? HUGO_GROUP_META[g].label : g))
    .join(", ");
}

function athleteDisplayName(a: AthleteItem): string {
  const t = a.athlete_type ?? "athlete";
  const suffix = t === "staff" ? " (Staff)" : t === "alumni" ? " (Alumni)" : "";
  const sport = athleteSportLabel(a);
  const sportSuffix = sport ? ` · ${sport}` : "";
  return `${a.first_name} ${a.last_name}${suffix}${sportSuffix}`;
}

function athleteMembershipGroups(a: AthleteItem): string[] {
  const groups = a.hugo_groups ? [...a.hugo_groups] : [];
  if (a.hugo_group && !groups.includes(a.hugo_group)) groups.push(a.hugo_group);
  return groups;
}

/** Guest label for the athlete box. The name already includes home sports, so this is only " · Guest". Empty when this sport includes them, or when All sports is selected. */
function guestInputSuffix(a: AthleteItem, sportFilter: string): string | null {
  const fields = guestFields(sportFilter, athleteMembershipGroups(a));
  if (!fields.guest) return null;
  return " · Guest";
}

function selectedAthleteInputValue(a: AthleteItem, sportFilter: string): string {
  const suffix = guestInputSuffix(a, sportFilter);
  const base = athleteDisplayName(a);
  return suffix ? `${base}${suffix}` : base;
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
  const [sportFilter, setSportFilter] = useState<HugoGroup | "">("");
  const [athleteQuery, setAthleteQuery] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteItem | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [metricKey, setMetricKey] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [speedDraft, setSpeedDraft] = useState<SpeedRunDraft>(EMPTY_SPEED_RUN_DRAFT);
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
  const [batterySession, setBatterySession] = useState(false);
  const [batteryId, setBatteryId] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetNote, setSheetNote] = useState("");
  const [bibs, setBibs] = useState<BatteryBib[]>([]);
  const [bibInput, setBibInput] = useState("");
  const [rsiQualifier, setRsiQualifier] = useState("");
  const [driValues, setDriValues] = useState<string[]>(["", "", "", ""]);
  const [repValues, setRepValues] = useState<string[]>(emptyReps);
  const bibInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const lookupId = sessionIdProp ?? sessionId;
    setError("");
    setBibInput("");
    setRsiQualifier("");
    setDriValues(["", "", "", ""]);
    setRepValues(emptyReps());
    setBatterySession(false);
    setBatteryId("");
    setSheetNote("");
    setBibs([]);
    if (!lookupId) return;

    let cancelled = false;
    void (async () => {
      try {
        const batteryRes = await fetch(
          `/api/battery?session_id=${encodeURIComponent(lookupId)}`,
          { cache: "no-store" }
        );
        if (cancelled || !batteryRes.ok) return;
        const batteryJson = (await batteryRes.json()) as { id?: unknown };
        const nextBatteryId = typeof batteryJson.id === "string" ? batteryJson.id : "";
        if (!nextBatteryId) return;
        if (cancelled) return;
        setBatteryId(nextBatteryId);
        setBatterySession(true);
        const bibRes = await fetch(`/api/battery/${encodeURIComponent(nextBatteryId)}/bibs`, {
          cache: "no-store",
        });
        if (cancelled || !bibRes.ok) return;
        const bibJson: unknown = await bibRes.json();
        if (cancelled) return;
        setBibs(Array.isArray(bibJson) ? (bibJson as BatteryBib[]) : []);
      } catch {
        if (!cancelled) {
          setBatterySession(false);
          setBibs([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionIdProp]);

  const bibByNumber = useMemo(() => {
    const map = new Map<string, BatteryBib>();
    for (const row of bibs) map.set(row.bib, row);
    return map;
  }, [bibs]);

  const { data: sessionsRes } = useSWR<{
    data: {
      id: string;
      session_date: string;
      phase: string;
      phase_week: number;
      day_metrics?: string[] | null;
      day_splits?: Record<string, number[]> | null;
      day_components?: Record<string, string[]> | null;
    }[];
  }>("/api/sessions", fetcher);
  const { data: athletesAllRes } = useSWR<{ data: AthleteItem[] }>("/api/athletes", fetcher);
  const { data: athletesActiveRes } = useSWR<{ data: AthleteItem[] }>("/api/athletes?active=true", fetcher);
  const entriesSessionId = sessionIdProp ?? sessionId;
  const entriesKey = entriesSessionId
    ? `/api/entries?session_id=${entriesSessionId}`
    : null;
  const { data: sessionEntriesRes } = useSWR<{ data?: DropoffEntry[] }>(
    entriesKey,
    fetcher
  );

  const sessions = sessionsRes?.data ?? [];
  const athletes = activeOnly ? (athletesActiveRes?.data ?? []) : (athletesAllRes?.data ?? []);
  const athletesInSport = filterAthletesByHugoGroup(athletes, sportFilter);
  const selectedRecord = selectedAthlete
    ? (athletes.find((a) => a.id === selectedAthlete.id) ?? selectedAthlete)
    : null;
  const matchedBib =
    batterySession && bibInput.length === 3 ? (bibByNumber.get(bibInput) ?? null) : null;
  const searchAthleteId = selectedRecord?.id ?? "";
  const athleteId =
    batterySession && bibInput.length > 0 ? (matchedBib?.athlete_id ?? "") : searchAthleteId;
  const dropoffCaption = (() => {
    if (!isDropoffMetric(metricKey) || !athleteId) return null;
    const picked = overallAttemptsFor(
      sessionEntriesRes?.data ?? [],
      athleteId,
      metricKey
    );
    if (!picked) return null;
    const summary = summarizeDropoff(picked.values, directionFromUnits(picked.units));
    return summary ? formatDropoffCaption(summary) : null;
  })();
  const athleteSearch = athleteQuery.trim().toLowerCase();
  const filteredAthletes = athleteSearch
    ? athletesInSport.filter(
        (a) =>
          `${a.first_name} ${a.last_name}`.toLowerCase().includes(athleteSearch)
      )
    : athletesInSport;
  const otherAthletes = otherSportMatches(athletes, sportFilter, athleteQuery);
  const matchCount = filteredAthletes.length + otherAthletes.length;
  const showAddOption = addOptionVisible(athleteQuery);
  const optionCount = pickerOptionCount(matchCount, athleteQuery);
  const addHighlighted = isAddOptionIndex(highlightedIndex, matchCount, athleteQuery);
  const highlightedAthlete = addHighlighted
    ? undefined
    : highlightedIndex < filteredAthletes.length
      ? filteredAthletes[highlightedIndex]
      : otherAthletes[highlightedIndex - filteredAthletes.length];

  const openDropdown = useCallback(() => setDropdownOpen(true), []);
  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setHighlightedIndex(0);
  }, []);
  const selectAthlete = useCallback((a: AthleteItem) => {
    setSelectedAthlete(a);
    setAthleteQuery("");
    setDropdownOpen(false);
    setBibInput("");
    setError(clearUnknownBibError);
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
  }, [athleteQuery, athletes, activeOnly, sportFilter, dropdownOpen]);

  useEffect(() => {
    const id = addHighlighted
      ? "entry_athlete_option_add"
      : highlightedAthlete
        ? `entry_athlete_option_${highlightedAthlete.id}`
        : null;
    if (!id) return;
    const el = listboxRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, highlightedAthlete, addHighlighted]);

  const effectiveSessionId = sessionIdProp ?? sessionId;
  const allOptions = metricOptions();
  const selectedSession = sessions.find((s) => s.id === effectiveSessionId);
  const sessionMetrics = selectedSession?.day_metrics;
  const options =
    Array.isArray(sessionMetrics) && sessionMetrics.length > 0
      ? allOptions.filter((o) => sessionAllowsMetric(sessionMetrics, o.key))
      : allOptions;
  const selectedMetric = options.find((o) => o.key === metricKey) ?? null;

  const namedFortyComponents =
    metricKey === FORTY_YD_DASH &&
    Array.isArray(selectedSession?.day_components?.[FORTY_YD_DASH]) &&
    selectedSession!.day_components![FORTY_YD_DASH]!.length > 0
      ? selectedSession!.day_components![FORTY_YD_DASH]!
      : [];
  const showNamedFlies = namedFortyComponents.length > 0;

  const cumulativeSplits =
    selectedSession?.day_splits?.[metricKey] ?? selectedMetric?.defaultSplits;
  const splitCount = Array.isArray(cumulativeSplits) && cumulativeSplits.length > 0
    ? cumulativeSplits.length
    : 0;
  const selectedMetricIsSplit = selectedMetric != null && isSplitMetricKey(selectedMetric.key);
  const showSplitEntryToggle =
    !showNamedFlies &&
    selectedMetric != null &&
    splitCount > 0 &&
    (selectedMetric.inputStructure === "cumulative" || selectedMetricIsSplit);
  const showMobileSplits =
    !showNamedFlies &&
    isMobile &&
    selectedMetric?.inputStructure === "cumulative" &&
    splitCount > 0;

  useEffect(() => {
    if (showNamedFlies && splitValues.length !== namedFortyComponents.length) {
      setSplitValues(Array(namedFortyComponents.length).fill(""));
    } else if (showMobileSplits && splitValues.length !== splitCount) {
      setSplitValues(Array(splitCount).fill(""));
    } else if (!showNamedFlies && !showMobileSplits && splitValues.length > 0) {
      setSplitValues([]);
    }
  }, [
    showNamedFlies,
    namedFortyComponents.length,
    showMobileSplits,
    splitCount,
    metricKey,
    sessionId,
  ]);

  function clearBatteryEntry() {
    if (!batterySession) return;
    setBibInput("");
    setSelectedAthlete(null);
    setAthleteQuery("");
    setRsiQualifier("");
    setDriValues(["", "", "", ""]);
    setRepValues(emptyReps());
    requestAnimationFrame(() => bibInputRef.current?.focus());
  }

  async function readSheetError(res: Response, fallback: string): Promise<string> {
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim() !== "") return body.error;
    } catch {
      // The body was not JSON.
    }
    return fallback;
  }

  async function downloadBatteryPdf(path: string, fallbackName: string) {
    if (!batteryId) return;
    setSheetBusy(true);
    setSheetNote("");
    try {
      const res = await fetch(path, { cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("application/pdf")) {
        setSheetNote(await readSheetError(res, "Could not download the PDF"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      link.download = match?.[1] ?? fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setSheetNote("Could not download the PDF");
    } finally {
      setSheetBusy(false);
    }
  }

  async function printHandSheet() {
    if (!batteryId) return;
    setSheetBusy(true);
    setSheetNote("");
    try {
      const assignRes = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/bibs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });
      const assigned: unknown = await assignRes.json().catch(() => null);
      if (!assignRes.ok) {
        const message =
          assigned != null &&
          typeof assigned === "object" &&
          typeof (assigned as { error?: unknown }).error === "string"
            ? (assigned as { error: string }).error
            : "Could not assign bibs";
        setSheetNote(message);
        return;
      }
      setBibs(Array.isArray(assigned) ? (assigned as BatteryBib[]) : []);
      const res = await fetch(
        `/api/battery/${encodeURIComponent(batteryId)}/hand-sheet`,
        { cache: "no-store" }
      );
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("application/pdf")) {
        setSheetNote(await readSheetError(res, "Could not download the PDF"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      link.download = match?.[1] ?? "boys-basketball-baseline-hand-sheet.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setSheetNote("Could not download the PDF");
    } finally {
      setSheetBusy(false);
    }
  }

  async function freezeFridayLanes() {
    if (!batteryId) return;
    setSheetBusy(true);
    setSheetNote("");
    try {
      const res = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/lanes`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        setSheetNote(await readSheetError(res, "Could not freeze Friday lanes"));
        return;
      }
      setSheetNote("Friday lanes are frozen. You can print the lane sheet.");
    } catch {
      setSheetNote("Could not freeze Friday lanes");
    } finally {
      setSheetBusy(false);
    }
  }

  async function issueBibs() {
    if (!batteryId) return;
    const confirmed = window.confirm(
      "Issue bibs now? Issued numbers do not get renumbered."
    );
    if (!confirmed) return;
    setSheetBusy(true);
    setSheetNote("");
    try {
      const res = await fetch(`/api/battery/${encodeURIComponent(batteryId)}/bibs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: true }),
        cache: "no-store",
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body != null &&
          typeof body === "object" &&
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Could not issue bibs";
        setSheetNote(message);
        return;
      }
      setBibs(Array.isArray(body) ? (body as BatteryBib[]) : []);
      setSheetNote("Bibs issued. Those numbers stay put.");
    } catch {
      setSheetNote("Could not issue bibs");
    } finally {
      setSheetBusy(false);
    }
  }

  function onBibChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 3);
    setBibInput(digits);
    if (digits.length > 0) {
      setSelectedAthlete(null);
      setAthleteQuery("");
      closeQuickCreate();
    }
    if (digits.length === 3 && !bibByNumber.has(digits)) {
      setSuccess("");
      setError("Unknown bib");
      return;
    }
    setError(clearUnknownBibError);
  }

  async function submitEntry() {
    if (batterySession && bibInput.length > 0 && matchedBib == null) {
      setSuccess("");
      setError(bibInput.length === 3 ? "Unknown bib" : "Enter a 3-digit bib");
      return;
    }
    if (batterySession && metricKey === "DRI" && driValues.some((value) => value.trim() === "")) {
      setSuccess("");
      setError("Enter all four DRI boxes");
      return;
    }
    if (
      batterySession &&
      metricKey === "10x10m" &&
      repValues.some((value) => value.trim() === "")
    ) {
      setSuccess("");
      setError("Enter all ten times");
      return;
    }
    if (batterySession && metricKey === "10-5_RSI" && rsiQualifier === "") {
      setSuccess("");
      setError("Pick Reactive, Compliant, Stiff, or Developing");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    if (metricKey === SPEED_RUN_KEY) {
      const preview = previewSpeedRun(speedDraft);
      if (!preview.ok) {
        setError(preview.error);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: effectiveSessionId,
            athlete_id: athleteId,
            context_hugo_group: contextHugoGroupForSave(sportFilter),
            speed_run: preview.payload,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to save entry");
          return;
        }
        const count = json.data?.count ?? 1;
        setSuccess(`Saved ${count} ${count === 1 ? "entry" : "entries"}`);
        setSpeedDraft(EMPTY_SPEED_RUN_DRAFT);
        clearBatteryEntry();
        void globalMutate(
          (key) => typeof key === "string" && key.startsWith("/api/leaderboard"),
          undefined,
          { revalidate: true }
        );
        if (entriesKey) {
          void globalMutate(entriesKey);
        }
        onSuccess?.();
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
      return;
    }
    let rawToSend: string;
    if (batterySession && metricKey === "DRI") {
      rawToSend = driValues.map((value) => value.trim()).join(", ");
    } else if (batterySession && metricKey === "10x10m") {
      rawToSend = repValues.map((value) => value.trim()).join(", ");
    } else if (showNamedFlies) {
      rawToSend = splitValues.map((v) => v.trim()).join("|");
    } else if (showMobileSplits) {
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
          context_hugo_group: contextHugoGroupForSave(sportFilter),
          ...(metricKey === "10-5_RSI" && rsiQualifier ? { qualifier: rsiQualifier } : {}),
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
      if (showNamedFlies) {
        setSplitValues(Array(namedFortyComponents.length).fill(""));
      } else if (showMobileSplits) {
        setSplitValues(Array(splitCount).fill(""));
      }
      clearBatteryEntry();
      // Invalidate leaderboard cache so live leaderboard (and any open tab) refetches
      void globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/leaderboard"),
        undefined,
        { revalidate: true }
      );
      if (entriesKey) {
        void globalMutate(entriesKey);
      }
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

  const multiFieldEntry = showNamedFlies || showMobileSplits;
  const allSplitsFilled =
    !multiFieldEntry ||
    splitValues.length === 0 ||
    splitValues.every((v) => v.trim() !== "");
  const expectedFieldCount = showNamedFlies
    ? namedFortyComponents.length
    : splitCount;
  const speedPreview = metricKey === SPEED_RUN_KEY ? previewSpeedRun(speedDraft) : null;
  const batteryDriReady =
    driValues.length === DRI_BOX_LABELS.length &&
    driValues.every((value) => value.trim() !== "");
  const batteryRepsReady =
    repValues.length === REPEAT_REP_COUNT && repValues.every((value) => value.trim() !== "");
  const hasValue =
    batterySession && metricKey === "DRI"
      ? batteryDriReady
      : batterySession && metricKey === "10x10m"
        ? batteryRepsReady
        : batterySession && metricKey === "10-5_RSI"
          ? rawInput.trim() !== "" && rsiQualifier !== ""
          : metricKey === SPEED_RUN_KEY
            ? speedPreview?.ok === true
            : multiFieldEntry
              ? allSplitsFilled && splitValues.length === expectedFieldCount
              : rawInput.trim() !== "";
  const bibReady = !batterySession || bibInput.length === 0 || matchedBib != null;
  const canSubmit = Boolean(effectiveSessionId && athleteId && metricKey && hasValue && bibReady);

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
              if (metricKey && !sessionAllowsMetric(dm, metricKey)) {
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

      {batterySession && batteryId ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Battery sheets
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sheetBusy}
              onClick={() => void printHandSheet()}
              className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              Print hand sheet
            </button>
            <button
              type="button"
              disabled={sheetBusy}
              onClick={() => void freezeFridayLanes()}
              className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              Freeze Friday lanes
            </button>
            <button
              type="button"
              disabled={sheetBusy}
              onClick={() =>
                void downloadBatteryPdf(
                  `/api/battery/${encodeURIComponent(batteryId)}/lanes/pdf`,
                  "friday-lane-sheet.pdf"
                )
              }
              className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              Print lane sheet
            </button>
            <button
              type="button"
              disabled={sheetBusy}
              onClick={() =>
                void downloadBatteryPdf(
                  `/api/battery/${encodeURIComponent(batteryId)}/packet`,
                  "boys-basketball-baseline-coach-packet.pdf"
                )
              }
              className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              Print coach packet
            </button>
            <button
              type="button"
              disabled={sheetBusy}
              onClick={() => void issueBibs()}
              className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              Issue bibs
            </button>
          </div>
          {sheetNote ? (
            <p className="text-sm text-foreground-muted" role="status">
              {sheetNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {batterySession ? (
        <div>
          <label htmlFor="entry_bib" className="mb-1 block text-sm font-medium text-foreground">
            Bib
          </label>
          <input
            id="entry_bib"
            ref={bibInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            value={bibInput}
            onChange={(e) => onBibChange(e.target.value)}
            placeholder="000"
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-2xl tracking-widest text-foreground placeholder:text-foreground-muted focus:border-accent"
          />
          {matchedBib ? (
            <p
              id="entry_bib_name"
              className="mt-2 text-4xl font-semibold leading-tight text-foreground"
            >
              {matchedBib.first_name} {matchedBib.last_name}
            </p>
          ) : null}
        </div>
      ) : null}

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
        <label htmlFor="entry_sport" className="mb-1 block text-sm font-medium text-foreground">
          Sport
        </label>
        <select
          id="entry_sport"
          value={sportFilter}
          onChange={(e) => {
            const next = e.target.value as HugoGroup | "";
            setSportFilter(next);
            if (selectedRecord && shouldClearAthleteOnSportChange(selectedRecord, next)) {
              setSelectedAthlete(null);
              setAthleteQuery("");
            }
            setDropdownOpen(false);
          }}
          className="mb-3 min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
        >
          <option value="">All sports</option>
          {HUGO_GROUPS.map((g) => (
            <option key={g} value={g}>
              {HUGO_GROUP_META[g].label}
            </option>
          ))}
        </select>
        <label htmlFor="entry_athlete" className="mb-1 block text-sm font-medium text-foreground">
          Athlete
        </label>
        <div className="relative">
          <input
            id="entry_athlete"
            ref={athleteInputRef}
            type="text"
            autoComplete="off"
            value={
              selectedRecord
                ? selectedAthleteInputValue(selectedRecord, sportFilter)
                : athleteQuery
            }
            onChange={(e) => {
              setAthleteQuery(e.target.value);
              setSelectedAthlete(null);
              setDropdownOpen(true);
              closeQuickCreate();
              setBibInput("");
              setError(clearUnknownBibError);
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
                if (highlightedAthlete) {
                  e.preventDefault();
                  selectAthlete(highlightedAthlete);
                }
              }
            }}
            placeholder={
              batterySession
                ? "Or search by name…"
                : sportFilter
                  ? `Search ${HUGO_GROUP_META[sportFilter].label} athletes…`
                  : "Search or select athlete…"
            }
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 pr-8 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls="entry_athlete_listbox"
            aria-activedescendant={
              dropdownOpen && addHighlighted
                ? "entry_athlete_option_add"
                : dropdownOpen && highlightedAthlete
                  ? `entry_athlete_option_${highlightedAthlete.id}`
                  : undefined
            }
          />
          {selectedRecord && (
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
              {filteredAthletes.length === 0 && otherAthletes.length === 0 ? (
                <li className="px-3 py-2 text-sm text-foreground-muted" role="presentation">
                  No athletes match
                </li>
              ) : (
                <>
                  {filteredAthletes.map((a, i) => (
                    <li
                      key={a.id}
                      id={`entry_athlete_option_${a.id}`}
                      role="option"
                      aria-selected={selectedRecord?.id === a.id}
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
                  ))}
                  {otherAthletes.length > 0 ? (
                    <>
                      <li
                        role="presentation"
                        className="px-3 py-1 text-xs font-medium text-foreground-muted"
                      >
                        Other sports
                      </li>
                      {otherAthletes.map((a, i) => {
                        const optionIndex = filteredAthletes.length + i;
                        return (
                          <li
                            key={a.id}
                            id={`entry_athlete_option_${a.id}`}
                            role="option"
                            aria-selected={selectedRecord?.id === a.id}
                            className={`cursor-pointer px-3 py-2 text-sm ${
                              optionIndex === highlightedIndex
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
                        );
                      })}
                    </>
                  ) : null}
                </>
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
            setRsiQualifier("");
            setDriValues(["", "", "", ""]);
            setRepValues(emptyReps());
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

      {metricKey === SPEED_RUN_KEY ? (
        <SpeedRunFields
          draft={speedDraft}
          onChange={setSpeedDraft}
          entries={sessionEntriesRes?.data ?? []}
          athleteId={athleteId}
        />
      ) : (
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
        {batterySession && metricKey === "DRI" ? (
          <div className="grid grid-cols-2 gap-2">
            {DRI_BOX_LABELS.map((label, i) => (
              <div key={label}>
                <label
                  htmlFor={`entry_dri_${label}`}
                  className="mb-0.5 block text-xs text-foreground-muted"
                >
                  {label} in
                </label>
                <input
                  id={`entry_dri_${label}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={driValues[i] ?? ""}
                  onChange={(e) => {
                    const next = [...driValues];
                    next[i] = e.target.value;
                    setDriValues(next);
                  }}
                  className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
                />
              </div>
            ))}
          </div>
        ) : batterySession && metricKey === "10x10m" ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: REPEAT_REP_COUNT }, (_, i) => (
              <div key={i}>
                <label
                  htmlFor={`entry_rep_${i}`}
                  className="mb-0.5 block text-xs text-foreground-muted"
                >
                  Rep {i + 1}
                </label>
                <input
                  id={`entry_rep_${i}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={repValues[i] ?? ""}
                  onChange={(e) => {
                    const next = [...repValues];
                    next[i] = e.target.value;
                    setRepValues(next);
                  }}
                  className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
                />
              </div>
            ))}
          </div>
        ) : showNamedFlies ? (
          <div className="space-y-2">
            {namedFortyComponents.map((label, i) => (
              <div key={label}>
                <label
                  htmlFor={`entry_fly_${label}`}
                  className="mb-0.5 block text-xs font-mono text-foreground-muted"
                >
                  {label}
                </label>
                <input
                  id={`entry_fly_${label}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={splitValues[i] ?? ""}
                  onChange={(e) => {
                    const next = [...splitValues];
                    next[i] = e.target.value;
                    setSplitValues(next);
                  }}
                  placeholder="e.g. 1.22"
                  className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground placeholder:text-foreground-muted focus:border-accent"
                />
              </div>
            ))}
            <p className="text-xs text-foreground-muted">
              One fly time per split (seconds). Feeds Force-to-Form when applicable.
            </p>
          </div>
        ) : showMobileSplits ? (
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
        {batterySession && metricKey === "10-5_RSI" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {RSI_QUALIFIERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRsiQualifier(option.value)}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium ${
                  rsiQualifier === option.value
                    ? option.selected
                    : "border border-border text-foreground hover:bg-surface"
                }`}
                aria-pressed={rsiQualifier === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {!showNamedFlies &&
        !(batterySession && (metricKey === "DRI" || metricKey === "10x10m")) ? (
          <p className="mt-1 text-xs text-foreground-muted">
            {inputHint(selectedMetric, selectedSession?.day_splits, splitEntryMode)}
          </p>
        ) : null}
        {dropoffCaption ? (
          <p className="mt-2 font-mono text-xs tabular-nums text-foreground-muted" role="status">
            {dropoffCaption}
          </p>
        ) : null}
      </div>
      )}

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
