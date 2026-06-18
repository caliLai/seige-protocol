import {
  initTowerMatchups,
  getMatchupCategory,
  damageToTowerMultiplier,
  damageFromTowerMultiplier,
  getTowerMatchupSummary,
} from "../src/runtime/towerMatchups.js";

const UNIT_IDS = [
  "Soldier", "Archer", "Slime", "Swordsman", "Orc", "Skeleton",
  "Skeleton Archer", "Armored Axeman", "Knight", "Lancer", "Priest",
  "Wizard", "Armored Skeleton", "Greatsword Skeleton", "Armored Orc",
  "Knight Templar", "Elite Orc", "Orc rider", "Werebear", "Werewolf",
];

describe("tower matchups", () => {
  test("rolls 3 weaknesses and 3 resistances, all distinct", () => {
    const { weakTo, resists } = initTowerMatchups("siege-abc", UNIT_IDS);
    expect(weakTo).toHaveLength(3);
    expect(resists).toHaveLength(3);
    const all = [...weakTo, ...resists];
    expect(new Set(all).size).toBe(6); // no overlaps
  });

  test("is deterministic for the same seed", () => {
    const a = initTowerMatchups("siege-xyz", UNIT_IDS);
    const b = initTowerMatchups("siege-xyz", UNIT_IDS);
    expect(b).toEqual(a);
  });

  test("differs across seeds", () => {
    const a = initTowerMatchups("seed-1", UNIT_IDS);
    const b = initTowerMatchups("seed-2", UNIT_IDS);
    expect(b).not.toEqual(a);
  });

  test("multipliers reflect the rolled categories (both directions)", () => {
    const { weakTo, resists } = initTowerMatchups("siege-abc", UNIT_IDS);
    const weak = weakTo[0];
    const resist = resists[0];

    expect(getMatchupCategory(weak)).toBe("weak");
    expect(damageToTowerMultiplier(weak)).toBeGreaterThan(1); // hits tower harder
    expect(damageFromTowerMultiplier(weak)).toBeLessThan(1); // tower hits it softer

    expect(getMatchupCategory(resist)).toBe("resist");
    expect(damageToTowerMultiplier(resist)).toBeLessThan(1);
    expect(damageFromTowerMultiplier(resist)).toBeGreaterThan(1);
  });

  test("neutral / unknown units take and deal normal damage", () => {
    initTowerMatchups("siege-abc", UNIT_IDS);
    expect(damageToTowerMultiplier("NotARealUnit")).toBe(1);
    expect(damageFromTowerMultiplier("NotARealUnit")).toBe(1);
  });

  test("empty roll leaves everything neutral", () => {
    initTowerMatchups("seed", []);
    expect(getTowerMatchupSummary()).toEqual({ weakTo: [], resists: [] });
    expect(damageToTowerMultiplier("Archer")).toBe(1);
  });
});
