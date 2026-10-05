"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import type {
  AttendanceRate,
  AttendanceReport,
  Enrollment,
} from "@/lib/attendance/report";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

const SPLITS: { key: Enrollment; label: string }[] = [
  { key: "liberty", label: "Liberty" },
  { key: "homeschool", label: "Homeschool" },
  { key: "coop", label: "Co-Op" },
];

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type RecentEdit = { date: string; action: "cancel" | "add" };

type UnmatchedGame = { contest_date: string; label: string };

type HeldReport = { report: AttendanceReport };

async function attendanceFetcher(
  url: string,
): Promise<{ data: AttendanceReport }> {
  const res = await fetch(url);
  let json: { data?: AttendanceReport; error?: unknown } = {};
  try {
    json = (await res.json()) as { data?: AttendanceReport; error?: unknown };
  } catch {
    json = {};
  }
  if (!res.ok || !json.data) {
    throw new Error(messageFrom(json, "Failed to load attendance"));
  }
  return { data: json.data };
}

function messageFrom(json: { error?: unknown }, fallback: string): string {
  return typeof json.error === "string" && json.error.trim()
    ? json.error
    : fallback;
}

async function sendJson(
  url: string,
  init: RequestInit,
): Promise<
  { ok: true; json: Record<string, unknown> } | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (!res.ok) {
      return { ok: false, error: messageFrom(json, "Request failed") };
    }
    return { ok: true, json };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Monday through today, in the browser's local calendar. */
function currentWeekRange(): { from: string; to: string } {
  const today = new Date();
  const to = localIso(today);
  const weekday = today.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + mondayOffset,
  );
  return { from: localIso(monday), to };
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function formatRate(rate: AttendanceRate): string {
  return `${rate.present} / ${rate.possible} (${formatPct(rate.pct)})`;
}

function enrollmentLabel(enrollment: Enrollment | null): string {
  if (enrollment === "liberty") return "Liberty";
  if (enrollment === "homeschool") return "Homeschool";
  if (enrollment === "coop") return "Co-Op";
  return "Unset";
}

function mondayColumn(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function rememberEdit(prev: RecentEdit[], edit: RecentEdit): RecentEdit[] {
  return [...prev.filter((row) => row.date !== edit.date), edit];
}

function isUnmatchedGame(value: unknown): value is UnmatchedGame {
  if (!value || typeof value !== "object") return false;
  const row = value as { contest_date?: unknown; label?: unknown };
  return typeof row.contest_date === "string" && typeof row.label === "string";
}

function RateBlock({
  title,
  headcount,
  sessionFill,
}: {
  title: string;
  headcount: AttendanceRate;
  sessionFill: AttendanceRate;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-foreground">
        <span className="text-foreground-muted">Headcount: </span>
        {formatRate(headcount)}
      </p>
      <p className="text-sm text-foreground">
        <span className="text-foreground-muted">Session fill: </span>
        {formatRate(sessionFill)}
      </p>
    </div>
  );
}

export function AttendanceClient() {
  const [hugoGroup, setHugoGroup] = useState<HugoGroup>("soccer");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [datesReady, setDatesReady] = useState(false);
  const [held, setHeld] = useState<HeldReport | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [recentEdits, setRecentEdits] = useState<RecentEdit[]>([]);
  const [sessionDate, setSessionDate] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [gameLabel, setGameLabel] = useState("");
  const [unmatched, setUnmatched] = useState<UnmatchedGame[]>([]);
  const [refreshNote, setRefreshNote] = useState("");
  const [rhythmError, setRhythmError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [gameError, setGameError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const range = currentWeekRange();
    setFrom(range.from);
    setTo(range.to);
    setDatesReady(true);
  }, []);

  const reportKey =
    datesReady && from && to
      ? `/api/weight-room/attendance?hugo_group=${encodeURIComponent(hugoGroup)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : null;

  const { data, error, isValidating, mutate } = useSWR<{
    data: AttendanceReport;
  }>(reportKey, attendanceFetcher, { shouldRetryOnError: false });

  useEffect(() => {
    if (!data?.data) return;
    setHeld({ report: data.data });
    try {
      localStorage.setItem(
        `attendance-range:v1:${data.data.hugo_group}`,
        JSON.stringify({ from: data.data.from, to: data.data.to }),
      );
    } catch {
      // Private browsing or blocked storage should not break the report.
    }
  }, [data]);

  const report = data?.data ?? held?.report ?? null;
  const showingLastGood = Boolean(report && !data?.data);
  const loadError = error instanceof Error ? error.message : "";

  function onGroupChange(next: HugoGroup) {
    setHugoGroup(next);
    setWeekdays([]);
    setRecentEdits([]);
    setUnmatched([]);
    setRefreshNote("");
    setRhythmError("");
    setSessionError("");
    setGameError("");
    setRefreshError("");
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function reloadReport(): Promise<string> {
    try {
      await mutate();
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Failed to load attendance";
    }
  }

  async function onSaveRhythm() {
    setRhythmError("");
    setBusy("rhythm");
    const result = await sendJson("/api/weight-room/attendance/rhythm", {
      method: "PUT",
      body: JSON.stringify({ hugo_group: hugoGroup, weekdays }),
    });
    if (!result.ok) {
      setRhythmError(result.error);
      setBusy("");
      return;
    }
    const reloadError = await reloadReport();
    if (reloadError) setRhythmError(reloadError);
    setBusy("");
  }

  async function onSessionAction(
    date: string,
    action: "cancel" | "add" | "clear",
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSessionError("Choose a date.");
      return;
    }
    setSessionError("");
    setBusy(`session:${action}:${date}`);
    const result = await sendJson("/api/weight-room/attendance/sessions", {
      method: "PUT",
      body: JSON.stringify({
        hugo_group: hugoGroup,
        session_date: date,
        action,
      }),
    });
    if (!result.ok) {
      setSessionError(result.error);
      setBusy("");
      return;
    }
    if (action === "clear") {
      setRecentEdits((prev) => prev.filter((row) => row.date !== date));
    } else {
      setRecentEdits((prev) => rememberEdit(prev, { date, action }));
    }
    const reloadError = await reloadReport();
    if (reloadError) setSessionError(reloadError);
    setBusy("");
  }

  async function onAddGame(date: string, label?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setGameError("Choose a date.");
      return;
    }
    setGameError("");
    setBusy(`game:add:${date}`);
    const body: { hugo_group: HugoGroup; contest_date: string; label?: string } =
      { hugo_group: hugoGroup, contest_date: date };
    const trimmed = label?.trim();
    if (trimmed) body.label = trimmed;
    const result = await sendJson("/api/weight-room/attendance/games", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      setGameError(result.error);
      setBusy("");
      return;
    }
    setUnmatched((prev) =>
      prev.filter(
        (row) => !(row.contest_date === date && (!trimmed || row.label === trimmed)),
      ),
    );
    const reloadError = await reloadReport();
    if (reloadError) setGameError(reloadError);
    setBusy("");
  }

  async function onDismissGame(date: string) {
    setGameError("");
    setBusy(`game:dismiss:${date}`);
    const params = new URLSearchParams({
      hugo_group: hugoGroup,
      contest_date: date,
    });
    const result = await sendJson(
      `/api/weight-room/attendance/games?${params.toString()}`,
      { method: "DELETE" },
    );
    if (!result.ok) {
      setGameError(result.error);
      setBusy("");
      return;
    }
    const reloadError = await reloadReport();
    if (reloadError) setGameError(reloadError);
    setBusy("");
  }

  async function onRefreshGames() {
    setRefreshError("");
    setRefreshNote("");
    setBusy("refresh");
    const result = await sendJson(
      "/api/weight-room/attendance/games/refresh",
      {
        method: "POST",
        body: JSON.stringify({ hugo_group: hugoGroup }),
      },
    );
    if (!result.ok) {
      setRefreshError(result.error);
      setBusy("");
      return;
    }
    const payload =
      result.json.data && typeof result.json.data === "object"
        ? (result.json.data as { saved?: unknown; unmatched?: unknown })
        : {};
    const nextUnmatched = Array.isArray(payload.unmatched)
      ? payload.unmatched.filter(isUnmatchedGame)
      : [];
    setUnmatched(nextUnmatched);
    const saved = typeof payload.saved === "number" ? payload.saved : 0;
    setRefreshNote(`Refresh saved ${saved} game dates.`);
    const reloadError = await reloadReport();
    if (reloadError) setRefreshError(reloadError);
    setBusy("");
  }

  const gameDays = report?.days.filter((day) => day.game) ?? [];
  const leadingBlank =
    report && report.days.length > 0 ? mondayColumn(report.days[0].date) : 0;
  const sameSport = Boolean(report && report.hugo_group === hugoGroup);
  const reportMatchesSelection = Boolean(
    report &&
      sameSport &&
      report.from === from &&
      report.to === to,
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Attendance</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Headcount is anyone present at least once in the week. Session fill
          counts each scheduled practice.
        </p>

        <div className="mt-4">
          <Link
            href="/weight-room"
            className="inline-block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Back to hub
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Range
          </h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="block text-sm text-foreground">
              Sport
              <select
                value={hugoGroup}
                onChange={(e) => onGroupChange(e.target.value as HugoGroup)}
                className="mt-1 block w-full min-w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                {HUGO_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {HUGO_GROUP_META[group].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-foreground">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block text-sm text-foreground">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          {loadError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {loadError}
            </p>
          ) : null}
          {isValidating && report ? (
            <p className="mt-2 text-sm text-foreground-muted">Updating…</p>
          ) : null}
          {showingLastGood && report ? (
            <p className="mt-2 text-sm text-foreground-muted">
              Showing the last loaded report for{" "}
              {HUGO_GROUP_META[report.hugo_group as HugoGroup]?.label ??
                report.hugo_group}{" "}
              ({report.from} to {report.to}).
            </p>
          ) : null}
        </section>

        {!report && !loadError ? (
          <p className="mt-4 text-sm text-foreground-muted">Loading…</p>
        ) : null}

        {report ? (
          <>
            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Averages
              </h2>
              {report.needs_rhythm ? (
                <p className="mt-3 text-sm text-foreground">
                  Set practice days to calculate session fill.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <RateBlock
                  title="Team"
                  headcount={report.team.headcount}
                  sessionFill={report.team.session_fill}
                />
                {SPLITS.map((split) => (
                  <RateBlock
                    key={split.key}
                    title={split.label}
                    headcount={report.splits[split.key].headcount}
                    sessionFill={report.splits[split.key].session_fill}
                  />
                ))}
              </div>
              {report.unset_count > 0 ? (
                <p className="mt-3 text-sm text-foreground">
                  Unset enrollment: {report.unset_count}
                </p>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Practice days
              </h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Check Monday through Sunday, then save. This form starts blank
                because the report does not return the saved weekdays.
                Scheduled dates below show the result.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={weekdays.includes(day.value)}
                      onChange={() => toggleWeekday(day.value)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy !== ""}
                onClick={() => void onSaveRhythm()}
                className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {busy === "rhythm" ? "Saving…" : "Save practice days"}
              </button>
              {rhythmError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {rhythmError}
                </p>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Sessions
              </h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Cancelled rhythm days drop off this list. Restore a date you
                just changed, or enter a date and choose Restore, so the
                practice rhythm applies again.
              </p>
              {report.scheduled_dates.length === 0 ? (
                <p className="mt-3 text-sm text-foreground-muted">
                  No scheduled dates in this range.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {report.scheduled_dates.map((date) => {
                    const added = recentEdits.some(
                      (edit) => edit.date === date && edit.action === "add",
                    );
                    return (
                      <li
                        key={date}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{date}</span>
                        <span className="flex gap-2">
                          {added ? (
                            <button
                              type="button"
                              disabled={busy !== "" || !sameSport}
                              onClick={() => void onSessionAction(date, "clear")}
                              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                            >
                              Restore
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy !== "" || !sameSport}
                            onClick={() => void onSessionAction(date, "cancel")}
                            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {recentEdits.some((edit) => edit.action === "cancel") ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {recentEdits
                    .filter((edit) => edit.action === "cancel")
                    .map((edit) => (
                      <li
                        key={edit.date}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                      >
                        <span className="text-sm text-foreground">
                          {edit.date} cancelled
                        </span>
                        <button
                          type="button"
                          disabled={busy !== ""}
                          onClick={() => void onSessionAction(edit.date, "clear")}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block text-sm text-foreground">
                  Date
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void onSessionAction(sessionDate, "add")}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  Add day
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void onSessionAction(sessionDate, "clear")}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
              {sessionError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {sessionError}
                </p>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Games
              </h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Saved games in this range are the dates marked Game on the
                heatmap. The report does not include Bound or manual source.
              </p>
              {gameDays.length === 0 ? (
                <p className="mt-3 text-sm text-foreground-muted">
                  No saved games in this range.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {gameDays.map((day) => (
                    <li
                      key={day.date}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                    >
                      <span className="text-sm text-foreground">
                        {day.date} · Game
                      </span>
                      <button
                        type="button"
                        disabled={busy !== "" || !sameSport}
                        onClick={() => void onDismissGame(day.date)}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block text-sm text-foreground">
                  Date
                  <input
                    type="date"
                    value={gameDate}
                    onChange={(e) => setGameDate(e.target.value)}
                    className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-sm text-foreground">
                  Label
                  <input
                    type="text"
                    value={gameLabel}
                    onChange={(e) => setGameLabel(e.target.value)}
                    placeholder="Optional"
                    className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void onAddGame(gameDate, gameLabel)}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  Add game
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void onRefreshGames()}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                >
                  {busy === "refresh" ? "Refreshing…" : "Refresh from Bound"}
                </button>
              </div>
              {refreshNote ? (
                <p className="mt-2 text-sm text-foreground">{refreshNote}</p>
              ) : null}
              {refreshError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {refreshError}
                </p>
              ) : null}
              {gameError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {gameError}
                </p>
              ) : null}
              {unmatched.length > 0 ? (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Unmatched Bound dates
                  </h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {unmatched.map((row) => (
                      <li
                        key={`${row.contest_date}:${row.label}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                      >
                        <span className="text-sm text-foreground">
                          {row.contest_date}
                          {row.label ? ` · ${row.label}` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={busy !== ""}
                          onClick={() => void onAddGame(row.contest_date, row.label)}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                        >
                          Add this date
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Days
              </h2>
              {report.days.length === 0 ? (
                <p className="mt-3 text-sm text-foreground-muted">
                  No days in this range.
                </p>
              ) : (
                <div className="mt-3">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-foreground-muted">
                    {WEEKDAY_HEADERS.map((label) => (
                      <div key={label}>{label}</div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {Array.from({ length: leadingBlank }, (_, index) => (
                      <div key={`pad-${index}`} />
                    ))}
                    {report.days.map((day) => (
                      <div
                        key={day.date}
                        className="rounded-lg border border-border bg-surface px-1 py-2 text-center"
                      >
                        <p className="text-xs text-foreground-muted">
                          {day.date.slice(5)}
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {day.count}
                        </p>
                        {day.game ? (
                          <p className="text-xs font-medium text-foreground">
                            Game
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!reportMatchesSelection ? (
                <p className="mt-2 text-sm text-foreground-muted">
                  This grid is {report.from} to {report.to}.
                </p>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                Athletes
              </h2>
              {report.athletes.length === 0 ? (
                <p className="mt-3 text-sm text-foreground-muted">
                  No athletes on this roster.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="text-foreground-muted">
                        <th className="px-2 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Enrollment</th>
                        <th className="px-2 py-2 font-medium">Session rate</th>
                        <th className="px-2 py-2 font-medium">Week rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.athletes.map((athlete) => (
                        <tr
                          key={athlete.athlete_id}
                          className="border-t border-border text-foreground"
                        >
                          <td className="px-2 py-2">
                            {athlete.last_name}, {athlete.first_name}
                          </td>
                          <td className="px-2 py-2">
                            {enrollmentLabel(athlete.enrollment)}
                          </td>
                          <td className="px-2 py-2">
                            {formatRate(athlete.session_rate)}
                          </td>
                          <td className="px-2 py-2">
                            {formatRate(athlete.week_rate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
