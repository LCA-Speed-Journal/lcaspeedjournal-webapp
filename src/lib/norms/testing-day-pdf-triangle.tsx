import { Circle, Line, Polygon, Svg, Text } from "@react-pdf/renderer";
import { vertexRadius } from "@/lib/norms/f2f/triangle";
import type { F2fProfile, F2fQuality, F2fVertex } from "@/lib/norms/f2f/types";

const SIZE = 120;
const CX = 60;
const CY = 64;
const FRAME_R = 36;
const STROKE = "#666";
const FILL = "#93c5fd";

const AXES: { quality: F2fQuality; angle: number; label: string }[] = [
  { quality: "explosion", angle: Math.PI / 2, label: "Explosion" },
  { quality: "force", angle: (7 * Math.PI) / 6, label: "Force" },
  { quality: "form", angle: (11 * Math.PI) / 6, label: "Top-End" },
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

const DEFAULT_DISPLAY_SIZE = 72;
export const F2F_CARD_TRIANGLE_SIZE = Math.round(DEFAULT_DISPLAY_SIZE * 1.15);

export function PdfF2fTriangle({
  profile,
  size = DEFAULT_DISPLAY_SIZE,
}: {
  profile: F2fProfile;
  size?: number;
}) {
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
  const connected = plotted.filter(
    (point): point is NonNullable<(typeof plotted)[number]> => point != null
  );
  const pointsAttr = connected.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size}>
      <Polygon
        points={frame.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={STROKE}
        strokeWidth={1}
      />
      {AXES.map((axis) => {
        const tip = axisPoint(axis.angle, FRAME_R + 14);
        return (
          <Text
            key={axis.quality}
            x={tip.x}
            y={tip.y}
            textAnchor={labelAnchor(axis.quality)}
            dominantBaseline="middle"
            fill={STROKE}
            style={{ fontSize: 7 } as never}
          >
            {axis.label}
          </Text>
        );
      })}
      {connected.length === 2 ? (
        <Line
          x1={connected[0].x}
          y1={connected[0].y}
          x2={connected[1].x}
          y2={connected[1].y}
          stroke={FILL}
          strokeWidth={1.5}
        />
      ) : null}
      {connected.length >= 3 ? (
        <Polygon
          points={pointsAttr}
          fill={FILL}
          fillOpacity={0.35}
          stroke={FILL}
          strokeWidth={1.5}
        />
      ) : null}
      {plotted.map((point, index) => {
        if (!point) return null;
        return (
          <Circle
            key={AXES[index].quality}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill={point.projected ? "none" : FILL}
            stroke={FILL}
            strokeDasharray={point.projected ? "2 1.5" : undefined}
            strokeWidth={point.projected ? 1.5 : 0}
          />
        );
      })}
    </Svg>
  );
}
