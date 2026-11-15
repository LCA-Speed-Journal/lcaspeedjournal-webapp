export type RsqQuadrant = "reactive" | "compliant" | "stiff" | "developing";

export function rsqQuadrant(jumpInches: number, gctMs: number): RsqQuadrant {
  const upper = jumpInches >= 10;
  const right = gctMs >= 200;
  if (upper && !right) return "reactive";
  if (upper && right) return "compliant";
  if (!upper && !right) return "stiff";
  return "developing";
}

/** Plot space is 0..1. 20 inches is the top (y 0). 400 ms is the right edge (x 1). */
export function rsqPoint(jumpInches: number, gctMs: number): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, gctMs / 400)),
    y: Math.min(1, Math.max(0, (20 - jumpInches) / 20)),
  };
}
