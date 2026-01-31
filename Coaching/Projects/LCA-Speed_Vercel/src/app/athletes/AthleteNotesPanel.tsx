"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Note = {
  id: string;
  athlete_id: string;
  note_text: string;
  created_by: string | null;
  created_at: string;
};

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
};

export function AthleteNotesPanel({
  athlete,
  onClose,
}: {
  athlete: Athlete;
  onClose: () => void;
}) {
  const { data, mutate } = useSWR<{ data: Note[] }>(
    athlete ? `/api/athletes/${athlete.id}/notes` : null,
    fetcher
  );
  const retryAddNote = () => noteText.trim() && void handleAddNote({ preventDefault: () => {} } as React.FormEvent);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const notes = data?.data ?? [];

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athlete.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_text: noteText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to add note");
        return;
      }
      setNoteText("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(s: string) {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      onClick={onClose}
      aria-modal="true"
      aria-labelledby="notes-panel-title"
    >
      <div
        className="flex w-full max-w-md flex-col bg-surface shadow-xl border-l border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="notes-panel-title" className="text-lg font-semibold text-foreground">
            Notes — {athlete.first_name} {athlete.last_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-foreground hover:bg-surface-elevated"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <form onSubmit={handleAddNote} className="mb-4">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a coach note…"
              rows={3}
              className="mb-2 w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent"
              required
            />
            {error && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm text-danger">{error}</p>
                <button
                  type="button"
                  onClick={retryAddNote}
                  disabled={loading || !noteText.trim()}
                  className="rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface-elevated disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-accent px-3 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add note"}
            </button>
          </form>

          <h3 className="mb-2 text-sm font-medium text-foreground-muted">
            Notes
          </h3>
          {notes.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No notes yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
                  style={{ contentVisibility: "auto" }}
                >
                  <p className="whitespace-pre-wrap">{n.note_text}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {formatDate(n.created_at)}
                    {n.created_by ? ` · ${n.created_by}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
