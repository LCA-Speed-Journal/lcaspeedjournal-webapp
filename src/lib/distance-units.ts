export type DistanceUnit = "ft_in" | "in" | "cm" | "m";

const FEET_INCHES =
  /^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot|-)\s*(\d+(?:\.\d+)?)(?:\s*(?:"|in|inch|inches))?\s*$/i;

export function parseDistanceMagnitude(raw: string, unit: DistanceUnit): number {
  const text = raw.trim();
  if (unit === "ft_in") {
    const feetInches = text.match(FEET_INCHES);
    if (feetInches) {
      return Number(feetInches[1]) + Number(feetInches[2]) / 12;
    }
    if (/(cm|meter|metre|\bm\b|in|inch)/i.test(text)) {
      throw new Error(`Unit in "${raw}" does not match feet-inches`);
    }
    const feet = text.match(/^(-?\d+(?:\.\d+)?)(?:\s*(?:ft|feet|foot|'|" ))?\s*$/i);
    if (!feet) throw new Error(`Cannot parse feet-inches "${raw}"`);
    return Number(feet[1]);
  }

  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*([a-z"']+)?\s*$/i);
  if (!match) {
    if (FEET_INCHES.test(text)) {
      throw new Error(`Unit in "${raw}" does not match ${unit}`);
    }
    throw new Error(`Cannot parse ${unit} "${raw}"`);
  }
  const suffix = (match[2] ?? "").toLowerCase();
  const ok =
    suffix === "" ||
    (unit === "in" && (suffix === "in" || suffix === "inch" || suffix === "inches" || suffix === '"')) ||
    (unit === "cm" && suffix === "cm") ||
    (unit === "m" && (suffix === "m" || suffix === "meter" || suffix === "meters" || suffix === "metre" || suffix === "metres"));
  if (!ok) throw new Error(`Unit in "${raw}" does not match ${unit}`);
  return Number(match[1]);
}

export function formatFeetInches(feet: number): string {
  const sign = feet < 0 ? "-" : "";
  const abs = Math.abs(feet);
  let whole = Math.floor(abs + 1e-9);
  let inches = Math.round((abs - whole) * 12 * 10) / 10;
  if (inches >= 12) {
    whole += 1;
    inches = 0;
  }
  const inchText = Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
  return `${sign}${whole}' ${inchText}"`;
}
