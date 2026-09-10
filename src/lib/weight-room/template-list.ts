/** Empty activity means All — keep every template. */
export function filterTemplatesByActivity<T extends { hugo_group: string }>(
  templates: T[],
  activity: string
): T[] {
  if (!activity) return templates;
  return templates.filter((t) => t.hugo_group === activity);
}
