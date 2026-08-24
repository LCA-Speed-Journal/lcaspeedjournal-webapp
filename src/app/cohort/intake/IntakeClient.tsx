"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import type { DerivedSignup } from "@/lib/cohort";

type IntakePayload = {
  title: string;
  capacity: number;
  claimed: number;
  remaining: number;
  in_cohort: DerivedSignup[];
  waitlist: DerivedSignup[];
  signups: DerivedSignup[];
};

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

async function refreshCohort() {
  await Promise.all([globalMutate("/api/cohort/signups"), globalMutate("/api/cohort")]);
}

function SignupRow({
  row,
  onNamed,
  onDelete,
}: {
  row: DerivedSignup;
  onNamed: (id: string, name: string) => void;
  onDelete: (id: string, name: string | null) => void;
}) {
  const [name, setName] = useState("");
  const unnamed = !row.display_name;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">
            {row.display_name ?? "Unnamed spot"}
          </p>
          {row.grade || row.email ? (
            <p className="text-sm text-foreground-muted">
              {[row.grade, row.email].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {row.waitlist_position != null ? (
            <p className="text-xs text-foreground-muted">Waitlist #{row.waitlist_position}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="text-sm text-danger"
          onClick={() => onDelete(row.id, row.display_name)}
        >
          Remove
        </button>
      </div>
      {unnamed ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onNamed(row.id, name.trim());
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add name"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground"
          />
          <button type="submit" className="rounded bg-accent px-3 py-1 text-sm font-medium text-background">
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}

export function IntakeClient() {
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState("");
  const [email, setEmail] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, error: loadError, isLoading } = useSWR<{ data: IntakePayload }>(
    "/api/cohort/signups",
    fetcher
  );
  const payload = data?.data;

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/cohort/intake";
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Request failed");
        return;
      }
      await refreshCohort();
    } catch {
      setError("Network error — retry");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/cohort/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          grade: showMore ? grade : undefined,
          email: showMore ? email : undefined,
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/cohort/intake";
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Request failed");
        return;
      }
      setDisplayName("");
      setGrade("");
      setEmail("");
      await refreshCohort();
    } catch {
      setError("Network error — retry");
    } finally {
      setBusy(false);
    }
  }

  function handlePlus() {
    void run(() =>
      fetch("/api/cohort/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unnamed: true }),
      })
    );
  }

  function handleMinus() {
    const last = payload?.signups[payload.signups.length - 1];
    if (!last) return;
    if (last.display_name && !window.confirm(`Remove ${last.display_name}?`)) return;
    void run(() => fetch(`/api/cohort/signups/${last.id}`, { method: "DELETE" }));
  }

  function handleNamed(id: string, name: string) {
    void run(() =>
      fetch(`/api/cohort/signups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
      })
    );
  }

  function handleDelete(id: string, name: string | null) {
    if (name && !window.confirm(`Remove ${name}?`)) return;
    void run(() => fetch(`/api/cohort/signups/${id}`, { method: "DELETE" }));
  }

  function bumpCapacity(next: number) {
    if (next < 1) return;
    void run(() =>
      fetch("/api/cohort", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: next }),
      })
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 md:px-8">
      <PageBackground />
      <div className="relative z-10 mx-auto flex max-w-lg flex-col gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Coach intake
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {payload?.title ?? "Fall Strength & Conditioning"}
          </h1>
          <p className="mt-2 text-4xl font-bold text-accent">
            {payload ? payload.remaining : "—"}{" "}
            <span className="text-lg font-medium text-foreground-muted">remaining</span>
          </p>
        </header>

        {loadError ? (
          <p className="text-sm text-danger" role="alert">
            Could not load signups. Retry by refreshing.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/90 p-4">
          <label className="text-sm font-medium text-foreground">
            Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-3 text-lg text-foreground"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="text-left text-sm text-accent"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? "Hide details" : "More details"}
          </button>
          {showMore ? (
            <div className="flex flex-col gap-2">
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Grade (optional)"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-foreground"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-foreground"
              />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy || !displayName.trim()}
            className="rounded-xl bg-accent py-3 font-semibold text-background disabled:opacity-50"
          >
            Add signup
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handlePlus}
              className="rounded-xl border-2 border-accent py-4 text-2xl font-bold text-accent"
            >
              +1
            </button>
            <button
              type="button"
              disabled={busy || !payload?.signups.length}
              onClick={handleMinus}
              className="rounded-xl border-2 border-danger py-4 text-2xl font-bold text-danger disabled:opacity-40"
            >
              −1
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-surface/90 p-4">
          <p className="text-sm font-medium text-foreground">Capacity</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-foreground"
              disabled={busy || (payload?.capacity ?? 1) <= 1}
              onClick={() => bumpCapacity((payload?.capacity ?? 1) - 1)}
            >
              −
            </button>
            <span className="text-2xl font-bold text-foreground">{payload?.capacity ?? "—"}</span>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-foreground"
              disabled={busy}
              onClick={() => bumpCapacity((payload?.capacity ?? 12) + 1)}
            >
              +
            </button>
            <span className="text-sm text-foreground-muted">spots</span>
          </div>
        </section>

        {isLoading ? <p className="text-foreground-muted">Loading…</p> : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            In the cohort ({payload?.in_cohort.length ?? 0})
          </h2>
          <ul className="flex flex-col gap-2">
            {(payload?.in_cohort ?? []).map((row) => (
              <SignupRow key={row.id} row={row} onNamed={handleNamed} onDelete={handleDelete} />
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 pb-8">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Waitlist ({payload?.waitlist.length ?? 0})
          </h2>
          <ul className="flex flex-col gap-2">
            {(payload?.waitlist ?? []).map((row) => (
              <SignupRow key={row.id} row={row} onNamed={handleNamed} onDelete={handleDelete} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
