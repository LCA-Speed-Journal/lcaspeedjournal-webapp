"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { BATTERY_TEMPLATES } from "@/lib/battery/template";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";

type BatteryDay = {
  day_key: string;
  label: string;
  session_date: string | null;
  session_id: string | null;
  sort_order: number;
};

type BatteryItem = {
  id: string;
  title: string;
  hugo_group: string;
  grouping_mode: string;
  cutoff_n: number | null;
  created_at: string;
  days: BatteryDay[];
};

type SessionItem = {
  id: string;
  session_date: string;
  phase: string;
  phase_week: number;
};

const cardClass =
  "rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

function sportLabel(hugoGroup: string): string {
  if (hugoGroup in HUGO_GROUP_META) {
    return HUGO_GROUP_META[hugoGroup as HugoGroup].label;
  }
  return hugoGroup;
}

function sessionLabel(session: SessionItem): string {
  const week = Number(session.phase_week) === 0 ? "" : ` week ${session.phase_week}`;
  return `${session.session_date} — ${session.phase}${week}`;
}

function CreateBatteryForm({ onCreated }: { onCreated: () => void }) {
  const [template, setTemplate] = useState<string>(BATTERY_TEMPLATES[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreatedId("");
    try {
      const body = await fetchJson<{ data?: { id?: string } }>("/api/battery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const id = body.data?.id ?? "";
      setCreatedId(id);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the battery");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm text-foreground">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Template
        </span>
        <select
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {BATTERY_TEMPLATES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create battery"}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {createdId ? (
        <p className="text-sm text-foreground-muted">
          Created.{" "}
          <Link href={`/battery/${createdId}`} className="text-accent hover:text-accent-hover">
            Open the board
          </Link>
        </p>
      ) : null}
    </form>
  );
}

function DayLink({
  batteryId,
  day,
  sessions,
  onLinked,
}: {
  batteryId: string;
  day: BatteryDay;
  sessions: SessionItem[];
  onLinked: () => void;
}) {
  const [sessionId, setSessionId] = useState(day.session_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = sessionId !== (day.session_id ?? "") && sessionId !== "";

  async function save() {
    setSaving(true);
    setError("");
    try {
      await fetchJson(`/api/battery/${encodeURIComponent(batteryId)}/days`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_key: day.day_key, session_id: sessionId }),
      });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">{day.label}</p>
        <p className="text-xs text-foreground-muted">{day.session_date ?? day.day_key}</p>
      </div>
      <select
        aria-label={`Session for ${day.label}`}
        value={sessionId}
        onChange={(event) => setSessionId(event.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
      >
        <option value="">Not linked</option>
        {day.session_id && !sessions.some((session) => session.id === day.session_id) ? (
          <option value={day.session_id}>Linked session</option>
        ) : null}
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {sessionLabel(session)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={!dirty || saving}
        className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:border-accent/50 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Link"}
      </button>
      {error ? <p className="text-sm text-danger sm:col-span-3">{error}</p> : null}
    </div>
  );
}

export function BatteryBrowser({ canCreate }: { canCreate: boolean }) {
  const batteries = useSWR<{ data: BatteryItem[] }>("/api/battery", (url: string) =>
    fetchJson<{ data: BatteryItem[] }>(url)
  );
  const sessions = useSWR<{ data: SessionItem[] }>(
    canCreate ? "/api/sessions" : null,
    (url: string) => fetchJson<{ data: SessionItem[] }>(url)
  );
  const list = batteries.data?.data ?? [];
  const sessionList = sessions.data?.data ?? [];

  return (
    <div className="relative z-10 flex min-h-screen flex-col pt-14 md:flex-row">
      <aside className="w-full shrink-0 border-b border-border/80 bg-surface/90 p-6 backdrop-blur-sm md:w-80 md:border-b-0 md:border-r lg:w-96">
        <div className="mb-2 inline-block h-1 w-12 rounded-full bg-accent" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Batteries</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          A battery is a multi-day meet. Open one for the gym board, or create the next sport from a template.
        </p>
        <section className="mt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
            New battery
          </p>
          {canCreate ? (
            <CreateBatteryForm onCreated={() => void batteries.mutate()} />
          ) : (
            <p className="text-sm text-foreground-muted">
              <Link href="/login?callbackUrl=/battery" className="text-accent hover:text-accent-hover">
                Log in
              </Link>{" "}
              to create a battery and link its days.
            </p>
          )}
        </section>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-8">
        {batteries.error ? (
          <div className={cardClass}>
            <p className="text-sm text-danger">{batteries.error.message}</p>
          </div>
        ) : batteries.isLoading ? (
          <p className="text-sm text-foreground-muted">Loading batteries…</p>
        ) : list.length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm text-foreground-muted">No batteries yet.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {list.map((battery) => (
              <li key={battery.id} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{battery.title}</h2>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {sportLabel(battery.hugo_group)}
                      {battery.grouping_mode === "cutoff" && battery.cutoff_n
                        ? ` · top ${battery.cutoff_n}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    href={`/battery/${battery.id}`}
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover"
                  >
                    Open board
                  </Link>
                </div>
                <div className="mt-4 space-y-3">
                  {battery.days.map((day) =>
                    canCreate ? (
                      <DayLink
                        key={day.day_key}
                        batteryId={battery.id}
                        day={day}
                        sessions={sessionList}
                        onLinked={() => void batteries.mutate()}
                      />
                    ) : (
                      <p key={day.day_key} className="text-sm text-foreground">
                        <span className="font-medium">{day.label}</span>
                        <span className="text-foreground-muted">
                          {" "}
                          · {day.session_date ?? "no date"} · {day.session_id ? "session linked" : "not linked"}
                        </span>
                      </p>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
