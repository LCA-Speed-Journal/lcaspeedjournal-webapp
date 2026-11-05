import { describe, expect, it } from "vitest";
import { cutoffAfterHeat, freezeLaneSheet, laneSeedIds, laneSheetFromFreeze, seedLanes } from "./lanes";

describe("seedLanes", () => {
  it("pairs 1 with 2 and runs that heat last", () => {
    const heats = seedLanes(["a", "b", "c", "d"]);
    expect(heats.map((heat) => heat.athlete_ids)).toEqual([
      ["c", "d"],
      ["a", "b"],
    ]);
    expect(heats[1].is_final).toBe(true);
  });

  it("opens with a solo when the field is odd", () => {
    const heats = seedLanes(["a", "b", "c"]);
    expect(heats[0].athlete_ids).toEqual(["c"]);
    expect(heats[heats.length - 1].athlete_ids).toEqual(["a", "b"]);
  });

  it("keeps tested athletes in board order and sorts untested by name", () => {
    expect(
      laneSeedIds([
        { athlete_id: "b", first_name: "Zoe", last_name: "Young", place: 1 },
        { athlete_id: "a", first_name: "Amy", last_name: "Adams", place: 1 },
        { athlete_id: "d", first_name: "Bea", last_name: "Cole", place: null },
        { athlete_id: "c", first_name: "Ann", last_name: "Cole", place: null },
      ])
    ).toEqual(["b", "a", "c", "d"]);
  });
});

describe("cutoffAfterHeat", () => {
  it("sits the line between the heat with place 18 and the heat with place 19", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `p${String(index + 1).padStart(2, "0")}`);
    const heats = seedLanes(ids);
    const placed = heats.map((heat) => ({
      heat: heat.heat,
      places: heat.athlete_ids.map((id) => Number(id.slice(1))),
    }));
    const heatOf = (place: number) => placed.find((heat) => heat.places.includes(place))?.heat;

    expect(heatOf(17)).toBe(heatOf(18));
    expect(heatOf(19)).toBe(heatOf(20));
    expect(heatOf(15)).toBe(heatOf(16));
    expect(heatOf(18)).not.toBe(heatOf(15));

    const after = cutoffAfterHeat(placed);
    expect(after).toBe(heatOf(19));
    expect(heatOf(18)).toBe((after ?? 0) + 1);
    expect(after).not.toBe(heatOf(18));
    expect(after).not.toBe(heatOf(16));
  });

  it("keeps a stored cutoff between those two heats when live places change", () => {
    const athletes = Array.from({ length: 20 }, (_, index) => ({
      athlete_id: `p${String(index + 1).padStart(2, "0")}`,
      first_name: "A",
      last_name: String(index + 1).padStart(2, "0"),
      place: index + 1,
    }));
    const stored = freezeLaneSheet(athletes);
    const livePlaces = new Map(athletes.map((athlete) => [athlete.athlete_id, 1]));
    const sheet = laneSheetFromFreeze(stored, livePlaces);
    const heatOf = (place: number) =>
      sheet.heats.find((heat) => heat.places.includes(place))?.heat;

    expect(heatOf(17)).toBe(heatOf(18));
    expect(heatOf(19)).toBe(heatOf(20));
    expect(sheet.cutoff_after_heat).toBe(heatOf(19));
    expect(heatOf(18)).toBe((sheet.cutoff_after_heat ?? 0) + 1);
    expect(sheet.cutoff_after_heat).not.toBe(heatOf(18));
    expect(sheet.cutoff_after_heat).not.toBe(heatOf(16));
    expect(sheet.heats.flatMap((heat) => heat.places)).toContain(18);
    expect(livePlaces.get("p18")).toBe(1);
    const frozenPlace = sheet.heats
      .flatMap((heat) => heat.athlete_ids.map((id, index) => ({ id, place: heat.places[index] })))
      .find((row) => row.id === "p18");
    expect(frozenPlace?.place).toBe(18);
  });
});
