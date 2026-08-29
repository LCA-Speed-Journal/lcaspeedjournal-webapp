"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { CardPrintView } from "@/app/weight-room/components/CardPrintView";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { analyzeCardFit } from "@/lib/weight-room/layout-estimate";
import { encodeTemplatePayload } from "@/lib/weight-room/qr-payload";
import type { CardDraft, CardMovement } from "@/lib/weight-room/types";
import type { WorkoutMovement, WorkoutTemplate } from "@/types/weight-room";

type TemplateDetail = WorkoutTemplate & { movements: WorkoutMovement[] };

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type MovementForm = {
  key: string;
  label: string;
  name: string;
  block: string;
  set_count: string;
  targets: string;
  notes: string;
  from_pair: boolean;
};

const inputClass =
  "w-full rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground";

function parseSetCount(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function splitTargets(raw: string, setCount: number): string[] {
  if (setCount <= 0) return [];
  const parts = raw.split("|").map((s) => s.trim());
  return Array.from({ length: setCount }, (_, i) => parts[i] ?? "");
}

function movementsFromTemplate(template: TemplateDetail): MovementForm[] {
  return template.movements.map((m, i) => ({
    key: m.id || `row-${i}`,
    label: m.label ?? "",
    name: m.name,
    block: m.block,
    set_count: String(m.set_count),
    targets: m.targets.join("|"),
    notes: m.notes ?? "",
    from_pair: m.from_pair,
  }));
}

function formToDraft(
  template: TemplateDetail,
  sessionDate: string,
  focus: string,
  title: string,
  movements: MovementForm[]
): CardDraft {
  return {
    hugoGroup: isHugoGroup(template.hugo_group)
      ? template.hugo_group
      : "extracurricular",
    weekNumber: template.week_number,
    dayName: template.day_name ?? "",
    sessionDate,
    focus,
    title,
    movements: movements.map(
      (m): CardMovement => ({
        label: m.label,
        name: m.name,
        block: m.block,
        setCount: parseSetCount(m.set_count),
        targets: splitTargets(m.targets, parseSetCount(m.set_count)),
        notes: m.notes,
        fromPair: m.from_pair,
        exerciseHtml: null,
      })
    ),
  };
}

function newMovement(): MovementForm {
  return {
    key:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `new-${Date.now()}`,
    label: "",
    name: "",
    block: "Main",
    set_count: "3",
    targets: "",
    notes: "",
    from_pair: false,
  };
}

export function CardEditor({ templateId }: { templateId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{
    data: TemplateDetail;
  }>(`/api/weight-room/templates/${templateId}`, fetcher);

  const template = data?.data;
  const [sessionDate, setSessionDate] = useState("");
  const [focus, setFocus] = useState("");
  const [title, setTitle] = useState("");
  const [movements, setMovements] = useState<MovementForm[]>([]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState(12);
  const [qrUrl, setQrUrl] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!template || hydratedId === template.id) return;
    setSessionDate(template.session_date);
    setFocus(template.focus);
    setTitle(template.title);
    setMovements(movementsFromTemplate(template));
    setHydratedId(template.id);
  }, [template, hydratedId]);

  useEffect(() => {
    if (!template?.id) return;
    let cancelled = false;
    void QRCode.toDataURL(encodeTemplatePayload(template.id), {
      color: { dark: "#000", light: "#fff" },
    }).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [template?.id]);

  const draft = useMemo(() => {
    if (!template) return null;
    return formToDraft(template, sessionDate, focus, title, movements);
  }, [template, sessionDate, focus, title, movements]);

  const fit = draft ? analyzeCardFit(draft) : null;
  const canPrint = Boolean(fit?.scanSafe && qrUrl);
  const printCopies = Math.min(50, Math.max(1, Number.isFinite(copyCount) ? copyCount : 12));

  function updateMovement(key: string, patch: Partial<MovementForm>) {
    setMovements((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  async function onSave() {
    setSaveBusy(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const res = await fetch(`/api/weight-room/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: sessionDate,
          focus,
          title,
          movements: movements.map((m, i) => {
            const setCount = parseSetCount(m.set_count);
            return {
              sort_index: i,
              label: m.label,
              name: m.name,
              block: m.block,
              set_count: setCount,
              targets: splitTargets(m.targets, setCount),
              notes: m.notes,
              from_pair: m.from_pair,
            };
          }),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: TemplateDetail;
      };
      if (!res.ok) {
        setSaveError(json.error ?? "Save failed");
        return;
      }
      setSaveMessage("Saved");
      await mutate();
    } catch {
      setSaveError("Network error — try again");
    } finally {
      setSaveBusy(false);
    }
  }

  function onPrint() {
    if (!canPrint) return;
    window.print();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 print:overflow-visible print:bg-white print:px-0 print:py-0">
      <div className="print:hidden">
        <PageBackground />
      </div>
      <main className="relative z-10 mx-auto max-w-5xl">
        <div className="print:hidden">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Weight room
          </p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Card editor</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/weight-room/cards"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
            >
              All cards
            </Link>
          </div>

          {isLoading ? (
            <p className="mt-6 text-sm text-foreground-muted">Loading…</p>
          ) : error || !template ? (
            <p className="mt-6 text-sm text-danger">
              Template not found or failed to load.
            </p>
          ) : (
            <>
            <fieldset disabled={saveBusy} className="m-0 min-w-0 border-0 p-0">
              <section className="mt-6 grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-foreground">
                  Date
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm text-foreground">
                  Focus
                  <input
                    type="text"
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm text-foreground sm:col-span-3">
                  Title
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </section>

              <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface-elevated">
                <table className="min-w-[640px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-foreground-muted">
                      <th className="px-2 py-2">Label</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Block</th>
                      <th className="px-2 py-2">Sets</th>
                      <th className="px-2 py-2">Targets (|)</th>
                      <th className="px-2 py-2">Notes</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.key} className="border-b border-border">
                        <td className="px-2 py-1.5">
                          <input
                            value={m.label}
                            onChange={(e) =>
                              updateMovement(m.key, { label: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={m.name}
                            onChange={(e) =>
                              updateMovement(m.key, { name: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={m.block}
                            onChange={(e) =>
                              updateMovement(m.key, { block: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="w-16 px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={m.set_count}
                            onChange={(e) =>
                              updateMovement(m.key, {
                                set_count: e.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={m.targets}
                            onChange={(e) =>
                              updateMovement(m.key, { targets: e.target.value })
                            }
                            className={inputClass}
                            placeholder="5 @ RPE 8|5 @ RPE 8"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={m.notes}
                            onChange={(e) =>
                              updateMovement(m.key, { notes: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setMovements((rows) =>
                                rows.filter((row) => row.key !== m.key)
                              )
                            }
                            className="text-xs text-danger hover:opacity-80"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => setMovements((rows) => [...rows, newMovement()])}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
                  >
                    Add movement
                  </button>
                </div>
              </section>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saveBusy}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  {saveBusy ? "Saving…" : "Save"}
                </button>
                {saveMessage ? (
                  <p className="text-sm text-success">{saveMessage}</p>
                ) : null}
                {saveError ? (
                  <p className="text-sm text-danger">{saveError}</p>
                ) : null}
              </div>
            </fieldset>

              {fit ? (
                <div
                  className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                    fit.scanSafe
                      ? "border-success/40 bg-success-dim text-foreground"
                      : fit.fits
                        ? "border-gold/40 bg-surface-elevated text-foreground"
                        : "border-danger/50 bg-danger-dim text-foreground"
                  }`}
                >
                  <p>
                    {fit.movementCount} movements · {fit.maxSets} set columns ·
                    estimated {fit.estimatedHeightIn.toFixed(2)}in /{" "}
                    {fit.pageBodyIn}in
                  </p>
                  <p className="font-medium">
                    {fit.fits
                      ? "Fits one landscape letter page"
                      : "Overflows one page"}
                  </p>
                  <p>
                    {fit.scanSafe
                      ? "Scan-safe (row count and set columns within budget)"
                      : "Not scan-safe — crowding or too many set columns"}
                  </p>
                  {fit.warnings.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5">
                      {fit.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <section className="mt-6 rounded-xl border border-border bg-surface-elevated p-4">
                <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
                  Print stack
                </h2>
                <p className="mt-2 text-sm text-foreground-muted">
                  Prints one landscape page per copy using the signed-off sheet.
                </p>
                <label className="mt-3 block text-sm text-foreground">
                  Copies
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={copyCount}
                    onChange={(e) =>
                      setCopyCount(Number.parseInt(e.target.value, 10) || 1)
                    }
                    className={`mt-1 max-w-[8rem] ${inputClass}`}
                  />
                </label>
                {canPrint ? (
                  <button
                    type="button"
                    onClick={onPrint}
                    className="mt-3 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:border-accent/50"
                  >
                    Print {printCopies} {printCopies === 1 ? "copy" : "copies"}
                  </button>
                ) : (
                  <p className="mt-3 text-sm text-danger">
                    Print is blocked until this card is scan-safe (12 movements
                    / 6 set columns max).
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {draft && canPrint ? (
        <div className="wr-print-stack wr-print-root">
          {Array.from({ length: printCopies }, (_, i) => (
            <div key={i} className="wr-print-copy">
              <CardPrintView draft={draft} templateQrUrl={qrUrl || undefined} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
