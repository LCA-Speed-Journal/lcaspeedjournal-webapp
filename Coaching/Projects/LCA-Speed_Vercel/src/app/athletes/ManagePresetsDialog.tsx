"use client";

import { useState } from "react";
import useSWR from "swr";
import type { SuperpowerPreset, KryptonitePreset } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PresetRow = { id: string; label: string; display_order: number };

export function PresetList({
  title,
  apiBase,
  presets,
  mutate,
  loading,
  setError,
}: {
  title: string;
  apiBase: "superpower-presets" | "kryptonite-presets";
  presets: PresetRow[];
  mutate: () => void;
  loading: boolean;
  setError: (s: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError("");
    try {
      const res = await fetch(`/api/${apiBase}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), display_order: presets.length }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to create ${title.toLowerCase()}`);
        return;
      }
      setNewLabel("");
      mutate();
    } catch {
      setError("Network error");
    }
  }

  async function handleUpdate(id: string) {
    if (!editLabel.trim()) return;
    setError("");
    try {
      const res = await fetch(`/api/${apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to update ${title.toLowerCase()}`);
        return;
      }
      setEditingId(null);
      setEditLabel("");
      mutate();
    } catch {
      setError("Network error");
    }
  }

  async function handleDelete(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/${apiBase}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to delete ${title.toLowerCase()}`);
        return;
      }
      setEditingId(null);
      mutate();
    } catch {
      setError("Network error");
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={`New ${title.toLowerCase()}...`}
          className="min-h-[36px] flex-1 rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !newLabel.trim()}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {presets.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded border border-border bg-surface-elevated px-2 py-1.5"
          >
            {editingId === p.id ? (
              <>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="min-h-[32px] flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleUpdate(p.id)}
                  disabled={loading || !editLabel.trim()}
                  className="rounded border border-accent bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditLabel(""); }}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-foreground">{p.label}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => { setEditingId(p.id); setEditLabel(p.label); }}
                    disabled={loading}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={loading}
                    className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManagePresetsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: superData, mutate: mutateSuper } = useSWR<{ data: SuperpowerPreset[] }>(
    open ? "/api/superpower-presets" : null,
    fetcher
  );
  const { data: kryptoData, mutate: mutateKrypto } = useSWR<{ data: KryptonitePreset[] }>(
    open ? "/api/kryptonite-presets" : null,
    fetcher
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const superPresets = superData?.data ?? [];
  const kryptoPresets = kryptoData?.data ?? [];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-presets-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border-2 border-border/80 bg-surface/95 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="manage-presets-title" className="text-xl font-bold text-foreground">
            Manage Presets
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="flex flex-col gap-8">
          <PresetList
            title="Superpowers"
            apiBase="superpower-presets"
            presets={superPresets}
            mutate={mutateSuper}
            loading={loading}
            setError={setError}
          />
          <PresetList
            title="Kryptonite"
            apiBase="kryptonite-presets"
            presets={kryptoPresets}
            mutate={mutateKrypto}
            loading={loading}
            setError={setError}
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
