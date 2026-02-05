"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Item = {
  id: string;
  label: string;
  detail?: string | null;
  preset_id?: string | null;
  custom_text?: string | null;
};

type SuperpowersKryptoniteSectionProps = {
  athleteId: string;
  kind: "superpowers" | "kryptonite";
  title: string;
  presetApi: string;
  itemApi: string;
};

export function SuperpowersKryptoniteSection({
  athleteId,
  kind,
  title,
  presetApi,
  itemApi,
}: SuperpowersKryptoniteSectionProps) {
  const { data: presetsData } = useSWR<{ data: { id: string; label: string }[] }>(
    presetApi,
    fetcher
  );
  const { data: itemsData, mutate } = useSWR<{ data: Item[] }>(
    `${itemApi}/${athleteId}/${kind}`,
    fetcher
  );

  const [mode, setMode] = useState<"preset" | "custom" | null>(null);
  const [presetId, setPresetId] = useState("");
  const [customText, setCustomText] = useState("");
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const presets = presetsData?.data ?? [];
  const items = itemsData?.data ?? [];

  async function handleAddPreset() {
    if (!presetId) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${itemApi}/${athleteId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset_id: presetId,
          detail: detail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to add ${title.toLowerCase()}`);
        return;
      }
      setMode(null);
      setPresetId("");
      setDetail("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customText.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${itemApi}/${athleteId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_text: customText.trim(),
          detail: detail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to add ${title.toLowerCase()}`);
        return;
      }
      setMode(null);
      setCustomText("");
      setDetail("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${itemApi}/${athleteId}/${kind}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to remove ${title.toLowerCase()}`);
        return;
      }
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        {title}
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              {item.detail && (
                <p className="text-xs text-foreground-muted">{item.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleRemove(item.id)}
              disabled={loading}
              className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {mode === "preset" ? (
        <div className="mt-4 space-y-2 rounded border border-border bg-surface p-3">
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            <option value="">Select preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Detail (optional)"
            className="w-full min-h-[32px] rounded border border-border bg-surface-elevated px-2 py-1 text-xs placeholder:text-foreground-muted focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddPreset}
              disabled={loading || !presetId}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setMode(null); setPresetId(""); setDetail(""); }}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-elevated"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === "custom" ? (
        <form onSubmit={handleAddCustom} className="mt-4 space-y-2 rounded border border-border bg-surface p-3">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Custom text"
            className="w-full min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
            required
          />
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Detail (optional)"
            className="w-full min-h-[32px] rounded border border-border bg-surface-elevated px-2 py-1 text-xs placeholder:text-foreground-muted focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !customText.trim()}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setMode(null); setCustomText(""); setDetail(""); }}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-elevated"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("preset")}
            disabled={loading}
            className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-foreground-muted hover:border-accent/50 hover:text-accent disabled:opacity-50"
          >
            + From preset
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            disabled={loading}
            className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-foreground-muted hover:border-accent/50 hover:text-accent disabled:opacity-50"
          >
            + Custom
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
