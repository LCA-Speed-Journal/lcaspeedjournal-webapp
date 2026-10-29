"use client";

import { medianCurve, type DistanceUnit, type SpeedDot } from "@/lib/speed/profile";

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { left: 44, right: 16, top: 16, bottom: 32 };

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SpeedCurve({ dots, unit }: { dots: SpeedDot[]; unit: DistanceUnit }) {
  const unitDots = dots.filter((dot) => dot.distance_unit === unit);
  if (unitDots.length === 0) {
    return <p className="text-sm text-foreground-muted">No build-ins in this window.</p>;
  }

  const curve = medianCurve(unitDots);
  const xs = unitDots.map((dot) => dot.x);
  const ys = unitDots.map((dot) => dot.mph);
  const minX = 0;
  const maxX = Math.max(...xs, 0);
  const minY = 0;
  const maxY = Math.max(...ys, 0);
  const xSpan = maxX - minX || 1;
  const xPad = xSpan * 0.08;
  const yPad = maxY === minY ? 1 : maxY * 0.12;
  const x0 = minX;
  const x1 = maxX + xPad;
  const y0 = minY;
  const y1 = maxY + yPad;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * plotH;
  const fastest = Math.max(...ys);
  const points = curve.map((point) => `${sx(point.x)},${sy(point.mph)}`).join(" ");

  return (
    <div>
      <p className="mb-1 text-xs text-foreground-muted">
        Distance from the start ({unit}) · mph
      </p>
      <svg
        role="img"
        aria-label={`Build-in velocity curve in ${unit}, fastest ${formatTick(fastest)} mph`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full"
      >
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--color-border)"
        />
        <line
          x1={PAD.left}
          y1={HEIGHT - PAD.bottom}
          x2={WIDTH - PAD.right}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--color-border)"
        />
        <text
          x={PAD.left - 8}
          y={sy(maxY)}
          textAnchor="end"
          dominantBaseline="middle"
          fill="var(--color-foreground-muted)"
          fontSize="12"
        >
          {formatTick(maxY)}
        </text>
        <text
          x={PAD.left - 8}
          y={sy(0)}
          textAnchor="end"
          dominantBaseline="middle"
          fill="var(--color-foreground-muted)"
          fontSize="12"
        >
          0
        </text>
        <text
          x={sx(0)}
          y={HEIGHT - 8}
          textAnchor="middle"
          fill="var(--color-foreground-muted)"
          fontSize="12"
        >
          0
        </text>
        {maxX !== 0 ? (
          <text
            x={sx(maxX)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fill="var(--color-foreground-muted)"
            fontSize="12"
          >
            {formatTick(maxX)}
          </text>
        ) : null}
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {unitDots.map((dot, index) => {
          const highlighted = dot.mph === fastest;
          return (
            <circle
              key={`${dot.athlete_id}-${dot.component}-${dot.x}-${index}`}
              cx={sx(dot.x)}
              cy={sy(dot.mph)}
              r={highlighted ? 5 : 3.5}
              fill={highlighted ? "var(--color-accent)" : "var(--color-foreground-muted)"}
            >
              <title>{`${dot.athlete_name}, ${dot.component}, ${dot.mph} mph`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

/** One chart for each distance unit that has dots. */
export function SpeedCurveCharts({ dots }: { dots: SpeedDot[] }) {
  const units = (["yd", "m"] as const).filter((unit) =>
    dots.some((dot) => dot.distance_unit === unit)
  );
  if (units.length === 0) {
    return <p className="text-sm text-foreground-muted">No build-ins in this window.</p>;
  }
  return (
    <div className="space-y-4">
      {units.map((unit) => (
        <SpeedCurve key={unit} dots={dots} unit={unit} />
      ))}
    </div>
  );
}
