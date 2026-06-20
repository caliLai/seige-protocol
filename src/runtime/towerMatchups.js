/* ═══════════════════════════════════════════════
   TOWER MATCHUPS (per tower type)
   Every tower PNG type rolls its OWN set of unit types it is WEAK to and
   RESISTS. The roll is deterministic — seeded from siege.id + the type number
   — so both clients derive identical tables for each type without any DB
   round-trip, and a type-3 tower has different weaknesses than a type-12 one.

   "Weak to X"  → X deals MORE damage to the tower (×1.5) and the tower
                  deals LESS damage to X (×0.6).
   "Resists Y"  → Y deals MUCH LESS damage to the tower (×0.3) and the
                  tower deals MORE damage to Y (×1.5).

   The towerType argument defaults to 0 so the original single-table call sites
   (and the unit tests) keep working — real towers pass their actual type.

   Dependency-free on purpose: Tower.js imports this, and Tower.js is pulled
   into the jest/node test runner where browser-absolute import paths can't
   resolve. battle.js feeds it the unit-id list.
   ═══════════════════════════════════════════════ */

const STRONG = 1.5; // advantaged side multiplier
const WEAK = 0.6; // disadvantaged side multiplier
// Incoming damage a tower takes from units it RESISTS — lower than WEAK so
// resisted units chip it down much more slowly.
const RESIST_DAMAGE_TAKEN = 0.3;

let seedBase = "siege";
let unitCatalog = [];
let weakCfg = 3;
let resistCfg = 3;

// towerType → { table: Map<unitType, 'weak'|'resist'>, summary: { weakTo, resists } }
const tables = new Map();

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

// Configure the roll. `seed` is any stable string (siege.id); `unitIds` is the
// full catalog id list. Per-type tables are then built lazily on first access.
export const initTowerMatchups = (
  seed,
  unitIds,
  { weakCount = 3, resistCount = 3 } = {},
) => {
  seedBase = seed || "siege";
  unitCatalog = Array.isArray(unitIds) ? unitIds.slice() : [];
  weakCfg = weakCount;
  resistCfg = resistCount;
  tables.clear();
  // Return the default-type summary so legacy single-table callers/tests that
  // destructure the result keep working.
  return getTowerMatchupSummary(0);
};

// Build (and cache) the matchup table for one tower type, seeded uniquely per
// type so each type's weaknesses/resistances differ.
const tableFor = (towerType) => {
  const key = Number(towerType) || 0;
  const cached = tables.get(key);
  if (cached) return cached;

  const table = new Map();
  let summary = { weakTo: [], resists: [] };
  const ids = unitCatalog.slice();

  if (ids.length) {
    const rng = mulberry32(hashString(`${seedBase}:tower:${key}`));
    // Seeded Fisher–Yates shuffle, then slice off the weak / resist sets.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const weakTo = ids.slice(0, weakCfg);
    const resists = ids.slice(weakCfg, weakCfg + resistCfg);
    weakTo.forEach((id) => table.set(id, "weak"));
    resists.forEach((id) => table.set(id, "resist"));
    summary = { weakTo, resists };
  }

  const entry = { table, summary };
  tables.set(key, entry);
  return entry;
};

export const getMatchupCategory = (unitType, towerType = 0) =>
  tableFor(towerType).table.get(unitType) || "neutral";

// Multiplier on damage a unit of this type DEALS to a tower of `towerType`.
export const damageToTowerMultiplier = (unitType, towerType = 0) => {
  const c = tableFor(towerType).table.get(unitType);
  if (c === "weak") return STRONG; // tower weak to it → it hits harder
  if (c === "resist") return RESIST_DAMAGE_TAKEN; // tower resists it → much softer
  return 1;
};

// Multiplier on damage a tower of `towerType` DEALS to a unit of this type.
export const damageFromTowerMultiplier = (unitType, towerType = 0) => {
  const c = tableFor(towerType).table.get(unitType);
  if (c === "weak") return WEAK; // tower weak to it → tower hits it softly
  if (c === "resist") return STRONG; // tower resists it → tower hits it hard
  return 1;
};

export const getTowerMatchupSummary = (towerType = 0) => {
  const s = tableFor(towerType).summary;
  return { weakTo: s.weakTo.slice(), resists: s.resists.slice() };
};
