import { vertexRadius } from "@/lib/norms/f2f/triangle";
import type { F2fProfile, F2fQuality, F2fVertex } from "@/lib/norms/f2f/types";

const SIZE = 120;
const CX = 60;
const CY = 64;
const FRAME_R = 36;

const BEGIN_STROKE = "var(--f2f-overlay-begin)";
const BEGIN_FILL = "var(--f2f-overlay-begin-fill)";
const END_STROKE = "var(--f2f-overlay-end)";
const END_FILL = "var(--f2f-overlay-end-fill)";

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

type PlotPoint = { x: number; y: number; projected: boolean };

function plotProfile(
  profile: F2fProfile,
  reference: number | null
): (PlotPoint | null)[] {
  return AXES.map((axis) => {
    const vertex: F2fVertex | null = profile[axis.quality];
    if (!vertex) return null;
    const radius =
      reference != null
        ? vertexRadius(vertex.predicted_40, reference) * FRAME_R
        : 0;
    return {
      ...axisPoint(axis.angle, radius),
      projected: vertex.projected,
    };
  });
}

function ShapeLayer({
  plotted,
  stroke,
  fill,
}: {
  plotted: (PlotPoint | null)[];
  stroke: string;
  fill: string;
}) {
  const connected = plotted.filter(
    (point): point is PlotPoint => point != null
  );
  const pointsAttr = connected.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <g>
      {connected.length === 2 ? (
        <line
          x1={connected[0].x}
          y1={connected[0].y}
          x2={connected[1].x}
          y2={connected[1].y}
          stroke={stroke}
          strokeWidth="1.5"
        />
      ) : null}
      {connected.length >= 3 ? (
        <polygon
          points={pointsAttr}
          fill={fill}
          stroke={stroke}
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
            fill={point.projected ? "none" : stroke}
            stroke={stroke}
            strokeDasharray={point.projected ? "2 1.5" : undefined}
            strokeWidth={point.projected ? 1.5 : undefined}
          />
        );
      })}
    </g>
  );
}

/**
 * Overlay beginning and end profiles on one frame.
 * Colors: light = gray/navy; dark = white/yellow (see --f2f-overlay-* vars).
 * Each shape uses its own reference_40 so it matches side-by-side view.
 */
export function F2fOverlayTriangle({
  beginning,
  end,
}: {
  beginning: F2fProfile;
  end: F2fProfile;
}) {
  const frame = AXES.map((axis) => axisPoint(axis.angle, FRAME_R));
  const beginPlot = plotProfile(beginning, beginning.reference_40);
  const endPlot = plotProfile(end, end.reference_40);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-44 w-44 shrink-0"
      role="img"
      aria-label="Force-to-Form overlay triangle"
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
            fontSize="8"
          >
            {axis.label}
          </text>
        );
      })}
      <ShapeLayer
        plotted={beginPlot}
        stroke={BEGIN_STROKE}
        fill={BEGIN_FILL}
      />
      <ShapeLayer plotted={endPlot} stroke={END_STROKE} fill={END_FILL} />
    </svg>
  );
}
