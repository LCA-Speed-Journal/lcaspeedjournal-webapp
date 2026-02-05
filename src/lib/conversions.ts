/**
 * Unit conversion functions for metric values.
 * Mirrors Python conversions.py — velocity_mph, distance_ft_from_cm/m, pass_through.
 */

export function velocityMph(distanceM: number, timeS: number): number {
  if (timeS === 0) {
    throw new Error("Cannot calculate velocity with zero time");
  }
  return (distanceM / timeS) * 2.237;
}

export function distanceFtFromCm(distanceCm: number): number {
  return distanceCm / 30.48;
}

export function distanceFtFromM(distanceM: number): number {
  return distanceM * 3.281;
}

export function passThrough(value: number): number {
  return value;
}

export type ConversionFormula =
  | "velocity_mph"
  | "distance_ft_from_cm"
  | "distance_ft_from_m"
  | "";

export function convertValue(
  inputValue: number,
  conversionFormula: ConversionFormula,
  options?: { distanceM?: number; timeS?: number }
): number {
  if (conversionFormula === "velocity_mph") {
    const distanceM = options?.distanceM;
    const timeS = options?.timeS ?? inputValue;
    if (distanceM == null || timeS == null) {
      throw new Error("velocity_mph conversion requires distanceM and timeS");
    }
    return velocityMph(distanceM, timeS);
  }
  if (conversionFormula === "distance_ft_from_cm") {
    return distanceFtFromCm(inputValue);
  }
  if (conversionFormula === "distance_ft_from_m") {
    return distanceFtFromM(inputValue);
  }
  // pass_through or unknown
  return passThrough(inputValue);
}
