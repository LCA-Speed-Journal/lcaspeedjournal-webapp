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

export type RsiAttemptRow = {
  metric_key: string;
  display_value: number;
  created_at: number;
};

export type RsiAttempt = { jump: number; gct: number };

/** Each RSI test is logged as the score plus the jump and contact from that same trial. */
export const RSI_TESTS = [
  { rsi: "10-5_RSI", jump: "10-5_JH", contact: "10-5_GCT" },
  { rsi: "Hop-Test_RSI", jump: "Hop-Test_JH", contact: "Hop-Test_GCT" },
] as const;

export function rsiTestFor(metricKey: string): (typeof RSI_TESTS)[number] | null {
  return RSI_TESTS.find((test) => test.rsi === metricKey) ?? null;
}

export function isRsiCompanionKey(metricKey: string): boolean {
  return RSI_TESTS.some((test) => test.jump === metricKey || test.contact === metricKey);
}

function rsiPart(metricKey: string): "rsi" | "jump" | "contact" | null {
  for (const test of RSI_TESTS) {
    if (metricKey === test.rsi) return "rsi";
    if (metricKey === test.jump) return "jump";
    if (metricKey === test.contact) return "contact";
  }
  return null;
}

/** RSI must sort ahead of the jump and contact when timestamps tie. */
function rsiRowRank(metricKey: string): number {
  const part = rsiPart(metricKey);
  if (part === "rsi") return 0;
  if (part === "jump") return 1;
  if (part === "contact") return 2;
  return 3;
}

/** One RSI save owns the jump and contact that follow it, until the next RSI. */
export function groupRsiAttempts(rows: RsiAttemptRow[]): RsiAttempt[] {
  const sorted = rows.toSorted(
    (a, b) => a.created_at - b.created_at || rsiRowRank(a.metric_key) - rsiRowRank(b.metric_key)
  );
  const attempts: RsiAttempt[] = [];
  let jump: number | null = null;
  let gct: number | null = null;

  const flush = () => {
    if (jump != null && gct != null) attempts.push({ jump, gct });
    jump = null;
    gct = null;
  };

  for (const row of sorted) {
    const part = rsiPart(row.metric_key);
    if (part === "rsi") {
      flush();
      continue;
    }
    if (part === "jump") {
      if (jump != null) flush();
      jump = row.display_value;
      continue;
    }
    if (part === "contact") {
      if (gct != null) flush();
      gct = row.display_value;
    }
  }
  flush();
  return attempts;
}

export function averageRsiAttempts(attempts: readonly RsiAttempt[]): RsiAttempt | null {
  if (attempts.length === 0) return null;
  const jump = attempts.reduce((sum, item) => sum + item.jump, 0) / attempts.length;
  const gct = attempts.reduce((sum, item) => sum + item.gct, 0) / attempts.length;
  return { jump, gct };
}
