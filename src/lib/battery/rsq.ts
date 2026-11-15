export type RsqQuadrant = "reactive" | "compliant" | "stiff" | "developing";

export function rsqQuadrant(jumpInches: number, gctMs: number): RsqQuadrant {
  const upper = jumpInches >= 10;
  const right = gctMs >= 200;
  if (upper && !right) return "reactive";
  if (upper && right) return "compliant";
  if (!upper && !right) return "stiff";
  return "developing";
}
