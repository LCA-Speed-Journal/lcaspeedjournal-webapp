import { ZONE_LABELS } from "@/lib/norms/palette";

export function ZoneMark({
  label,
  color,
  populationName,
}: {
  label: string;
  color: string;
  populationName?: string;
}) {
  return (
    <span className="zone-badge" style={{ color }} title={populationName}>
      {label}
    </span>
  );
}

export function ZoneLegend() {
  return (
    <ul
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground-muted"
      aria-label="Zone legend"
    >
      {ZONE_LABELS.map((label) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: `var(--zone-${label})` }}
            aria-hidden
          />
          <span className="capitalize">{label}</span>
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border border-border bg-surface"
          aria-hidden
        />
        <span>no badge</span>
      </li>
    </ul>
  );
}
