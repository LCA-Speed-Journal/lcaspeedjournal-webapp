import { distanceFtFromCm, distanceFtFromM } from "./conversions";

export type DistanceUnit = "ft_in" | "in" | "cm" | "m";

export function readMeasuredUnit(value: unknown): DistanceUnit | null {
  if (value === "ft_in" || value === "in" || value === "cm" || value === "m") return value;
  return null;
}

export function defaultDistanceUnit(inputUnits: string): DistanceUnit | null {
  const unit = inputUnits.toLowerCase();
  if (unit === "ft" || unit === "feet") return "ft_in";
  if (unit === "in" || unit === "inch" || unit === "inches") return "in";
  if (unit === "cm") return "cm";
  if (unit === "m" || unit === "meter" || unit === "meters") return "m";
  return null;
}

function toFeet(magnitude: number, unit: DistanceUnit): number {
  if (unit === "ft_in") return magnitude;
  if (unit === "in") return magnitude / 12;
  if (unit === "cm") return distanceFtFromCm(magnitude);
  if (unit === "m") return distanceFtFromM(magnitude);
  throw new Error(`Cannot convert distance unit ${unit}`);
}

function fromFeet(feet: number, storedUnits: string): number {
  const unit = storedUnits.toLowerCase();
  if (unit === "ft" || unit === "feet") return feet;
  if (unit === "in" || unit === "inch" || unit === "inches") return feet * 12;
  if (unit === "cm") return feet / distanceFtFromCm(1);
  if (unit === "m" || unit === "meter" || unit === "meters") return feet / distanceFtFromM(1);
  throw new Error(`Cannot store distance as ${storedUnits}`);
}

export function storedDistance(input: {
  raw: string;
  measuredUnit: DistanceUnit;
  inputUnits: string;
  displayUnits: string;
}): { value: number; displayValue: number; units: string } {
  const magnitude = parseDistanceMagnitude(input.raw, input.measuredUnit);
  const feet = toFeet(magnitude, input.measuredUnit);
  return {
    value: fromFeet(feet, input.inputUnits),
    displayValue: fromFeet(feet, input.displayUnits),
    units: input.displayUnits,
  };
}

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
  if (!Number.isFinite(feet)) return "";
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

export function formatStoredMark(
  value: number | null,
  units: string | null,
  plain: (n: number) => string
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const unit = units ?? "";
  if (unit.toLowerCase() === "ft" || unit.toLowerCase() === "feet") return formatFeetInches(value);
  const body = plain(value);
  return unit ? `${body} ${unit}` : body;
}
