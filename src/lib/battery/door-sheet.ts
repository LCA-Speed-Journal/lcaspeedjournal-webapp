import { orderBoard } from "./board-order";
import type { BoardAthlete } from "./load";

export const DAY_A_DOOR_COLUMNS = [
  "10yd_Split",
  "20yd_Dash",
  "40yd_Dash",
  "MaxVelocity",
  "10-5_RSI",
  "DRI",
] as const;

export function doorSheetColumnKeys(dayKey: string, boardColumnKeys: readonly string[]): string[] {
  if (dayKey === "A") return [...DAY_A_DOOR_COLUMNS];
  return [...boardColumnKeys];
}

export function doorSheetAthletes(athletes: BoardAthlete[], columnKeys: readonly string[]) {
  const printed = athletes.filter((athlete) =>
    columnKeys.some((key) => athlete.cells[key] != null)
  );
  return orderBoard(printed, []).filter((row) => row.place != null);
}
