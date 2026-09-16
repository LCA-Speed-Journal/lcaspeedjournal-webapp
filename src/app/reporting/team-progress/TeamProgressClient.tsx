"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { F2fTriangle } from "@/app/reporting/testing-day/F2fTriangle";
import { F2fOverlayTriangle } from "@/app/reporting/testing-day/F2fOverlayTriangle";
import {
  defaultRangeForHugoGroup,
  lastNDaysRange,
  schoolYearRange,
} from "@/lib/team-progress/date-presets";
import type { F2fEndMode } from "@/lib/team-progress/f2f-aggregate";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import type { TeamProgressPayload } from "@/lib/team-progress/build-payload";
import { metricLabel } from "@/lib/norms/editor-metrics";
import { f2fShowsPredicted40s } from "@/lib/norms/f2f/labels";
import type { F2fProfile, F2fQuality } from "@/lib/norms/f2f/types";

const TeamProgressLineChart = dynamic(
  () =>
    import("./TeamProgressChart").then((m) => m.TeamProgressLineChart),
  { ssr: false }
);

async function fetcher(url: string) {
  const res = await fetch(url);
  if (res.ok) return res.json() as Promise<{ data: TeamProgressPayload }>;
  let message = res.statusText || `Failed (${res.status})`;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    // ignore
  }
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/reporting/team-progress";
  }
  throw new Error(message);
}

function fmtDelta(delta: number | null, lowerIsBetter: boolean): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return `${sign}${delta.toFixed(2)}${improved ? " ↑" : delta === 0 ? "" : " ↓"}`;
}

function fmtPct(p: number | null): string {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}

function fmtForty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

const PREDICTED_40_ROWS: { quality: F2fQuality; label: string }[] = [
  { quality: "explosion", label: "Explosion" },
  { quality: "force", label: "Force" },
  { quality: "form", label: "Form" },
];

function F2fPredicted40Progress({
  beginning,
  end,
}: {
  beginning: F2fProfile;
  end: F2fProfile;
}) {
  if (!f2fShowsPredicted40s(beginning) && !f2fShowsPredicted40s(end)) {
    return null;
  }
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      <p className="tabular-nums text-foreground-muted">
        Ref 40 {fmtForty(beginning.reference_40)} → {fmtForty(end.reference_40)}
      </p>
      <ul className="space-y-0.5">
        {PREDICTED_40_ROWS.map(({ quality, label }) => {
          const b = beginning[quality];
          const e = end[quality];
          const projected = Boolean(e?.projected || b?.projected);
          return (
            <li
              key={quality}
              className={
                projected
                  ? "tabular-nums text-foreground-muted"
                  : "tabular-nums text-foreground"
              }
            >
              <span className="inline-block w-[4.5rem]">{label}</span>
              {fmtForty(b?.predicted_40)} → {fmtForty(e?.predicted_40)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Stable SSR fallback — fall season window; refined on mount. */
const SSR_RANGE = { from: "2026-08-01", to: "2026-11-30" };

export default function TeamProgressClient() {
  const [hugoGroup, setHugoGroup] = useState<HugoGroup>("football");
  const [from, setFrom] = useState(SSR_RANGE.from);
  const [to, setTo] = useState(SSR_RANGE.to);
  const [addedMetrics, setAddedMetrics] = useState<string[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [f2fMode, setF2fMode] = useState<F2fEndMode>("latest");
  const [f2fLayout, setF2fLayout] = useState<"side" | "overlay">("side");

  useEffect(() => {
    const r = defaultRangeForHugoGroup("football");
    setFrom(r.from);
    setTo(r.to);
    setReady(true);
  }, []);

  function applyPreset(kind: "season" | "school" | "90") {
    const now = new Date();
    if (kind === "90") {
      const r = lastNDaysRange(now, 90);
      setFrom(r.from);
      setTo(r.to);
      return;
    }
    if (kind === "school") {
      const r = schoolYearRange(now);
      setFrom(r.from);
      setTo(r.to);
      return;
    }
    const r = defaultRangeForHugoGroup(hugoGroup, now);
    setFrom(r.from);
    setTo(r.to);
  }

  function onGroupChange(group: HugoGroup) {
    setHugoGroup(group);
    setAddedMetrics([]);
    const r = defaultRangeForHugoGroup(group);
    setFrom(r.from);
    setTo(r.to);
  }

  const query = useMemo(() => {
    if (!ready) return null;
    const params = new URLSearchParams({
      hugo_group: hugoGroup,
      from,
      to,
      f2f_mode: f2fMode,
    });
    for (const m of addedMetrics) params.append("extra_metric", m);
    return `/api/reporting/team-progress?${params.toString()}`;
  }, [hugoGroup, from, to, addedMetrics, f2fMode, ready]);

  const { data, error, isLoading } = useSWR(query, fetcher);
  const payload = data?.data;

  async function downloadPdf() {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const params = new URLSearchParams({
        hugo_group: hugoGroup,
        from,
        to,
        f2f_mode: f2fMode,
      });
      for (const m of addedMetrics) params.append("extra_metric", m);
      const res = await fetch(
        `/api/reporting/team-progress/pdf?${params.toString()}`
      );
      if (!res.ok) {
        let message = res.statusText;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-progress-${hugoGroup}-${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setPdfBusy(false);
    }
  }

  const available = payload?.available_extra_metrics ?? [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-8">
        <div
          className="rounded-2xl border-2 border-border/80 bg-surface/90 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8"
          style={{
            boxShadow:
              "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)",
          }}
        >
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Team Progress
              </h1>
              <p className="mt-2 text-sm text-foreground-muted">
                Season story for one Hugo sport: tests, lifts, ISO Rocks, and
                per-athlete Force-to-Form.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={pdfBusy || !payload}
                className="rounded-xl border border-accent/60 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/25 disabled:opacity-50"
              >
                {pdfBusy ? "Preparing PDF…" : "Download PDF"}
              </button>
              <Link
                href="/reporting"
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/50"
              >
                Reporting
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/50"
              >
                Home
              </Link>
            </div>
          </header>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Hugo sport</span>
              <select
                value={hugoGroup}
                onChange={(e) => onGroupChange(e.target.value as HugoGroup)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                {HUGO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {HUGO_GROUP_META[g].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground-muted">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground-muted">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset("season")}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent/50"
              >
                This season
              </button>
              <button
                type="button"
                onClick={() => applyPreset("school")}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent/50"
              >
                School year
              </button>
              <button
                type="button"
                onClick={() => applyPreset("90")}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent/50"
              >
                Last 90 days
              </button>
            </div>
          </div>

          {available.length > 0 ? (
            <label className="mb-6 flex max-w-md flex-col gap-1 text-sm">
              <span className="text-foreground-muted">Add test (optional)</span>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setAddedMetrics((prev) =>
                    prev.includes(v) ? prev : [...prev, v]
                  );
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Select a metric with data…</option>
                {available.map((m) => (
                  <option key={m} value={m}>
                    {metricLabel(m)}
                  </option>
                ))}
              </select>
              {addedMetrics.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {addedMetrics.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setAddedMetrics((prev) => prev.filter((x) => x !== m))
                      }
                      className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-foreground"
                    >
                      {metricLabel(m)} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          ) : null}

          {pdfError ? (
            <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {pdfError}
            </p>
          ) : null}
          {error ? (
            <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error instanceof Error ? error.message : "Failed to load"}
            </p>
          ) : null}
          {!ready || isLoading ? (
            <p className="text-sm text-foreground-muted">Loading…</p>
          ) : null}

          {payload ? (
            <>
              <p className="mb-4 text-sm text-foreground-muted">
                {HUGO_GROUP_META[hugoGroup].label} · roster {payload.roster_count}{" "}
                · {payload.athletes_with_tests} with ≥1 test ·{" "}
                {payload.from} → {payload.to}
              </p>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  Scoreboard
                </h2>
                {payload.tests.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No testing marks in this window.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {payload.tests.map((t) => (
                      <div
                        key={t.metric_key}
                        className="rounded-xl border border-border bg-surface-elevated/50 p-3"
                      >
                        <p className="text-xs uppercase tracking-wide text-foreground-muted">
                          {t.source === "group_extra"
                            ? "Group extra"
                            : t.source === "added"
                              ? "Added"
                              : "Core"}
                        </p>
                        <p className="font-semibold text-foreground">
                          {metricLabel(t.metric_key)}
                        </p>
                        <p className="mt-1 text-sm text-accent">
                          {fmtDelta(t.delta, t.lower_is_better)}
                          {t.units ? ` ${t.units}` : ""}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          Improved {fmtPct(t.improved_pct)} · n first{" "}
                          {t.first?.n ?? "—"} → last {t.last?.n ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  Testing trends
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {payload.tests.map((t) => (
                    <div
                      key={`chart-${t.metric_key}`}
                      className="rounded-xl border border-border bg-surface-elevated/40 p-3"
                    >
                      <p className="mb-2 text-sm font-medium text-foreground">
                        {metricLabel(t.metric_key)}
                        {t.units ? ` (${t.units})` : ""}
                      </p>
                      <TeamProgressLineChart
                        label={metricLabel(t.metric_key)}
                        units={t.units}
                        points={t.points.map((p) => ({
                          date: p.date,
                          value: p.median,
                          n: p.n,
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  Lifts (Squat / Press / Hinge)
                </h2>
                {payload.lifts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No matching squat, press, or hinge loads in this window.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {payload.lifts.map((lift) => (
                      <div
                        key={lift.lift_id}
                        className="rounded-xl border border-border bg-surface-elevated/40 p-3"
                      >
                        <p className="mb-1 text-sm font-medium text-foreground">
                          {lift.label}
                        </p>
                        <p className="mb-2 text-xs text-accent">
                          {fmtDelta(lift.delta, false)} lb
                        </p>
                        <TeamProgressLineChart
                          label={lift.label}
                          units="lb"
                          points={lift.points.map((p) => ({
                            date: p.date,
                            value: p.median,
                            n: p.n,
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  Weekly ISO Rocks
                </h2>
                <p className="mb-3 text-xs text-foreground-muted">
                  Prescribed hold duration from the program cards (not scanned
                  athlete times).
                </p>
                {payload.iso_rocks.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No ISO Rock prescriptions found in this window.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {payload.iso_rocks.map((rock) => (
                      <div
                        key={rock.rock_id}
                        className="rounded-xl border border-border bg-surface-elevated/40 p-3"
                      >
                        <p className="mb-2 text-sm font-medium text-foreground">
                          {rock.label}
                        </p>
                        <TeamProgressLineChart
                          label={rock.label}
                          units="s"
                          points={rock.points.map((p) => ({
                            date: p.week_start,
                            value: p.seconds,
                            n: p.n,
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mb-8">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Force-to-Form (per athlete)
                    </h2>
                    <p className="mt-1 text-xs text-foreground-muted">
                      Beginning = earliest mark per test. End ={" "}
                      {f2fMode === "best" ? "best" : "most recent"} per test.
                      Standing Broad and top-speed carry forward when not
                      retested. Shown when ≥1 quality was retested.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div
                      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
                      role="group"
                      aria-label="Force-to-Form end mode"
                    >
                      {(
                        [
                          { value: "latest" as const, label: "Most recent" },
                          { value: "best" as const, label: "Best" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={f2fMode === opt.value}
                          onClick={() => setF2fMode(opt.value)}
                          className={
                            f2fMode === opt.value
                              ? "rounded-md bg-accent px-3 py-1 text-xs font-medium text-background"
                              : "rounded-md px-3 py-1 text-xs text-foreground-muted hover:text-foreground"
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div
                      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
                      role="group"
                      aria-label="Force-to-Form layout"
                    >
                      {(
                        [
                          { value: "side" as const, label: "Side by side" },
                          { value: "overlay" as const, label: "Overlay" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={f2fLayout === opt.value}
                          onClick={() => setF2fLayout(opt.value)}
                          className={
                            f2fLayout === opt.value
                              ? "rounded-md bg-accent px-3 py-1 text-xs font-medium text-background"
                              : "rounded-md px-3 py-1 text-xs text-foreground-muted hover:text-foreground"
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {f2fLayout === "overlay" ? (
                  <p className="mb-3 text-xs text-foreground-muted">
                    <span className="mr-3 inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--f2f-overlay-begin)]"
                        aria-hidden
                      />
                      Beginning
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--f2f-overlay-end)]"
                        aria-hidden
                      />
                      {f2fMode === "best" ? "Best" : "Most recent"}
                    </span>
                  </p>
                ) : null}
                {payload.f2f.athletes.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No athletes with a retested Force-to-Form quality in this
                    window.
                  </p>
                ) : (
                  <div
                    className={
                      f2fLayout === "overlay"
                        ? "grid gap-3 sm:grid-cols-2"
                        : "space-y-3"
                    }
                  >
                    {payload.f2f.athletes.map((a) => {
                      const endLabel =
                        f2fMode === "best" ? "Best" : "Most recent";
                      return (
                        <div
                          key={a.id}
                          className={
                            f2fLayout === "overlay"
                              ? "flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated/40 p-3"
                              : "flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                          }
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/athletes?id=${a.id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {a.first_name} {a.last_name}
                            </Link>
                            <p className="text-xs text-foreground-muted">
                              {a.first_session_date} → {a.last_session_date}
                            </p>
                            <p className="text-sm text-foreground">
                              {(a.first_profile.primary ?? "—").toString()} →{" "}
                              {(a.last_profile.primary ?? "—").toString()}
                            </p>
                            <F2fPredicted40Progress
                              beginning={a.first_profile}
                              end={a.last_profile}
                            />
                          </div>
                          {f2fLayout === "overlay" ? (
                            <div className="flex justify-center">
                              <F2fOverlayTriangle
                                beginning={a.first_profile}
                                end={a.last_profile}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <p className="mb-1 text-[10px] uppercase text-foreground-muted">
                                  Beginning
                                </p>
                                <F2fTriangle profile={a.first_profile} />
                              </div>
                              <div className="text-center">
                                <p className="mb-1 text-[10px] uppercase text-foreground-muted">
                                  {endLabel}
                                </p>
                                <F2fTriangle profile={a.last_profile} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  Athlete deltas
                </h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface-elevated text-xs uppercase text-foreground-muted">
                      <tr>
                        <th className="px-3 py-2">Athlete</th>
                        {payload.tests.slice(0, 4).map((t) => (
                          <th key={t.metric_key} className="px-3 py-2">
                            {metricLabel(t.metric_key)} Δ
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.athletes.map((a) => (
                        <tr
                          key={a.id}
                          className="border-t border-border/60 odd:bg-surface/40"
                        >
                          <td className="px-3 py-2">
                            <Link
                              href={`/athletes?id=${a.id}`}
                              className="text-accent hover:underline"
                            >
                              {a.last_name}, {a.first_name}
                            </Link>
                          </td>
                          {payload.tests.slice(0, 4).map((t) => {
                            const d = a.tests[t.metric_key];
                            return (
                              <td
                                key={t.metric_key}
                                className="px-3 py-2 tabular-nums text-foreground-muted"
                              >
                                {d ? d.delta.toFixed(2) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
