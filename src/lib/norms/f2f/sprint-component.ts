/** Map journal labels like "10-20", "10–20m", or "10-20yd" onto the F2F keys. */
export function canonicalSprintComponent(
  component: string | null
): string | null {
  if (!component) return null;
  const normalized = component.replace(/[–—]/g, "-").trim();
  const match = normalized.match(/^(\d+)\s*-\s*(\d+)\s*(?:yd|m)?$/i);
  if (!match) return normalized;
  return `${match[1]}-${match[2]}yd`;
}
