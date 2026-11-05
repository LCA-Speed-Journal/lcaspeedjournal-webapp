export type LaneHeat = {
  heat: number;
  athlete_ids: string[];
  is_final: boolean;
};

export function seedLanes(placeOrder: string[]): LaneHeat[] {
  const pairs: string[][] = [];
  for (let i = 0; i < placeOrder.length; i += 2) {
    pairs.push(placeOrder.slice(i, i + 2));
  }
  const heats = pairs.toReversed();
  return heats.map((athlete_ids, index) => ({
    heat: index + 1,
    athlete_ids,
    is_final: index === heats.length - 1,
  }));
}
