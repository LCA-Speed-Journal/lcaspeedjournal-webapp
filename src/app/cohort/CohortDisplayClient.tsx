"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { PublicCohortPayload } from "@/lib/cohort";

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

function remainingTone(remaining: number): string {
  if (remaining <= 0) return "text-danger";
  if (remaining <= 3) return "text-danger";
  if (remaining <= 6) return "text-gold";
  return "text-accent";
}

function barTone(remaining: number): string {
  if (remaining <= 0) return "bg-danger";
  if (remaining <= 3) return "bg-danger";
  if (remaining <= 6) return "bg-gold";
  return "bg-accent";
}

export function CohortDisplayClient() {
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    html.classList.add("dark");
    return () => {
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);

  const { data, error } = useSWR<{ data: PublicCohortPayload }>("/api/cohort", fetcher, {
    refreshInterval: 2000,
  });
  const payload = data?.data;

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground-muted">
        {error ? "Reconnecting…" : "Connecting…"}
      </div>
    );
  }

  const { title, capacity, claimed, remaining } = payload;
  const fillPct = capacity > 0 ? Math.min(100, (claimed / capacity) * 100) : 0;
  const empty = claimed <= 0;
  const full = remaining <= 0;
  const headlineTone = remainingTone(empty ? 99 : remaining);

  let headline: string;
  let subtext: string;
  let headlineClass: string;
  let headlineStyle: { fontSize: string } | undefined;

  if (empty) {
    headline = "Cohort Open";
    subtext = "Signups Limited";
    headlineClass = `mt-12 text-center text-6xl font-bold tracking-tight md:text-8xl ${headlineTone} cohort-headline-glow`;
  } else if (full) {
    headline = "Cohort full";
    subtext = "Waitlist open at the table";
    headlineClass = `mt-12 text-center text-6xl font-bold tracking-tight md:text-8xl ${headlineTone} cohort-headline-glow`;
  } else {
    headline = String(remaining);
    subtext = remaining === 1 ? "spot remaining" : "spots remaining";
    headlineClass = `mt-12 text-center font-bold leading-none tracking-tight ${headlineTone} cohort-headline-glow`;
    headlineStyle = { fontSize: "clamp(6rem, 22vw, 14rem)" };
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-8 py-12">
      {error ? (
        <p className="absolute top-4 text-sm text-foreground-muted">Reconnecting…</p>
      ) : null}
      <p className="text-center text-sm font-medium uppercase tracking-[0.3em] text-foreground-muted">
        Back to School Night
      </p>
      <h1 className="mt-3 text-center text-2xl font-semibold text-foreground md:text-4xl">
        {title}
      </h1>
      <p className={headlineClass} style={headlineStyle}>
        {headline}
      </p>
      <p className="mt-4 text-center text-xl text-foreground-muted md:text-3xl">
        {subtext}
      </p>
      <div className="mt-16 h-4 w-full max-w-3xl overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barTone(remaining)}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
