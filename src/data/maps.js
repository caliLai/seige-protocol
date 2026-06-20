/* ═══════════════════════════════════════════════
   MAP SEQUENCE
   A siege run marches through these maps in order. Clearing every tower
   on a map within the wave (lives) limit advances to the next map; clearing
   the LAST map wins the run. Each map carries the unit road `path` that
   matches its background art, plus the pool of tower PNG types that may
   spawn on it (see src/classes/Tower.js for how type → strength scales).

   Tower POSITIONS are generated procedurally per run (seeded from siege.id)
   in battle.js — the `towers` arrays here are only a deterministic fallback.
   ═══════════════════════════════════════════════ */

// Road waypoints below were traced from the actual brown-tile roads in each
// map PNG (left edge → right edge). See the analysis tooling notes in the PR;
// re-trace if the map art changes.

// ── CALISTA (map 1) ───────────────────────────
const calistaPath = [
  { x: -98, y: 547 }, { x: 5, y: 485 }, { x: 55, y: 455 }, { x: 135, y: 455 },
  { x: 195, y: 395 }, { x: 205, y: 225 }, { x: 265, y: 165 }, { x: 395, y: 165 },
  { x: 455, y: 225 }, { x: 465, y: 305 }, { x: 535, y: 375 }, { x: 565, y: 375 },
  { x: 705, y: 545 }, { x: 875, y: 545 }, { x: 935, y: 485 }, { x: 935, y: 365 },
  { x: 1015, y: 285 }, { x: 1115, y: 285 }, { x: 1235, y: 285 },
];

// ── ARSHDEEP (map 2) ──────────────────────────
const arshdeepPath = [
  { x: -114, y: 502 }, { x: 5, y: 515 }, { x: 95, y: 525 }, { x: 145, y: 475 },
  { x: 145, y: 285 }, { x: 195, y: 235 }, { x: 295, y: 235 }, { x: 385, y: 145 },
  { x: 475, y: 145 }, { x: 525, y: 195 }, { x: 525, y: 315 }, { x: 475, y: 365 },
  { x: 425, y: 365 }, { x: 375, y: 415 }, { x: 375, y: 475 }, { x: 425, y: 525 },
  { x: 735, y: 525 }, { x: 785, y: 475 }, { x: 785, y: 315 }, { x: 835, y: 265 },
  { x: 1115, y: 265 }, { x: 1235, y: 265 },
];

// ── ERIC (map 3) ──────────────────────────────
const ericPath = [
  { x: -113, y: 156 }, { x: 5, y: 135 }, { x: 225, y: 95 }, { x: 325, y: 115 },
  { x: 405, y: 185 }, { x: 405, y: 285 }, { x: 365, y: 325 }, { x: 165, y: 305 },
  { x: 125, y: 345 }, { x: 145, y: 475 }, { x: 185, y: 515 }, { x: 265, y: 545 },
  { x: 415, y: 525 }, { x: 445, y: 555 }, { x: 605, y: 555 }, { x: 745, y: 435 },
  { x: 905, y: 265 }, { x: 995, y: 235 }, { x: 1115, y: 235 }, { x: 1235, y: 235 },
];

// Ordered run sequence. Index 0 is always the first map of a fresh siege.
export const MAP_SEQUENCE = [
  {
    key: "calista",
    name: "CALISTA",
    background: "/assets/maps/calista-map.png",
    path: calistaPath,
    // Tower PNG types (assets/Tower/PNG/<n>.png) that may spawn here. Higher
    // number = stronger (more HP / damage / resistance). See Tower.js.
    towerTypes: [3, 6, 7, 12],
    // Deterministic fallback positions (used until Phase-3 procedural
    // placement replaces them). Roughly hug the sides of `path`.
    towers: [
      { x: 319, y: 264 }, { x: 518, y: 257 }, { x: 69, y: 477 },
      { x: 228, y: 449 }, { x: 643, y: 414 }, { x: 744, y: 549 },
      { x: 803, y: 260 },
    ],
  },
  {
    key: "arshdeep",
    name: "ARSHDEEP",
    background: "/assets/maps/arshdeep-map.png",
    path: arshdeepPath,
    towerTypes: [13, 14, 15, 16],
    towers: [
      { x: 200, y: 170 }, { x: 440, y: 80 }, { x: 620, y: 300 },
      { x: 960, y: 200 }, { x: 680, y: 460 }, { x: 280, y: 430 },
      { x: 60, y: 340 }, { x: 360, y: 630 },
    ],
  },
  {
    key: "eric",
    name: "ERIC",
    background: "/assets/maps/eric-map.png",
    path: ericPath,
    towerTypes: [17, 24, 26, 25],
    towers: [
      { x: 80, y: 240 }, { x: 200, y: 80 }, { x: 480, y: 160 },
      { x: 630, y: 400 }, { x: 900, y: 220 }, { x: 300, y: 380 },
      { x: 900, y: 500 },
    ],
  },
];

export const MAP_COUNT = MAP_SEQUENCE.length;

// Clamp an index to a valid map (defensive against a stale/over-large
// map_index from the siege row).
export const getMapByIndex = (index) => {
  const i = Math.max(0, Math.min(MAP_COUNT - 1, Number(index) || 0));
  return MAP_SEQUENCE[i];
};

export const isLastMap = (index) => (Number(index) || 0) >= MAP_COUNT - 1;
