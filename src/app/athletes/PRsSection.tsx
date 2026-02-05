"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PRRow = {
  metric_key: string;
  display_name: string;
  units: string;
  value: number;
  lower_is_better: boolean;
};

type PRsSectionProps = {
  athleteId: string;
};

export function PRsSection({ athleteId }: PRsSectionProps) {
  const { data, error } = useSWR<{ data: PRRow[] }>(
    `/api/athletes/${athleteId}/prs`,
    fetcher
  );

  const prs = data?.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Practice-Metric PRs
      </h3>
      {error && (
        <p className="text-sm text-danger" role="alert">
          Failed to load PRs.
        </p>
      )}
      {!error && prs.length === 0 && (
        <p className="text-sm text-foreground-muted">
          No metric entries yet for this athlete.
        </p>
      )}
      {!error && prs.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {prs.map((pr) => (
            <div
              key={pr.metric_key}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <span className="text-xs font-medium text-foreground-muted">
                {pr.display_name}
              </span>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {typeof pr.value === "number" && Number.isFinite(pr.value)
                  ? pr.value.toFixed(2)
                  : pr.value}{" "}
                <span className="font-normal text-foreground-muted">
                  {pr.units}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
