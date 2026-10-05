"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type { AttendanceRate, AttendanceReport } from "@/lib/attendance/report";
import {
  HUGO_GROUP_META,
  isHugoGroup,
  type HugoGroup,
} from "@/lib/weight-room/constants";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    const message =
      json && typeof json.error === "string" ? json.error : "Request failed";
    throw new Error(message);
  }
  return json;
};

type AthleteMembership = {
  hugo_groups?: string[];
};

type StoredRange = {
  from: string;
  to: string;
};

type AttendancePayload = {
  data: AttendanceReport;
  weekdays: number[];
};

type AttendanceSectionProps = {
  athleteId: string;
};

function readStoredRange(group: string): StoredRange | null {
  try {
    const raw = localStorage.getItem(`attendance-range:v1:${group}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const from = (parsed as { from?: unknown }).from;
    const to = (parsed as { to?: unknown }).to;
    if (typeof from !== "string" || typeof to !== "string") return null;
    if (!from.trim() || !to.trim()) return null;
    return { from, to };
  } catch {
    return null;
  }
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function formatRate(rate: AttendanceRate): string {
  return `${rate.present} / ${rate.possible} (${formatPct(rate.pct)})`;
}

function knownGroups(groups: string[] | undefined): HugoGroup[] {
  const seen = new Set<HugoGroup>();
  const known: HugoGroup[] = [];
  for (const group of groups ?? []) {
    if (!isHugoGroup(group) || seen.has(group)) continue;
    seen.add(group);
    known.push(group);
  }
  return known;
}

export function AttendanceSection({ athleteId }: AttendanceSectionProps) {
  const athleteKey = `/api/athletes/${athleteId}`;
  const { data, error: loadError, isLoading } = useSWR<{
    data?: AthleteMembership;
  }>(athleteKey, fetcher);

  const groups = knownGroups(data?.data?.hugo_groups);

  return (
    <section className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
      <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent" />
      <h3 className="mb-1 text-lg font-semibold text-foreground">Attendance</h3>
      <p className="mb-4 text-xs text-foreground-muted">
        Season rates use the date range last opened on the Attendance page for
        each sport.
      </p>

      {isLoading && !data?.data && (
        <p className="text-sm text-foreground-muted">Loading attendance…</p>
      )}

      {loadError && !data?.data && (
        <p className="text-sm text-danger" role="alert">
          {loadError instanceof Error
            ? loadError.message
            : "Failed to load attendance"}
        </p>
      )}

      {data?.data && groups.length === 0 && (
        <p className="text-sm text-foreground">Not on a Hugo team.</p>
      )}

      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((group) => (
            <SportAttendanceBlock
              key={group}
              athleteId={athleteId}
              group={group}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SportAttendanceBlock({
  athleteId,
  group,
}: {
  athleteId: string;
  group: HugoGroup;
}) {
  const [range, setRange] = useState<StoredRange | null | undefined>(undefined);

  useEffect(() => {
    setRange(readStoredRange(group));
  }, [group]);

  const reportKey = range
    ? `/api/weight-room/attendance?hugo_group=${encodeURIComponent(group)}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    : null;

  const { data, error, isLoading } = useSWR<AttendancePayload>(
    reportKey,
    fetcher,
  );

  const label = HUGO_GROUP_META[group].label;
  const row = data?.data.athletes.find(
    (athlete) => athlete.athlete_id === athleteId,
  );

  return (
    <div className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground">
      <p className="font-medium">{label}</p>
      {range === undefined && (
        <p className="text-foreground-muted">Loading dates…</p>
      )}
      {range === null && (
        <p className="text-foreground-muted">
          Pick dates on the Attendance page.
        </p>
      )}
      {range && isLoading && !data && (
        <p className="text-foreground-muted">Loading rates…</p>
      )}
      {range && error && !data && (
        <p className="text-danger" role="alert">
          {error instanceof Error ? error.message : "Failed to load attendance"}
        </p>
      )}
      {range && data && !row && (
        <p className="text-foreground-muted">
          They were not on the roster for that range.
        </p>
      )}
      {row && (
        <>
          <p>
            <span className="text-foreground-muted">Session rate: </span>
            {formatRate(row.session_rate)}
          </p>
          <p>
            <span className="text-foreground-muted">Week rate: </span>
            {formatRate(row.week_rate)}
          </p>
        </>
      )}
    </div>
  );
}
