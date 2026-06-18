/* ═══════════════════════════════════════════════
   STONE TOWER MATCHUPS
   At match start every stone tower (collectively, as the "stone tower
   type") rolls a random set of unit types it is WEAK to and RESISTS.
   The roll is deterministic — seeded from siege.id — so both players
   compute the identical table without any DB round-trip.

   "Weak to X"  → X deals MORE damage to the tower (×1.5) and the tower
                  deals LESS damage to X (×0.6).
   "Resists Y"  → Y deals LESS damage to the tower (×0.6) and the tower
                  deals MORE damage to Y (×1.5).

   Dependency-free on purpose: Tower.js imports this, and Tower.js is
   pulled into the jest/node test runner where browser-absolute import
   paths (/lib/...) can't resolve. battle.js feeds it the unit-id list.
   ═══════════════════════════════════════════════ */

const STRONG = 1.5; // advantaged side multiplier
const WEAK = 0.6; // disadvantaged side multiplier

// unitType -> 'weak' | 'resist'. Empty until initTowerMatchups runs, so
// everything reads as neutral (×1) before a match is set up or in tests.
let matchupTable = new Map();
let summary = { weakTo: [], resists: [] };

// FNV-1a string hash → 32-bit seed for the PRNG.
const hashString = (str) => {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

// mulberry32 — small, fast, deterministic PRNG.
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Build the stone-tower matchup table. `seed` is any stable string
// (siege.id); `unitIds` is the full catalog id list. Picks `weakCount`
// weaknesses and `resistCount` resistances; the rest stay neutral.
export const initTowerMatchups = (
  seed,
  unitIds,
  { weakCount = 3, resistCount = 3 } = {},
) => {
  matchupTable = new Map();
  summary = { weakTo: [], resists: [] };

  const ids = Array.isArray(unitIds) ? unitIds.slice() : [];
  if (ids.length === 0) return getTowerMatchupSummary();

  const rng = mulberry32(hashString(seed || "siege"));

  // Seeded Fisher–Yates shuffle, then slice off the weak / resist sets.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  const weakTo = ids.slice(0, weakCount);
  const resists = ids.slice(weakCount, weakCount + resistCount);

  weakTo.forEach((id) => matchupTable.set(id, "weak"));
  resists.forEach((id) => matchupTable.set(id, "resist"));
  summary = { weakTo, resists };

  return getTowerMatchupSummary();
};

export const getMatchupCategory = (unitType) =>
  matchupTable.get(unitType) || "neutral";

// Multiplier on damage a unit of this type DEALS to a stone tower.
export const damageToTowerMultiplier = (unitType) => {
  const c = matchupTable.get(unitType);
  if (c === "weak") return STRONG; // tower weak to it → it hits harder
  if (c === "resist") return WEAK; // tower resists it → it hits softer
  return 1;
};

// Multiplier on damage a stone tower DEALS to a unit of this type.
export const damageFromTowerMultiplier = (unitType) => {
  const c = matchupTable.get(unitType);
  if (c === "weak") return WEAK; // tower weak to it → tower hits it softly
  if (c === "resist") return STRONG; // tower resists it → tower hits it hard
  return 1;
};

export const getTowerMatchupSummary = () => ({
  weakTo: summary.weakTo.slice(),
  resists: summary.resists.slice(),
});
