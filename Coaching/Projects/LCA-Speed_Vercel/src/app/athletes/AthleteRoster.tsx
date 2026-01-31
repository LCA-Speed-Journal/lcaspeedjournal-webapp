"use client";

import { useState } from "react";
import useSWR from "swr";
import { AthleteNotesPanel } from "./AthleteNotesPanel";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  graduating_class: number | null;
  athlete_type?: string;
  created_at: string;
};

function formatAthleteLabel(a: Athlete): string {
  const t = a.athlete_type ?? "athlete";
  if (t === "staff") return "Staff";
  if (t === "alumni") return "Alumni";
  return String(a.graduating_class ?? "");
}

export function AthleteRoster() {
  const { data, mutate } = useSWR<{ data: Athlete[] }>("/api/athletes", fetcher);
  const retryRoster = () => void mutate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const athletes = data?.data ?? [];

  async function handleUpdate(
    id: string,
    updates: {
      first_name: string;
      last_name: string;
      gender: string;
      graduating_class: number | null;
      athlete_type: string;
    }
  ) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to update athlete");
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

  async function handleDelete(id: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to delete athlete");
        return;
      }
      setDeleteConfirmId(null);
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (athletes.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No athletes yet. Add one above.
      </p>
    );
  }

  const notesAthlete = notesOpenId
    ? athletes.find((a) => a.id === notesOpenId)
    : null;

  return (
    <div className="space-y-2">
      {notesAthlete && (
        <AthleteNotesPanel
          athlete={notesAthlete}
          onClose={() => setNotesOpenId(null)}
        />
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => { setError(""); retryRoster(); }}
            disabled={loading}
            className="rounded border border-zinc-400 px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {athletes.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded border px-3 py-2 text-sm"
          >
            {editingId === a.id ? (
              <AthleteEditForm
                athlete={a}
                onSave={(updates) => handleUpdate(a.id, updates)}
                onCancel={() => setEditingId(null)}
                disabled={loading}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.first_name} {a.last_name} — {a.gender} ({formatAthleteLabel(a)})
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNotesOpenId(a.id)}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-elevated"
                  >
                    Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(a.id)}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-elevated"
                  >
                    Edit
                  </button>
                  {deleteConfirmId === a.id ? (
                    <>
                      <span className="text-xs text-gold">Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={loading}
                        className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-elevated"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(a.id)}
                      className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-dim"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AthleteType = "athlete" | "staff" | "alumni";

function AthleteEditForm({
  athlete,
  onSave,
  onCancel,
  disabled,
}: {
  athlete: Athlete;
  onSave: (u: {
    first_name: string;
    last_name: string;
    gender: string;
    graduating_class: number | null;
    athlete_type: string;
  }) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [firstName, setFirstName] = useState(athlete.first_name);
  const [lastName, setLastName] = useState(athlete.last_name);
  const [gender, setGender] = useState(athlete.gender);
  const [athleteType, setAthleteType] = useState<AthleteType>(
    (athlete.athlete_type as AthleteType) ?? "athlete"
  );
  const [graduatingClass, setGraduatingClass] = useState(
    athlete.graduating_class ?? new Date().getFullYear() + 2
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      gender,
      graduating_class: athleteType === "athlete" ? graduatingClass : null,
      athlete_type: athleteType,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
      <input
        type="text"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        className="min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent"
        required
      />
      <input
        type="text"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Last name"
        className="min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent"
        required
      />
      <select
        value={athleteType}
        onChange={(e) => setAthleteType(e.target.value as AthleteType)}
        className="min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground focus:border-accent"
      >
        <option value="athlete">Athlete</option>
        <option value="staff">Staff</option>
        <option value="alumni">Alumni</option>
      </select>
      <select
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        className="min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground focus:border-accent"
      >
        <option value="M">M</option>
        <option value="F">F</option>
      </select>
      {athleteType === "athlete" && (
        <input
          type="number"
          min={2024}
          max={2032}
          value={graduatingClass}
          onChange={(e) => setGraduatingClass(Number(e.target.value))}
          className="min-h-[36px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground col-span-2 focus:border-accent"
          required
        />
      )}
      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={disabled}
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-3 py-1 text-sm text-foreground hover:bg-surface-elevated"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
