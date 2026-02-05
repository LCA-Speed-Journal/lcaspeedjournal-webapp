"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { EventGroup } from "@/types";
import type { SuperpowerPreset, KryptonitePreset } from "@/types";
import { PresetList } from "@/app/athletes/ManagePresetsDialog";
import { ThemeToggle } from "@/app/components/ThemeToggle";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SettingsClient() {
  const [eventGroupError, setEventGroupError] = useState("");
  const [presetError, setPresetError] = useState("");
  const [loading, setLoading] = useState(false);

  // Event groups
  const { data: eventGroupsData, mutate: mutateEventGroups } = useSWR<{
    data: EventGroup[];
  }>("/api/event-groups", fetcher);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const groups = eventGroupsData?.data ?? [];

  async function handleCreateEventGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setEventGroupError("");
    setLoading(true);
    try {
      const res = await fetch("/api/event-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), display_order: groups.length }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEventGroupError(json.error ?? "Failed to create event group");
        return;
      }
      setNewName("");
      mutateEventGroups();
    } catch {
      setEventGroupError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateEventGroup(id: string) {
    if (!editName.trim()) return;
    setEventGroupError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/event-groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEventGroupError(json.error ?? "Failed to update event group");
        return;
      }
      setEditingId(null);
      setEditName("");
      mutateEventGroups();
    } catch {
      setEventGroupError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteEventGroup(id: string) {
    setEventGroupError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/event-groups/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setEventGroupError(json.error ?? "Failed to delete event group");
        return;
      }
      setEditingId(null);
      mutateEventGroups();
    } catch {
      setEventGroupError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // Presets (reuse PresetList from ManagePresetsDialog)
  const { data: superData, mutate: mutateSuper } = useSWR<{ data: SuperpowerPreset[] }>(
    "/api/superpower-presets",
    fetcher
  );
  const { data: kryptoData, mutate: mutateKrypto } = useSWR<{ data: KryptonitePreset[] }>(
    "/api/kryptonite-presets",
    fetcher
  );
  const superPresets = superData?.data ?? [];
  const kryptoPresets = kryptoData?.data ?? [];

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-6 py-8 md:px-8 md:py-10">
      <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Settings
            </h1>
            <p className="mt-2 text-sm text-foreground-muted">
              Manage event groups and preset lists for superpowers and kryptonite.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/athletes"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Manage athletes
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </div>
        </header>

        <div className="space-y-8">
          {/* Theme */}
          <section className="rounded-xl border border-border bg-surface-elevated p-4">
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              Theme
            </h2>
            <p className="mb-4 text-sm text-foreground-muted">
              Choose light, dark, or follow your system. Preference is not saved (resets on refresh).
            </p>
            <ThemeToggle />
          </section>

          {/* Event groups */}
          <section className="rounded-xl border border-border bg-surface-elevated p-4">
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              Event groups
            </h2>
            <p className="mb-4 text-sm text-foreground-muted">
              Add or edit event groups (e.g. Sprints, Horizontal Jumps). Assign groups to athletes from the Manage athletes page.
            </p>
            <form onSubmit={handleCreateEventGroup} className="mb-4 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New group name (e.g. Sprints)"
                className="min-h-[40px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !newName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent-hover disabled:opacity-50"
              >
                Add
              </button>
            </form>
            {eventGroupError && (
              <p className="mb-4 text-sm text-danger" role="alert">
                {eventGroupError}
              </p>
            )}
            <ul className="space-y-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  {editingId === g.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-h-[36px] flex-1 rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateEventGroup(g.id)}
                        disabled={loading || !editName.trim()}
                        className="rounded border border-accent bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                        className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-foreground">
                        {g.name}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(g.id);
                            setEditName(g.name);
                          }}
                          disabled={loading}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEventGroup(g.id)}
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
          </section>

          {/* Superpower presets */}
          <section className="rounded-xl border border-border bg-surface-elevated p-4">
            <PresetList
              title="Superpowers"
              apiBase="superpower-presets"
              presets={superPresets}
              mutate={mutateSuper}
              loading={loading}
              setError={setPresetError}
            />
            {presetError && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {presetError}
              </p>
            )}
          </section>

          {/* Kryptonite presets */}
          <section className="rounded-xl border border-border bg-surface-elevated p-4">
            <PresetList
              title="Kryptonite"
              apiBase="kryptonite-presets"
              presets={kryptoPresets}
              mutate={mutateKrypto}
              loading={loading}
              setError={setPresetError}
            />
            {presetError && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {presetError}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
