import { HUGO_GROUP_META, isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";

export function parseContextHugoGroup(
  value: unknown
): { ok: true; value: HugoGroup | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (isHugoGroup(value)) return { ok: true, value };
  return { ok: false, error: "Invalid context_hugo_group" };
}

export function guestFields(
  contextHugoGroup: string | null | undefined,
  membershipGroups: string[]
): { guest: boolean; home_sport_label: string | null } {
  if (!isHugoGroup(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  if (membershipGroups.includes(contextHugoGroup)) {
    return { guest: false, home_sport_label: null };
  }
  const labels = membershipGroups
    .filter((group): group is HugoGroup => isHugoGroup(group))
    .map((group) => HUGO_GROUP_META[group].label);
  return {
    guest: true,
    home_sport_label: labels.length > 0 ? labels.join(", ") : null,
  };
}
