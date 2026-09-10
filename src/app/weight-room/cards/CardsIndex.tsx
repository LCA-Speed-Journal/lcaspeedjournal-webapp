"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import {
  HUGO_GROUP_META,
  HUGO_GROUPS,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import { filterTemplatesByActivity } from "@/lib/weight-room/template-list";
import type { WorkoutTemplate } from "@/types/weight-room";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type ImportError = { row?: number; message: string };

function groupLabel(group: string): string {
  if (group in HUGO_GROUP_META) {
    return HUGO_GROUP_META[group as HugoGroup].label;
  }
  return group;
}

function errorText(json: { error?: string }, fallback: string): string {
  return json.error ?? fallback;
}

export function CardsIndex() {
  const { data, error, isLoading, mutate } = useSWR<{
    data: (WorkoutTemplate & { movement_count?: number })[];
  }>("/api/weight-room/templates", fetcher);

  const templates = data?.data ?? [];
  const [activityFilter, setActivityFilter] = useState<HugoGroup | "">("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const visibleTemplates = filterTemplatesByActivity(
    templates,
    activityFilter
  );
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvErrors, setCsvErrors] = useState<ImportError[]>([]);
  const [termStart, setTermStart] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedError, setSeedError] = useState("");

  async function onCsvFile(file: File | undefined) {
    if (!file) return;
    setCsvBusy(true);
    setCsvMessage("");
    setCsvError("");
    setCsvErrors([]);
    try {
      const csv = await file.text();
      const res = await fetch("/api/weight-room/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { templates?: unknown[]; errors?: ImportError[] };
      };
      if (!res.ok) {
        setCsvError(errorText(json, "CSV import failed"));
        return;
      }
      const imported = json.data?.templates?.length ?? 0;
      const errors = json.data?.errors ?? [];
      setCsvErrors(errors);
      setCsvMessage(
        imported > 0
          ? `Imported ${imported} template${imported === 1 ? "" : "s"}`
          : "No templates imported"
      );
      await mutate();
    } catch {
      setCsvError("Network error — try again");
    } finally {
      setCsvBusy(false);
    }
  }

  async function onSeedExtra(e: React.FormEvent) {
    e.preventDefault();
    setSeedBusy(true);
    setSeedMessage("");
    setSeedError("");
    try {
      const res = await fetch("/api/weight-room/templates/seed-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term_start: termStart }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { inserted?: number; skipped?: number };
      };
      if (!res.ok) {
        setSeedError(errorText(json, "Seed failed"));
        return;
      }
      const inserted = json.data?.inserted ?? 0;
      const skipped = json.data?.skipped ?? 0;
      setSeedMessage(`Inserted ${inserted}, skipped ${skipped}`);
      await mutate();
    } catch {
      setSeedError("Network error — try again");
    } finally {
      setSeedBusy(false);
    }
  }

  async function onDeleteTemplate(id: string) {
    setDeleteBusyId(id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/weight-room/templates/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(errorText(json, "Delete failed"));
        setDeleteConfirmId(null);
        return;
      }
      setDeleteConfirmId(null);
      await mutate();
    } catch {
      setDeleteError("Network error — try again");
      setDeleteConfirmId(null);
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">
          Cards / templates
        </h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Import a CSV, seed the extra term, then open a card to edit and print a
          stack of landscape blanks.
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
            Import CSV
          </h2>
          <label className="mt-3 block text-sm text-foreground">
            Workout CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={csvBusy}
              className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onCsvFile(file);
              }}
            />
          </label>
          {csvBusy ? (
            <p className="mt-2 text-sm text-foreground-muted">Importing…</p>
          ) : null}
          {csvMessage ? (
            <p className="mt-2 text-sm text-foreground">{csvMessage}</p>
          ) : null}
          {csvError ? (
            <p className="mt-2 text-sm text-danger">{csvError}</p>
          ) : null}
          {csvErrors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-danger">
              {csvErrors.map((err, i) => (
                <li key={`${err.row ?? "x"}-${err.message}-${i}`}>
                  {err.row != null ? `Row ${err.row}: ` : ""}
                  {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Seed extra term
          </h2>
          <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={onSeedExtra}>
            <label className="text-sm text-foreground">
              Term start (Monday)
              <input
                type="date"
                required
                value={termStart}
                onChange={(e) => setTermStart(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={seedBusy}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {seedBusy ? "Seeding…" : "Seed extra"}
            </button>
          </form>
          {seedMessage ? (
            <p className="mt-2 text-sm text-foreground">{seedMessage}</p>
          ) : null}
          {seedError ? (
            <p className="mt-2 text-sm text-danger">{seedError}</p>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Templates
          </h2>
          <label className="mt-3 block text-sm text-foreground">
            Activity
            <select
              value={activityFilter}
              onChange={(e) => {
                setActivityFilter(e.target.value as HugoGroup | "");
                setDeleteConfirmId(null);
              }}
              className="mt-1 block w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
            >
              <option value="">All activities</option>
              {HUGO_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {HUGO_GROUP_META[g].label}
                </option>
              ))}
            </select>
          </label>
          {deleteError ? (
            <p className="mt-3 text-sm text-danger">{deleteError}</p>
          ) : null}
          {isLoading ? (
            <p className="mt-3 text-sm text-foreground-muted">Loading…</p>
          ) : error ? (
            <p className="mt-3 text-sm text-danger">Failed to load templates</p>
          ) : templates.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted">
              No templates yet. Import a CSV or seed the extra term.
            </p>
          ) : visibleTemplates.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted">
              No templates for{" "}
              {activityFilter
                ? HUGO_GROUP_META[activityFilter].label
                : "this filter"}
              .
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {visibleTemplates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-stretch gap-2 rounded-xl border border-border bg-surface-elevated"
                >
                  <Link
                    href={`/weight-room/cards/${t.id}`}
                    className="min-w-0 flex-1 px-4 py-3 hover:text-accent"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {t.title}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {t.session_date} · {groupLabel(t.hugo_group)}
                      {t.movement_count != null
                        ? ` · ${t.movement_count} movements`
                        : ""}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2 px-3">
                    {deleteConfirmId === t.id ? (
                      <>
                        <span className="text-xs text-gold">Delete?</span>
                        <button
                          type="button"
                          onClick={() => void onDeleteTemplate(t.id)}
                          disabled={deleteBusyId === t.id}
                          className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim disabled:opacity-50"
                        >
                          {deleteBusyId === t.id ? "…" : "Yes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          disabled={deleteBusyId === t.id}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError("");
                          setDeleteConfirmId(t.id);
                        }}
                        className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
