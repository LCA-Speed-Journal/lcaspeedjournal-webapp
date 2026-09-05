"use client";

import { useState } from "react";
import { THEME_NOTE_MAX_CHARS } from "@/lib/norms/f2f/theme-notes";
import { f2fChipLabel, f2fShowsPredicted40s } from "@/lib/norms/f2f/labels";
import {
  SESSION_NOTE_KEY,
  themeGroupKey,
  themeMixLines,
  type F2fThemeSummary,
} from "@/lib/norms/f2f/themes";
import type {
  TestingDayBoardData,
  TestingDayMatrixAthlete,
} from "@/lib/norms/testing-day";
import {
  HUGO_GROUP_META,
  isHugoGroup,
} from "@/lib/weight-room/constants";
import { F2fTriangle } from "./F2fTriangle";

type StripGroup = {
  key: string;
  sport: string | null;
  gender: string | null;
  theme: F2fThemeSummary | undefined;
  athletes: TestingDayMatrixAthlete[];
};

function sportLabel(sport: string | null): string {
  if (sport == null) return "No primary sport";
  if (isHugoGroup(sport)) return HUGO_GROUP_META[sport].label;
  return sport;
}

function genderLabel(gender: string | null): string {
  if (gender === "M") return "M";
  if (gender === "F") return "F";
  return "Unknown";
}

function fmtForty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function compareGroups(a: StripGroup, b: StripGroup): number {
  if (a.sport == null && b.sport != null) return 1;
  if (a.sport != null && b.sport == null) return -1;
  const sportCmp = (a.sport ?? "").localeCompare(b.sport ?? "");
  if (sportCmp !== 0) return sportCmp;
  return (a.gender ?? "").localeCompare(b.gender ?? "");
}

function buildStripGroups(board: TestingDayBoardData): StripGroup[] {
  const themes = board.f2f_themes;
  if (!themes) return [];

  const byKey = new Map<string, TestingDayMatrixAthlete[]>();
  for (const athlete of board.matrix.athletes) {
    const key = themeGroupKey(athlete.sport, athlete.gender);
    const list = byKey.get(key);
    if (list) list.push(athlete);
    else byKey.set(key, [athlete]);
  }

  const groups: StripGroup[] = [];
  const seen = new Set<string>();

  for (const theme of themes.groups) {
    const key = themeGroupKey(theme.sport, theme.gender);
    seen.add(key);
    groups.push({
      key,
      sport: theme.sport,
      gender: theme.gender,
      theme,
      athletes: byKey.get(key) ?? [],
    });
  }

  const leftovers: StripGroup[] = [];
  for (const [key, athletes] of byKey) {
    if (seen.has(key)) continue;
    leftovers.push({
      key,
      sport: athletes[0]?.sport ?? null,
      gender: athletes[0]?.gender ?? null,
      theme: undefined,
      athletes,
    });
  }

  return [...groups, ...leftovers.toSorted(compareGroups)];
}

function Chip({
  children,
  accent,
}: {
  children: string;
  accent?: boolean;
}) {
  return (
    <span
      className={
        accent
          ? "inline-flex items-center rounded-full border border-accent/60 bg-accent/15 px-2.5 py-0.5 text-sm font-semibold text-foreground"
          : "inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-sm text-foreground-muted"
      }
    >
      {children}
    </span>
  );
}

function PredictedForty({
  label,
  predicted,
  projected,
}: {
  label: string;
  predicted: number | null | undefined;
  projected?: boolean;
}) {
  return (
    <li
      className={`tabular-nums ${
        projected ? "text-foreground-muted" : "text-foreground"
      }`}
    >
      {label} {fmtForty(predicted)}
    </li>
  );
}

function ThemeNoteEditor({
  sessionId,
  noteKey,
  theme,
  onNotesSaved,
}: {
  sessionId: string;
  noteKey: string;
  theme: F2fThemeSummary;
  onNotesSaved: () => void | Promise<unknown>;
}) {
  const override = theme.note !== theme.generated_note ? theme.note : "";
  const [draft, setDraft] = useState(override);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reporting/testing-day/f2f-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          notes: { [noteKey]: draft },
        }),
      });
      let message = res.statusText || `Save failed (${res.status})`;
      try {
        const json = (await res.json()) as { error?: unknown };
        if (typeof json.error === "string" && json.error.trim()) {
          message = json.error;
        }
      } catch {
        // not JSON
      }
      if (!res.ok) {
        setError(message);
        return;
      }
      await onNotesSaved();
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {themeMixLines(theme).map((line) => (
        <p
          key={line.label}
          className="text-xs tabular-nums text-foreground-muted"
        >
          {line.label}: {line.text}
        </p>
      ))}
      <p className="text-sm text-foreground">{theme.note}</p>
      {theme.note !== theme.generated_note ? (
        <p className="text-xs text-foreground-muted">
          Generated: {theme.generated_note}
        </p>
      ) : null}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={THEME_NOTE_MAX_CHARS}
        rows={2}
        placeholder="Interpretive override"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground print:hidden"
      />
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50 print:hidden"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {error ? (
        <p className="text-sm text-red-200 print:hidden">{error}</p>
      ) : null}
    </div>
  );
}

function AthleteCard({ athlete }: { athlete: TestingDayMatrixAthlete }) {
  const f2f = athlete.f2f;
  const showLabels = Boolean(f2f?.eligible_for_labels);
  const hasShape = Boolean(f2f && (f2f.explosion || f2f.force || f2f.form));
  const secondaryFlags = (f2f?.flags ?? []).filter(
    (flag) => flag !== f2f?.primary
  );

  return (
    <article className="rounded-xl border border-border bg-surface-elevated/40 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-foreground">
            {athlete.first_name} {athlete.last_name}
          </p>
          {showLabels && f2f?.primary ? (
            <div className="flex flex-wrap gap-1">
              <Chip accent>{f2fChipLabel(f2f.primary)}</Chip>
              {secondaryFlags.map((flag) => (
                <Chip key={flag}>{f2fChipLabel(flag)}</Chip>
              ))}
            </div>
          ) : null}
          {f2fShowsPredicted40s(f2f) ? (
            <p className="tabular-nums text-foreground-muted">
              Ref 40 {fmtForty(f2f?.reference_40)}
            </p>
          ) : null}
          {f2fShowsPredicted40s(f2f) ? (
            <ul className="space-y-0.5">
              <PredictedForty
                label="Explosion"
                predicted={f2f?.explosion?.predicted_40}
                projected={f2f?.explosion?.projected}
              />
              <PredictedForty
                label="Force"
                predicted={f2f?.force?.predicted_40}
                projected={f2f?.force?.projected}
              />
              <PredictedForty
                label="Form"
                predicted={f2f?.form?.predicted_40}
                projected={f2f?.form?.projected}
              />
            </ul>
          ) : null}
        </div>
        {hasShape && f2f ? (
          <F2fTriangle profile={f2f} />
        ) : (
          <p className="max-w-[7rem] text-xs text-foreground-muted">
            Needs a jump or sprint.
          </p>
        )}
      </div>
    </article>
  );
}

export function F2fStrip({
  board,
  sessionId,
  onNotesSaved,
}: {
  board: TestingDayBoardData;
  sessionId: string;
  onNotesSaved: () => void | Promise<unknown>;
}) {
  if (!board.f2f_themes) return null;

  const groups = buildStripGroups(board);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Force-to-Form</h2>
      <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
        <h3 className="mb-2 text-base font-semibold text-foreground">Session</h3>
        <ThemeNoteEditor
          key={`${SESSION_NOTE_KEY}-${board.f2f_themes.session.note}`}
          sessionId={sessionId}
          noteKey={SESSION_NOTE_KEY}
          theme={board.f2f_themes.session}
          onNotesSaved={onNotesSaved}
        />
      </div>
      {groups.map((group) => (
        <section
          key={group.key}
          className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {sportLabel(group.sport)} · {genderLabel(group.gender)}
            </h3>
            <p className="text-sm tabular-nums text-foreground-muted">
              n = {group.athletes.length}
            </p>
          </header>
          {group.theme ? (
            <ThemeNoteEditor
              key={`${group.key}-${group.theme.note}`}
              sessionId={sessionId}
              noteKey={group.key}
              theme={group.theme}
              onNotesSaved={onNotesSaved}
            />
          ) : null}
          {group.athletes.length === 0 ? (
            <p className="text-sm text-foreground-muted">No athletes.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.athletes.map((athlete) => (
                <AthleteCard key={athlete.athlete_id} athlete={athlete} />
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
