/** Swap a keyed row one position up or down. Out-of-range moves return the same array. */
export function moveMovement<T extends { key: string }>(
  rows: T[],
  key: string,
  delta: -1 | 1
): T[] {
  const i = rows.findIndex((row) => row.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = rows.slice();
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item);
  return next;
}
