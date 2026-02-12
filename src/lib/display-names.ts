export function formatLeaderboardName(
  first_name: string,
  last_name: string,
  athlete_type: "athlete" | "staff" | "alumni" | undefined,
  isMobile: boolean
): string {
  const first = (first_name ?? "").trim();
  const last = (last_name ?? "").trim();
  const type = athlete_type ?? "athlete";

  const useShort = type === "staff" || isMobile;
  if (!useShort) {
    if (!first && !last) return "";
    if (!last) return first;
    if (!first) return last;
    return `${first} ${last}`;
  }

  if (!last) return first;
  const initial = first ? `${first.charAt(0)}. ` : "";
  return `${initial}${last}`.trim();
}
