import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";

export function parseContextHugoGroup(
  value: unknown
): { ok: true; value: HugoGroup | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (isHugoGroup(value)) return { ok: true, value };
  return { ok: false, error: "Invalid context_hugo_group" };
}
