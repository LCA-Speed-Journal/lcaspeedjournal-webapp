"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import type { Athlete } from "@/types";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type ExactMatch = { id: string; first_name: string; last_name: string };

type PreviewRow = {
  raw: string;
  first_name: string;
  last_name: string;
  error?: string;
  exact_matches: ExactMatch[];
};

type ReviewAction = "create" | "link";

type ReviewRow = {
  raw: string;
  first_name: string;
  last_name: string;
  parseError?: string;
  exact_matches: ExactMatch[];
  action: ReviewAction;
  athleteId: string;
  commitError?: string;
};

type CommitError = {
  index: number;
  error: string;
  athlete_id?: string;
};

type CommitResult = {
  added: number;
  created: number;
  errors: CommitError[];
};

function jsonError(json: { error?: unknown }, fallback: string): string {
  return typeof json.error === "string" && json.error.trim()
    ? json.error
    : fallback;
}

function toReviewRow(row: PreviewRow): ReviewRow {
  const matches = row.exact_matches ?? [];
  if (row.error) {
    return {
      raw: row.raw,
      first_name: row.first_name,
      last_name: row.last_name,
      parseError: row.error,
      exact_matches: matches,
      action: "create",
      athleteId: "",
    };
  }
  if (matches.length === 1) {
    return {
      raw: row.raw,
      first_name: row.first_name,
      last_name: row.last_name,
      exact_matches: matches,
      action: "link",
      athleteId: matches[0].id,
    };
  }
  if (matches.length >= 2) {
    return {
      raw: row.raw,
      first_name: row.first_name,
      last_name: row.last_name,
      exact_matches: matches,
      action: "link",
      athleteId: "",
    };
  }
  return {
    raw: row.raw,
    first_name: row.first_name,
    last_name: row.last_name,
    exact_matches: matches,
    action: "create",
    athleteId: "",
  };
}

function isEligible(row: ReviewRow): boolean {
  if (row.parseError) return false;
  if (row.action === "create") return true;
  return Boolean(row.athleteId);
}

function pickerAthletes(row: ReviewRow, all: Athlete[]): ExactMatch[] {
  const matchIds = new Set(row.exact_matches.map((m) => m.id));
  const rest = all
    .filter((a) => !matchIds.has(a.id))
    .map((a) => ({
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
    }));
  return [...row.exact_matches, ...rest];
}

function athleteLabel(a: { first_name: string; last_name: string }): string {
  return `${a.last_name}, ${a.first_name}`;
}

export function RostersClient() {
  const [hugoGroup, setHugoGroup] = useState<HugoGroup>("soccer");
  const [pasteText, setPasteText] = useState("");
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [removingId, setRemovingId] = useState("");
  const [removeError, setRemoveError] = useState("");

  const rosterKey = `/api/weight-room/rosters?hugo_group=${encodeURIComponent(hugoGroup)}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: Athlete[] }>(
    rosterKey,
    fetcher
  );
  const { data: athletesData } = useSWR<{ data: Athlete[] }>(
    "/api/athletes?active=true",
    fetcher
  );

  const members = data?.data ?? [];
  const activeAthletes = athletesData?.data ?? [];
  const eligibleRows = useMemo(
    () => reviewRows.filter(isEligible),
    [reviewRows]
  );
  const incompleteLink = reviewRows.some(
    (row) => !row.parseError && row.action === "link" && !row.athleteId
  );
  const parseErrorCount = reviewRows.filter((row) => row.parseError).length;

  function onGroupChange(next: HugoGroup) {
    setHugoGroup(next);
    setReviewRows([]);
    setPreviewError("");
    setConfirmError("");
    setCommitResult(null);
    setRemoveError("");
  }

  async function onPrepare() {
    setPreviewError("");
    setConfirmError("");
    setCommitResult(null);
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/weight-room/rosters/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hugo_group: hugoGroup, text: pasteText }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { rows?: PreviewRow[] };
      };
      if (!res.ok) {
        setPreviewError(jsonError(json, "Failed to prepare import"));
        setReviewRows([]);
        return;
      }
      setReviewRows((json.data?.rows ?? []).map(toReviewRow));
    } catch {
      setPreviewError("Network error — try again");
      setReviewRows([]);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onConfirm() {
    if (incompleteLink || eligibleRows.length === 0) return;
    setConfirmError("");
    setCommitResult(null);
    setConfirmBusy(true);
    try {
      const payload = eligibleRows.map((row) =>
        row.action === "create"
          ? {
              first_name: row.first_name,
              last_name: row.last_name,
              create: true,
            }
          : {
              first_name: row.first_name,
              last_name: row.last_name,
              athlete_id: row.athleteId,
            }
      );
      const res = await fetch("/api/weight-room/rosters/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hugo_group: hugoGroup, rows: payload }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { added?: number; created?: number; errors?: CommitError[] };
      };
      if (!res.ok) {
        setConfirmError(jsonError(json, "Failed to confirm import"));
        return;
      }
      const errors = json.data?.errors ?? [];
      const result: CommitResult = {
        added: json.data?.added ?? 0,
        created: json.data?.created ?? 0,
        errors,
      };
      setCommitResult(result);
      setReviewRows((prev) => applyCommitErrors(prev, errors));
      await mutate();
    } catch {
      setConfirmError("Network error — try again");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function onRemove(athleteId: string) {
    setRemoveError("");
    setRemovingId(athleteId);
    try {
      const res = await fetch(
        `/api/weight-room/rosters?athlete_id=${encodeURIComponent(athleteId)}&hugo_group=${encodeURIComponent(hugoGroup)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRemoveError(jsonError(json, "Failed to remove athlete"));
        return;
      }
      await mutate();
    } catch {
      setRemoveError("Network error — try again");
    } finally {
      setRemovingId("");
    }
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setReviewRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Rosters</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Review every pasted name before anyone is added. Link an existing
          athlete or create a new one, then confirm.
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
            Sport
          </h2>
          <label className="mt-3 block text-sm text-foreground">
            Group
            <select
              value={hugoGroup}
              onChange={(e) => onGroupChange(e.target.value as HugoGroup)}
              className="mt-1 block w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {HUGO_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {HUGO_GROUP_META[g].label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            {HUGO_GROUP_META[hugoGroup].label} roster
          </h2>
          {isLoading ? (
            <p className="mt-3 text-sm text-foreground-muted">Loading…</p>
          ) : error ? (
            <p className="mt-3 text-sm text-danger">Failed to load roster</p>
          ) : members.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted">
              No one on this roster yet. Paste a list from the AD, or assign
              teams on Manage athletes.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {members.map((athlete) => (
                <li
                  key={athlete.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <span className="min-w-0 text-sm text-foreground">
                    {athleteLabel(athlete)}
                  </span>
                  <button
                    type="button"
                    disabled={removingId === athlete.id}
                    onClick={() => void onRemove(athlete.id)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
                  >
                    {removingId === athlete.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {removeError ? (
            <p className="mt-2 text-sm text-danger">{removeError}</p>
          ) : null}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Import from AD list
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Paste names (one per line). Prepare import only matches — Confirm
            import is what saves memberships.
          </p>
          <label className="mt-3 block text-sm text-foreground">
            Names
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder={"Last, First\nFirst Last"}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={previewBusy || !pasteText.trim()}
              onClick={() => void onPrepare()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {previewBusy ? "Preparing…" : "Prepare import"}
            </button>
            <button
              type="button"
              disabled={
                confirmBusy ||
                previewBusy ||
                eligibleRows.length === 0 ||
                incompleteLink
              }
              onClick={() => void onConfirm()}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
            >
              {confirmBusy ? "Confirming…" : "Confirm import"}
            </button>
          </div>
          {previewError ? (
            <p className="mt-2 text-sm text-danger">{previewError}</p>
          ) : null}
          {confirmError ? (
            <p className="mt-2 text-sm text-danger">{confirmError}</p>
          ) : null}
          {incompleteLink ? (
            <p className="mt-2 text-sm text-danger">
              Pick an athlete for every row with more than one match, or switch
              that row to Create.
            </p>
          ) : null}
          {commitResult ? (
            <div className="mt-3 text-sm text-foreground">
              <p>
                Added {commitResult.added}
                {commitResult.created > 0
                  ? `, created ${commitResult.created}`
                  : ""}
                .
              </p>
              {commitResult.errors.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 text-danger">
                  {commitResult.errors.map((err) => (
                    <li key={`${err.index}-${err.error}`}>
                      Row {err.index + 1}: {err.error}
                      {err.athlete_id ? ` (athlete ${err.athlete_id})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {reviewRows.length > 0 ? (
            <div className="mt-4">
              <div className="hidden md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-foreground-muted">
                      <th className="py-2 pr-3 font-medium">Raw</th>
                      <th className="py-2 pr-3 font-medium">First</th>
                      <th className="py-2 pr-3 font-medium">Last</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                      <th className="py-2 font-medium">Athlete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((row, index) => (
                      <ReviewTableRow
                        key={`${row.raw}-${index}`}
                        row={row}
                        athletes={activeAthletes}
                        onAction={(action) =>
                          updateRow(index, { action, commitError: undefined })
                        }
                        onAthlete={(athleteId) =>
                          updateRow(index, { athleteId, commitError: undefined })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-3 md:hidden">
                {reviewRows.map((row, index) => (
                  <li
                    key={`${row.raw}-${index}`}
                    className="rounded-xl border border-border bg-surface px-3 py-3 text-sm"
                  >
                    <p className="text-foreground-muted">{row.raw}</p>
                    <p className="mt-1 text-foreground">
                      {row.first_name || "—"} {row.last_name || "—"}
                    </p>
                    {row.parseError ? (
                      <p className="mt-2 text-danger">{row.parseError}</p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2">
                        <select
                          value={row.action}
                          onChange={(e) =>
                            updateRow(index, {
                              action: e.target.value as ReviewAction,
                              commitError: undefined,
                            })
                          }
                          className="w-full rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground"
                        >
                          <option value="create">Create</option>
                          <option value="link">Link</option>
                        </select>
                        <ReviewAthletePicker
                          row={row}
                          athletes={activeAthletes}
                          onChange={(athleteId) =>
                            updateRow(index, {
                              athleteId,
                              commitError: undefined,
                            })
                          }
                        />
                        {row.commitError ? (
                          <p className="text-danger">{row.commitError}</p>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {parseErrorCount > 0 ? (
                <p className="mt-2 text-sm text-foreground-muted">
                  {parseErrorCount} row
                  {parseErrorCount === 1 ? "" : "s"} with a parse error will not
                  be sent on Confirm.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ReviewAthletePicker({
  row,
  athletes,
  onChange,
}: {
  row: ReviewRow;
  athletes: Athlete[];
  onChange: (athleteId: string) => void;
}) {
  if (row.action !== "link") {
    return <span className="text-foreground-muted">New athlete</span>;
  }
  return (
    <select
      value={row.athleteId}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
    >
      <option value="">
        {row.exact_matches.length >= 2 ? "Select athlete" : "Pick athlete"}
      </option>
      {pickerAthletes(row, athletes).map((a) => (
        <option key={a.id} value={a.id}>
          {athleteLabel(a)}
        </option>
      ))}
    </select>
  );
}

function ReviewTableRow({
  row,
  athletes,
  onAction,
  onAthlete,
}: {
  row: ReviewRow;
  athletes: Athlete[];
  onAction: (action: ReviewAction) => void;
  onAthlete: (athleteId: string) => void;
}) {
  return (
    <tr className="border-b border-border/70 align-top">
      <td className="break-words py-2 pr-3 text-foreground-muted">{row.raw}</td>
      <td className="py-2 pr-3 text-foreground">{row.first_name || "—"}</td>
      <td className="py-2 pr-3 text-foreground">{row.last_name || "—"}</td>
      <td className="py-2 pr-3" colSpan={row.parseError ? 2 : 1}>
        {row.parseError ? (
          <p className="text-danger">{row.parseError}</p>
        ) : (
          <select
            value={row.action}
            onChange={(e) => onAction(e.target.value as ReviewAction)}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            <option value="create">Create</option>
            <option value="link">Link</option>
          </select>
        )}
      </td>
      {!row.parseError ? (
        <td className="py-2">
          <ReviewAthletePicker row={row} athletes={athletes} onChange={onAthlete} />
          {row.commitError ? (
            <p className="mt-1 text-danger">{row.commitError}</p>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

function applyCommitErrors(
  rows: ReviewRow[],
  errors: CommitError[]
): ReviewRow[] {
  const byPayloadIndex = new Map(errors.map((err) => [err.index, err]));
  const next: ReviewRow[] = [];
  let payloadIndex = 0;

  for (const row of rows) {
    if (!isEligible(row)) {
      next.push({ ...row, commitError: undefined });
      continue;
    }
    const err = byPayloadIndex.get(payloadIndex);
    payloadIndex += 1;
    if (!err) continue;
    next.push({
      ...row,
      action: err.athlete_id ? "link" : row.action,
      athleteId: err.athlete_id ?? row.athleteId,
      commitError: err.athlete_id
        ? `${err.error} (athlete ${err.athlete_id})`
        : err.error,
    });
  }
  return next;
}
