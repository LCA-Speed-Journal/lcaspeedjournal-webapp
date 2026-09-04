"use client";

import { useState } from "react";
import useSWR from "swr";
import { F2fTriangle } from "@/app/reporting/testing-day/F2fTriangle";
import { f2fChipLabel, formatQualityMark } from "@/lib/norms/f2f/labels";
import type { F2fPickMode } from "@/lib/norms/f2f/pick-marks";
import type { F2fProfile } from "@/lib/norms/f2f/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const MODES: { value: F2fPickMode; label: string }[] = [
  { value: "full-test", label: "Full-test" },
  { value: "best", label: "Best" },
  { value: "latest", label: "Latest" },
];

type F2fPayload = {
  mode: F2fPickMode;
  composed: boolean;
  as_of: string | null;
  f2f: F2fProfile | null;
};

type F2fSectionProps = {
  athleteId: string;
};

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

function fmtForty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function F2fSection({ athleteId }: F2fSectionProps) {
  const [mode, setMode] = useState<F2fPickMode>("full-test");
  const { data, error, isLoading } = useSWR<{ data: F2fPayload }>(
    `/api/athletes/${athleteId}/f2f?mode=${mode}`,
    fetcher
  );

  const payload = data?.data;
  const f2f = payload?.f2f ?? null;
  const showLabels = Boolean(f2f?.eligible_for_labels);
  const hasShape = Boolean(f2f && (f2f.explosion || f2f.force || f2f.form));
  const secondaryFlags = (f2f?.flags ?? []).filter(
    (flag) => flag !== f2f?.primary
  );

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">Force-to-Form</h3>
        <div
          className="inline-flex rounded-lg border border-border bg-surface p-0.5"
          role="group"
          aria-label="Force-to-Form mode"
        >
          {MODES.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.value)}
                className={
                  selected
                    ? "rounded-md bg-accent px-3 py-1 text-sm font-medium text-background"
                    : "rounded-md px-3 py-1 text-sm text-foreground-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {payload?.composed ? (
        <p className="mb-3 text-xs text-foreground-muted">
          Composed — marks from more than one day
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          Failed to load Force-to-Form.
        </p>
      ) : null}

      {!error && isLoading && !payload ? (
        <p className="text-sm text-foreground-muted">Loading Force-to-Form…</p>
      ) : null}

      {!error && payload && !hasShape ? (
        <p className="text-sm text-foreground-muted">
          Needs a jump or sprint.
        </p>
      ) : null}

      {!error && hasShape && f2f ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {showLabels && f2f.primary ? (
              <div className="flex flex-wrap gap-1">
                <Chip accent>{f2fChipLabel(f2f.primary)}</Chip>
                {secondaryFlags.map((flag) => (
                  <Chip key={flag}>{f2fChipLabel(flag)}</Chip>
                ))}
              </div>
            ) : null}
            <p className="tabular-nums text-sm text-foreground-muted">
              Ref 40 {fmtForty(f2f.reference_40)}
              {payload?.as_of ? ` · as of ${payload.as_of}` : ""}
            </p>
            <ul className="space-y-0.5 text-sm">
              <li
                className={
                  f2f.explosion?.projected
                    ? "tabular-nums text-foreground-muted"
                    : "tabular-nums text-foreground"
                }
              >
                Explosion {formatQualityMark(f2f.explosion, Boolean(payload?.composed))}
              </li>
              <li
                className={
                  f2f.force?.projected
                    ? "tabular-nums text-foreground-muted"
                    : "tabular-nums text-foreground"
                }
              >
                Force {formatQualityMark(f2f.force, Boolean(payload?.composed))}
              </li>
              <li
                className={
                  f2f.form?.projected
                    ? "tabular-nums text-foreground-muted"
                    : "tabular-nums text-foreground"
                }
              >
                Form {formatQualityMark(f2f.form, Boolean(payload?.composed))}
              </li>
            </ul>
          </div>
          <F2fTriangle profile={f2f} />
        </div>
      ) : null}
    </div>
  );
}
