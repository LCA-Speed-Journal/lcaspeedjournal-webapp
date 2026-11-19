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
