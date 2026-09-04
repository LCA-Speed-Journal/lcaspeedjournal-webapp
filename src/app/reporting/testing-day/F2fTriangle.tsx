import { vertexRadius } from "@/lib/norms/f2f/triangle";
import type { F2fProfile, F2fQuality, F2fVertex } from "@/lib/norms/f2f/types";

const SIZE = 120;
const CX = 60;
const CY = 64;
const FRAME_R = 36;

const AXES: { quality: F2fQuality; angle: number; label: string }[] = [
  { quality: "explosion", angle: Math.PI / 2, label: "Explosion" },
  { quality: "force", angle: (7 * Math.PI) / 6, label: "Force" },
  { quality: "form", angle: (11 * Math.PI) / 6, label: "Form" },
];

function axisPoint(angle: number, radius: number) {
  return {
    x: CX + Math.cos(angle) * radius,
    y: CY - Math.sin(angle) * radius,
  };
}

function labelAnchor(quality: F2fQuality): "middle" | "end" | "start" {
  if (quality === "force") return "end";
  if (quality === "form") return "start";
  return "middle";
}

export function F2fTriangle({ profile }: { profile: F2fProfile }) {
  const reference = profile.reference_40;
  const frame = AXES.map((axis) => axisPoint(axis.angle, FRAME_R));
  const plotted = AXES.map((axis) => {
    const vertex: F2fVertex | null = profile[axis.quality];
    if (!vertex) return null;
    const radius =
      reference != null
        ? vertexRadius(vertex.predicted_40, reference) * FRAME_R
        : 0;
    return { ...axisPoint(axis.angle, radius), projected: vertex.projected };
  });
  const connected = plotted.filter((point): point is NonNullable<typeof point> => point != null);
  const pointsAttr = connected.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-24 w-24 shrink-0"
      role="img"
      aria-label="Force-to-Form triangle"
    >
      <polygon
        points={frame.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        className="stroke-foreground-muted"
        strokeWidth="1"
      />
      {AXES.map((axis) => {
        const tip = axisPoint(axis.angle, FRAME_R + 14);
        return (
          <text
            key={axis.quality}
            x={tip.x}
            y={tip.y}
            textAnchor={labelAnchor(axis.quality)}
            dominantBaseline="middle"
            className="fill-foreground-muted"
            fontSize="7"
          >
            {axis.label}
          </text>
        );
      })}
      {connected.length === 2 ? (
        <line
          x1={connected[0].x}
          y1={connected[0].y}
          x2={connected[1].x}
          y2={connected[1].y}
          className="stroke-accent"
          strokeWidth="1.5"
        />
      ) : null}
      {connected.length >= 3 ? (
        <polygon
          points={pointsAttr}
          className="fill-accent/20 stroke-accent"
          strokeWidth="1.5"
        />
      ) : null}
      {plotted.map((point, index) => {
        if (!point) return null;
        return (
          <circle
            key={AXES[index].quality}
            cx={point.x}
            cy={point.y}
            r={3.5}
            className={point.projected ? "fill-none stroke-accent" : "fill-accent"}
            strokeDasharray={point.projected ? "2 1.5" : undefined}
            strokeWidth={point.projected ? 1.5 : undefined}
          />
        );
      })}
    </svg>
  );
}
