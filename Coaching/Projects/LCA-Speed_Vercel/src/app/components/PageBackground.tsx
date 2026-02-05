/**
 * Shared background: subtle grid + radial gold glow.
 * Animations use keyframes from page-background.css + inline style (no Tailwind utility).
 * Use inside a relative container.
 */
const GLOW_ANIMATION = "page-bg-glow-pulse 14s ease-in-out infinite";
const GRID_ANIMATION = "page-bg-grid-drift 30s ease-in-out infinite";
const GRADIENT_ANIMATION = "page-bg-gradient-shift 100s ease-in-out infinite";

export function PageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Animated gradient base layer */}
      <div
        className="page-bg-gradient absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 150% 120% at 20% 20%, rgba(30, 58, 138, 0.08) 0%, rgba(30, 58, 138, 0.04) 35%, transparent 75%), radial-gradient(ellipse 140% 100% at 80% 80%, rgba(49, 46, 129, 0.06) 0%, rgba(49, 46, 129, 0.03) 40%, transparent 80%), radial-gradient(ellipse 120% 140% at 50% 50%, rgba(30, 64, 175, 0.05) 0%, rgba(30, 64, 175, 0.02) 50%, transparent 85%)",
          backgroundSize: "200% 200%",
          animation: GRADIENT_ANIMATION,
          willChange: "background-position",
        }}
      />
      {/* Grid: slow drift for depth */}
      <div
        className="page-bg-grid absolute inset-0"
        style={{
          opacity: "var(--page-bg-grid-opacity)",
          backgroundImage: `
            linear-gradient(var(--page-bg-grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--page-bg-grid) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          animation: GRID_ANIMATION,
          transformOrigin: "center center",
          willChange: "transform, background-position",
        }}
      />
      {/* Radial glow: slow pulse */}
      <div
        className="page-bg-glow absolute -top-1/2 left-1/2 h-full w-full -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, var(--accent), transparent 70%)",
          animation: GLOW_ANIMATION,
          transformOrigin: "center top",
          willChange: "opacity",
        }}
      />
    </div>
  );
}
