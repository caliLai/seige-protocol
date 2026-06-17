// ═══════════════════════════════════════════════
// MAPS — All map data in one place
// ═══════════════════════════════════════════════


// ── LEVEL 1 (CALISTA) ─────────────────────────

// Path (merged from path.js)
const path1 = [
  { x: -100, y: 153 },
  { x: 38, y: 141 },
  { x: 140, y: 104 },
  { x: 204, y: 97 },
  { x: 308, y: 106 },
  { x: 380, y: 158 },
  { x: 406, y: 237 },
  { x: 394, y: 313 },
  { x: 354, y: 341 },
  { x: 288, y: 320 },
  { x: 177, y: 297 },
  { x: 128, y: 300 },
  { x: 109, y: 338 },
  { x: 125, y: 413 },
  { x: 149, y: 466 },
  { x: 174, y: 520 },
  { x: 297, y: 562 },
  { x: 381, y: 521 },
  { x: 510, y: 563 },
  { x: 610, y: 560 },
  { x: 710, y: 470 },
  { x: 815, y: 365 },
  { x: 946, y: 242 },
  { x: 1252, y: 240 },
];

// Keep EXACT tower positions (your current level design)
const towers1 = [
  { x: 319, y: 264 },
  { x: 518, y: 257 },
  { x: 69, y: 477 },
  { x: 228, y: 449 },
  { x: 643, y: 414 },
  { x: 744, y: 549 },
  { x: 803, y: 260 }
];


// ── LEVEL 2 (ERIC MAP) ─────────────────────────

const pathCalista2 = [
  { x: -100, y: 441 },
  { x: 14, y: 441 },
  { x: 135, y: 439 },
  { x: 175, y: 419 },
  { x: 168, y: 282 },
  { x: 165, y: 227 },
  { x: 175, y: 182 },
  { x: 235, y: 155 },
  { x: 344, y: 146 },
  { x: 387, y: 187 },
  { x: 398, y: 292 },
  { x: 405, y: 359 },
  { x: 480, y: 362 },
  { x: 546, y: 402 },
  { x: 550, y: 517 },
  { x: 600, y: 530 },
  { x: 728, y: 542 },
  { x: 790, y: 528 },
  { x: 801, y: 424 },
  { x: 812, y: 294 },
  { x: 846, y: 284 },
  { x: 925, y: 282 },
  { x: 1005, y: 285 },
  { x: 1058, y: 291 },
  { x: 1100, y: 292 },
  { x: 1252, y: 292 }
];

const towersCalista2 = [
  { x: 80, y: 240 },
  { x: 200, y: 80 },
  { x: 480, y: 160 },
  { x: 630, y: 400 },
  { x: 900, y: 220 },
  { x: 300, y: 380 },
  { x: 900, y: 500 }
];


// ── LEVEL 3 (ARSHDEEP MAP / CANYON) ───────────

const path2 = [
  { x: -100, y: 519 },
  { x: 1, y: 519 },
  { x: 118, y: 532 },
  { x: 139, y: 507 },
  { x: 139, y: 364 },
  { x: 137, y: 285 },
  { x: 182, y: 252 },
  { x: 283, y: 237 },
  { x: 343, y: 164 },
  { x: 385, y: 141 },
  { x: 500, y: 142 },
  { x: 533, y: 262 },
  { x: 530, y: 346 },
  { x: 382, y: 371 },
  { x: 373, y: 434 },
  { x: 383, y: 516 },
  { x: 468, y: 532 },
  { x: 582, y: 542 },
  { x: 715, y: 528 },
  { x: 789, y: 514 },
  { x: 775, y: 407 },
  { x: 780, y: 342 },
  { x: 789, y: 285 },
  { x: 826, y: 271 },
  { x: 905, y: 269 },
  { x: 993, y: 262 },
  { x: 1062, y: 269 },
  { x: 1112, y: 264 },
  { x: 1252, y: 264 }
];

const towers2 = [
  { x: 200, y: 170 },
  { x: 440, y: 80 },
  { x: 620, y: 300 },
  { x: 960, y: 200 },
  { x: 680, y: 460 },
  { x: 280, y: 430 },
  { x: 60, y: 340 },
  { x: 360, y: 630 }
];


// ── MAP REGISTRY ──────────────────────────────

export const MAPS = {
  calista: {
    background: "/assets/maps/calista-map.png",
    path: path1,
    towers: towers1,
    drawGeneratedTowers: true,
  },

  calista_level2: {
    background: "/assets/maps/eric.png",
    path: pathCalista2,
    towers: towersCalista2,
    drawGeneratedTowers: true,
  },

  canyon: {
    background: "/assets/maps/arshdeep-map.png",
    path: path2,
    towers: towers2,
    drawGeneratedTowers: true,
  },

  // SAFE fallback (prevents crash if reached)
  fortress: {
    background: "/assets/maps/arshdeep-map.png",
    path: path2,
    towers: towers2,
    drawGeneratedTowers: true,
  }
};


// ── WAVE → MAP LOGIC ─────────────────────────

export const getMapKeyForWave = (wave) => {
  if (wave === 1) return "calista";
  if (wave === 2) return "calista_level2";
  if (wave === 3) return "canyon";
  return "fortress";
};


// ── MAIN MAP ACCESS ──────────────────────────

export const getMap = (input) => {
  if (typeof input === "string") {
    return MAPS[input];
  }

  const key = getMapKeyForWave(input);
  return MAPS[key];
};