"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import { athleteHasHugoGroup } from "@/lib/weight-room/hugo-memberships";
import type { WeightRoomOverview } from "@/lib/weight-room/overview-aggregate";
import type { Athlete } from "@/types";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

async function overviewFetcher(url: string) {
  const res = await fetch(url);
  if (res.ok) return res.json();
  let message = res.statusText || `Failed to load overview (${res.status})`;
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string" && json.error.trim()) {
      message = json.error;
    }
  } catch {
    // not JSON
  }
  throw new Error(message);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Last Monday–Sunday in the browser's local timezone (week ending the most recent Sunday). */
export function lastMondaySundayLocal(now = new Date()): {
  from: string;
  to: string;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sunday = new Date(start);
  sunday.setDate(start.getDate() - start.getDay());
  const monday = new Date(sunday);
  monday.setDate(sunday.getDate() - 6);
  return { from: isoLocal(monday), to: isoLocal(sunday) };
}

function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  if (!header) return fallback;
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = header.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim() ?? fallback;
}

async function errorMessage(res: Response): Promise<string> {
  const fallback = `Download failed (${res.status})`;
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

function displayName(first: string, last: string): string {
  return `${first} ${last}`.trim() || "Unknown";
}

function formatParsedOutput(out: {
  load: number | null;
  reps: number | null;
  units: string | null;
}): string {
  if (out.load != null && out.reps != null) {
    const unit = out.units ? ` ${out.units}` : "";
    return `${out.load}×${out.reps}${unit}`;
  }
  if (out.load != null) {
    return out.units ? `${out.load} ${out.units}` : String(out.load);
  }
  return "—";
}

function OverviewTile({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-border/80 bg-surface/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5">
      <div className="mb-2 h-1 w-12 rounded-full bg-accent" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

async function downloadPdfBlob(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filenameFromDisposition(
      res.headers.get("Content-Disposition"),
      fallbackName
    );
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ReportsClient() {
  const defaults = useMemo(() => lastMondaySundayLocal(), []);
  const [hugoGroup, setHugoGroup] = useState<HugoGroup>("soccer");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [athleteId, setAthleteId] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);

  const { data, error, isLoading } = useSWR<{ data: Athlete[] }>(
    "/api/athletes?active=true",
    fetcher
  );

  const athletes = (data?.data ?? []).filter((a) =>
    athleteHasHugoGroup(a, hugoGroup)
  );

  const rangeInvalid = !from || !to || from > to;
  const downloadsDisabled = rangeInvalid || downloadBusy;

  const overviewKey = rangeInvalid
    ? null
    : `/api/weight-room/overview?hugo_group=${encodeURIComponent(hugoGroup)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const {
    data: overviewRes,
    error: overviewError,
    isLoading: overviewLoading,
  } = useSWR<{ data: WeightRoomOverview }>(overviewKey, overviewFetcher);

  const overview = overviewRes?.data;

  async function onDownload(url: string, fallbackName: string) {
    if (rangeInvalid) return;
    setDownloadError("");
    setDownloadBusy(true);
    try {
      await downloadPdfBlob(url, fallbackName);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Network error — try again"
      );
    } finally {
      setDownloadBusy(false);
    }
  }

  function downloadTeam() {
    const url = `/api/weight-room/reports/team?hugo_group=${encodeURIComponent(hugoGroup)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    void onDownload(url, `hugo-${hugoGroup}-${from}-${to}.pdf`);
  }

  function downloadAthlete() {
    if (!athleteId) return;
    const url = `/api/weight-room/reports/athlete?athlete_id=${encodeURIComponent(athleteId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    void onDownload(url, `hugo-athlete-${athleteId}-${from}-${to}.pdf`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Reports</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Download a team or individual PDF from reviewed session logs. Dates
          default to last Monday–Sunday in your local timezone (the week ending
          on the most recent Sunday, including today if today is Sunday). Range
          is capped at 12 weeks (84 days).
        </p>

        <div className="mt-4">
          <Link
            href="/weight-room"
            className="inline-block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Back to hub
          </Link>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Range
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-foreground">
              Group
              <select
                value={hugoGroup}
                onChange={(e) => {
                  setHugoGroup(e.target.value as HugoGroup);
                  setAthleteId("");
                }}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                {HUGO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {HUGO_GROUP_META[g].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-foreground">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-sm text-foreground">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          {rangeInvalid ? (
            <p className="mt-2 text-sm text-danger">
              Choose a from date on or before to.
            </p>
          ) : null}
          {downloadError ? (
            <p className="mt-2 text-sm text-danger">{downloadError}</p>
          ) : null}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Team overview
          </h2>
          {overviewLoading ? (
            <p className="mt-3 text-sm text-foreground-muted">Loading overview…</p>
          ) : null}
          {overviewError ? (
            <p className="mt-3 text-sm text-danger">
              {overviewError instanceof Error
                ? overviewError.message
                : "Failed to load overview"}
            </p>
          ) : null}
          {!rangeInvalid && !overviewLoading && !overviewError && overview ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <OverviewTile title="Attendance">
                <p className="text-2xl font-semibold text-foreground">
                  {overview.attendanceCount} / {overview.rosterCount}
                </p>
                {overview.attendanceByDate.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground-muted">No sessions in range</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {overview.attendanceByDate.map((row) => (
                      <li
                        key={row.session_date}
                        className="flex justify-between text-sm text-foreground"
                      >
                        <span>{row.session_date}</span>
                        <span className="text-foreground-muted">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </OverviewTile>

              <OverviewTile title="Best loads">
                {overview.bestLoads.length === 0 ? (
                  <p className="text-sm text-foreground-muted">—</p>
                ) : (
                  <ul className="space-y-1">
                    {overview.bestLoads.map((row) => (
                      <li
                        key={row.athlete_id}
                        className="flex justify-between gap-2 text-sm text-foreground"
                      >
                        <span>
                          {displayName(row.first_name, row.last_name)}
                        </span>
                        <span className="text-foreground-muted">{row.load}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </OverviewTile>

              <OverviewTile title="Outputs">
                {overview.outputs.length === 0 ? (
                  <p className="text-sm text-foreground-muted">—</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.outputs.map((row, i) => (
                      <li
                        key={`${row.athlete_id}-${row.movement_name}-${row.session_date}-${i}`}
                        className="text-sm text-foreground"
                      >
                        <p>
                          {displayName(row.first_name, row.last_name)}
                          <span className="text-foreground-muted">
                            {" "}
                            · {row.movement_name}
                          </span>
                        </p>
                        <p className="text-foreground-muted">
                          {row.raw_text?.trim() || "—"} / {formatParsedOutput(row)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </OverviewTile>

              <OverviewTile title="No-shows">
                {overview.noShows.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    {overview.rosterCount === 0
                      ? "No rostered athletes"
                      : "None"}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {overview.noShows.map((a) => (
                      <li key={a.id} className="text-sm text-foreground">
                        {a.last_name}, {a.first_name}
                      </li>
                    ))}
                  </ul>
                )}
              </OverviewTile>
            </div>
          ) : null}
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Team PDF
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            One packet for {HUGO_GROUP_META[hugoGroup].label}. Empty ranges still
            download a PDF with an empty-state page.
          </p>
          <button
            type="button"
            disabled={downloadsDisabled}
            onClick={downloadTeam}
            className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {downloadBusy ? "Downloading…" : "Download team PDF"}
          </button>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Individual PDF
          </h2>
          <label className="mt-3 block text-sm text-foreground">
            Athlete
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className="mt-1 block w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">
                {isLoading
                  ? "Loading athletes…"
                  : error
                    ? "Failed to load athletes"
                    : athletes.length === 0
                      ? "No active athletes in this group"
                      : "Select athlete"}
              </option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.last_name}, {a.first_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!athleteId || downloadsDisabled}
            onClick={downloadAthlete}
            className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {downloadBusy ? "Downloading…" : "Download individual PDF"}
          </button>
        </section>
      </main>
    </div>
  );
}
