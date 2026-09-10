"use client";

import { useMemo, useState } from "react";
import { CardPrintView } from "../components/CardPrintView";
import type { PreviewItem } from "@/lib/weight-room/preview-items";

export function PreviewGallery({ items }: { items: PreviewItem[] }) {
  const [id, setId] = useState(items[0]?.id ?? "");
  const selected = useMemo(
    () => items.find((item) => item.id === id) ?? items[0],
    [id, items]
  );

  if (!selected) {
    return <p>No preview cards loaded.</p>;
  }

  const { fit } = selected;
  const fitLabel = fit.fits ? "Fits one landscape letter page" : "Overflows one page";
  const scanLabel = fit.scanSafe
    ? "Scan-safe (fits at or above minimum row heights; set columns within budget)"
    : "Not scan-safe — crowding or too many set columns";

  return (
    <div className="min-h-screen bg-zinc-200 text-zinc-900">
      <div className="wr-preview-chrome mx-auto max-w-5xl px-4 py-4 print:hidden">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Checkpoint A · Printable blanks
        </p>
        <h1 className="mt-1 text-2xl font-bold">Workout card preview</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Extra sheets are mapped from the 10-week JSON. The soccer card is a sample
          in-season template. Density rows probe how many exercises still fit and
          stay readable for later scanning. Print this page (landscape letter) to
          check ink, handwriting space, and the sticker pad.
        </p>

        <label className="mt-4 block text-sm font-medium">
          Sheet
          <select
            className="mt-1 w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm"
            value={selected.id}
            onChange={(e) => setId(e.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-2 text-sm text-zinc-600">{selected.hint}</p>

        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            fit.fits && fit.scanSafe
              ? "border-emerald-300 bg-emerald-50"
              : fit.fits
                ? "border-amber-300 bg-amber-50"
                : "border-red-300 bg-red-50"
          }`}
        >
          <p>
            {fit.movementCount} movements · {fit.maxSets} set columns · estimated{" "}
            {fit.estimatedHeightIn.toFixed(2)}in / {fit.pageBodyIn}in
          </p>
          <p className="font-medium">{fitLabel}</p>
          <p>{scanLabel}</p>
          {fit.warnings.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {fit.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => window.print()}
        >
          Print this sheet
        </button>
      </div>

      <div className="wr-print-root overflow-x-auto bg-zinc-300 py-4 print:bg-white print:py-0">
        <CardPrintView draft={selected.draft} />
      </div>
    </div>
  );
}
