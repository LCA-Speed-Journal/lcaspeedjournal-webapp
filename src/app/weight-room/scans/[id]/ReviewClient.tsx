"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import {
  cellKey,
  parseScanExtraction,
} from "@/lib/weight-room/confirm-scan";
import { parseLoadReps } from "@/lib/weight-room/parse-load-reps";
import { isOnHugoTeam } from "@/lib/weight-room/hugo-memberships";
import type { Athlete } from "@/types";
import type {
  ScanListRow,
  WorkoutMovement,
  WorkoutTemplate,
} from "@/types/weight-room";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type ScanDetail = {
  scan: ScanListRow;
  template: (WorkoutTemplate & { movements: WorkoutMovement[] }) | null;
  duplicate_warning: boolean;
};

function errorText(json: { error?: string }, fallback: string): string {
  return json.error ?? fallback;
}

function athleteName(a: Athlete): string {
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
  return raw.trim() ? "unknown" : "—";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function ReviewClient({ scanId }: { scanId: string }) {
  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ data: ScanDetail }>(
    `/api/weight-room/scans/${scanId}`,
    fetcher
  );
  const { data: athletesRes, error: athletesError } = useSWR<{
    data: Athlete[];
  }>("/api/athletes?active=true", fetcher);

  const detail = data?.data;
  const scan = detail?.scan;
  const template = detail?.template ?? null;
  const roster = useMemo(
    () => (athletesRes?.data ?? []).filter((a) => isOnHugoTeam(a)),
    [athletesRes]
  );

  const [athleteId, setAthleteId] = useState("");
  const [editedCells, setEditedCells] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!scan) return;
    setAthleteId(scan.athlete_id ?? "");
  }, [scan?.id, scan?.athlete_id]);

  useEffect(() => {
    if (!scan) return;
    const cells = parseScanExtraction(scan.extraction).cells;
    if (!template) {
      setEditedCells(cells);
      return;
    }
    const next: Record<string, string> = {};
    for (const movement of template.movements) {
      for (let i = 0; i < movement.set_count; i++) {
        const key = cellKey(movement.id, i);
        next[key] = cells[key] ?? "";
      }
    }
    setEditedCells(next);
    // Seed from the loaded scan, not on every SWR mutate (athlete PATCH would wipe edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.id, template?.id]);

  const readOnly =
    scan?.status === "confirmed" || scan?.status === "rejected";
  const canConfirm = Boolean(athleteId) && Boolean(scan?.template_id) && !readOnly;

  async function patchScan(body: Record<string, unknown>) {
    const res = await fetch(`/api/weight-room/scans/${scanId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(errorText(json, "Update failed"));
    }
    await mutate();
  }

  async function onAthleteChange(nextId: string) {
    setAthleteId(nextId);
    setActionError("");
    setActionMessage("");
    if (readOnly) return;
    setBusy(true);
    try {
      await patchScan({ athlete_id: nextId || null });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const res = await fetch(`/api/weight-room/scans/${scanId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, cells: editedCells }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(errorText(json, "Confirm failed"));
        return;
      }
      setActionMessage("Confirmed. Session log saved.");
      await mutate();
    } catch {
      setActionError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (readOnly) return;
    setBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      await patchScan({ status: "rejected" });
      setActionMessage("Scan rejected.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Review scan</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/weight-room/scans"
            className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Back to inbox
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-foreground-muted">Loading…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-danger">Failed to load scan</p>
        ) : !scan ? (
          <p className="mt-6 text-sm text-danger">Scan not found</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-foreground-muted">
              Status: {statusLabel(scan.status)}
              {scan.template_title ? ` · ${scan.template_title}` : ""}
            </p>

            {detail?.duplicate_warning ? (
              <p className="mt-4 rounded-lg border border-accent/50 bg-accent-dim px-3 py-2 text-sm text-foreground">
                A session log already exists for this athlete and card.
                Confirming will overwrite it.
              </p>
            ) : null}

            {athletesError ? (
              <p className="mt-4 text-sm text-danger">Failed to load athletes</p>
            ) : null}
            {actionError ? (
              <p className="mt-4 text-sm text-danger">{actionError}</p>
            ) : null}
            {actionMessage ? (
              <p className="mt-4 text-sm text-foreground">{actionMessage}</p>
            ) : null}

            <section className="mt-6 overflow-hidden rounded-xl border border-border bg-surface-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scan.blob_url}
                alt="Uploaded workout card"
                className="max-h-[28rem] w-full object-contain bg-surface"
              />
            </section>

            <section className="mt-6 rounded-xl border border-border bg-surface-elevated p-4">
              <label className="block text-sm text-foreground">
                Athlete
                {scan.status === "unmatched" ? " (required)" : ""}
                <select
                  value={athleteId}
                  disabled={busy || readOnly}
                  onChange={(e) => void onAthleteChange(e.target.value)}
                  className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select athlete</option>
                  {roster.map((a) => (
                    <option key={a.id} value={a.id}>
                      {athleteName(a)}
                    </option>
                  ))}
                </select>
              </label>
              {!scan.template_id ? (
                <p className="mt-3 text-sm text-danger">
                  This scan has no template, so it cannot be confirmed.
                </p>
              ) : null}
            </section>

            <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface-elevated">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-foreground-muted">
                    <th className="px-3 py-2 font-medium">Movement</th>
                    <th className="px-3 py-2 font-medium">Set</th>
                    <th className="px-3 py-2 font-medium">Raw</th>
                    <th className="px-3 py-2 font-medium">Parsed</th>
                  </tr>
                </thead>
                <tbody>
                  {(template?.movements ?? []).flatMap((movement) =>
                    Array.from({ length: movement.set_count }, (_, setIndex) => {
                      const key = cellKey(movement.id, setIndex);
                      const raw = editedCells[key] ?? "";
                      return (
                        <tr
                          key={key}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-3 py-2 text-foreground">
                            {movement.name}
                          </td>
                          <td className="px-3 py-2 text-foreground-muted">
                            {setIndex + 1}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={raw}
                              disabled={busy || readOnly}
                              onChange={(e) =>
                                setEditedCells((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              className="w-full min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2 text-foreground-muted">
                            {previewParsed(raw)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {!template ? (
                <p className="px-3 py-3 text-sm text-foreground-muted">
                  No template movements to review.
                </p>
              ) : null}
            </section>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !canConfirm}
                onClick={() => void onConfirm()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {busy ? "Working…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={busy || readOnly}
                onClick={() => void onReject()}
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
