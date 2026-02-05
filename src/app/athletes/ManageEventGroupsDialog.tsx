"use client";

import { useState } from "react";
import useSWR from "swr";
import type { EventGroup } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ManageEventGroupsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, mutate } = useSWR<{ data: EventGroup[] }>(
    open ? "/api/event-groups" : null,
    fetcher
  );
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const groups = data?.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/event-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), display_order: groups.length }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create event group");
        return;
      }
      setNewName("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/event-groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to update event group");
        return;
      }
      setEditingId(null);
      setEditName("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/event-groups/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to delete event group");
        return;
      }
      setEditingId(null);
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-event-groups-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border-2 border-border/80 bg-surface/95 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="manage-event-groups-title" className="text-xl font-bold text-foreground">
            Manage Event Groups
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

        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name (e.g. Sprints)"
            className="min-h-[40px] flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !newName.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && (
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <ul className="space-y-2">
          {groups.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2"
            >
              {editingId === g.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="min-h-[36px] flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(g.id)}
                    disabled={loading || !editName.trim()}
                    className="rounded border border-accent bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setEditName(""); }}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-foreground">{g.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                      disabled={loading}
                      className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
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

        {groups.length === 0 && !loading && (
          <p className="py-4 text-center text-sm text-foreground-muted">
            No event groups yet. Add one above.
          </p>
        )}
      </div>
    </div>
  );
}
