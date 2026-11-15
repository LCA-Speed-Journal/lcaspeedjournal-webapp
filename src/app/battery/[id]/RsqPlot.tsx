import type { BoardRsqPoint } from "@/lib/battery/load";
import { rsqPoint, rsqQuadrant, type RsqQuadrant } from "@/lib/battery/rsq";

const DOT: Record<RsqQuadrant, string> = {
  reactive: "bg-blue-600",
  compliant: "bg-red-600",
  stiff: "bg-green-600",
  developing: "bg-yellow-400",
};

const CORNER_LABELS: { label: string; className: string }[] = [
  { label: "Reactive", className: "left-1 top-1 text-blue-800 [.dark_&]:text-blue-400" },
  { label: "Compliant", className: "right-1 top-1 text-right text-red-800 [.dark_&]:text-red-400" },
  { label: "Stiff", className: "bottom-1 left-1 text-green-800 [.dark_&]:text-green-400" },
  {
    label: "Developing",
    className: "bottom-1 right-1 text-right text-yellow-800 [.dark_&]:text-yellow-400",
  },
];

export function RsqPlot({ athletes }: { athletes: BoardRsqPoint[] }) {
  return (
    <figure
      data-rsq-plot
      aria-label="Jump height versus ground contact"
      className="mt-2 w-44 rounded-md border border-border bg-surface/80 p-2 text-foreground"
    >
      <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
        RSQ
      </figcaption>
      <div className="grid grid-cols-[1.75rem_1fr] gap-x-1">
        <div className="flex flex-col justify-between py-0.5 text-[10px] font-medium leading-none text-foreground-muted">
          <span>20 in</span>
          <span>10</span>
          <span>0</span>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-sm border border-border">
          <div className="absolute inset-y-0 left-0 w-1/2">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-blue-500/20" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-green-500/20" />
          </div>
          <div className="absolute inset-y-0 right-0 w-1/2">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-red-500/20" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-yellow-400/30" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-foreground/60" />
          {CORNER_LABELS.map((corner) => (
            <span
              key={corner.label}
              className={`pointer-events-none absolute text-[9px] font-semibold leading-none ${corner.className}`}
            >
              {corner.label}
            </span>
          ))}
          {athletes.map((athlete) => {
            const point = rsqPoint(athlete.jump_in, athlete.gct_ms);
            const quadrant = rsqQuadrant(athlete.jump_in, athlete.gct_ms);
            return (
              <span
                key={athlete.athlete_id}
                title={`${athlete.name}: ${athlete.jump_in} in, ${athlete.gct_ms} ms`}
                data-rsq-athlete={athlete.athlete_id}
                className={`absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background ${DOT[quadrant]}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-[1.75rem_1fr] gap-x-1 text-[10px] font-medium leading-none text-foreground-muted">
        <span />
        <span className="flex justify-between">
          <span>0 ms</span>
          <span>200</span>
          <span>400</span>
        </span>
      </div>
    </figure>
  );
}
