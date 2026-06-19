/* ═══════════════════════════════════════════════
   UNIT CATALOG — single source of truth
   Read by roster (unlocks) and siege-setup (picks).
   ═══════════════════════════════════════════════ */

// `starter: true` means the unit is always available — those rows are not
// stored in profiles.unlocked_units. `cost` is the one-time roster-unlock
// price in profile POINTS for the rest (distinct from `deployCost` below,
// which is the per-spawn battle GOLD price during wave deployment).
// `attack` is the sprite filename suffix used for the hover-stage Attack
// preview (most use Attack01; Priest is the odd one out with just Attack).
export const UNITS = [
  { id: 'Soldier',             cost: 0,   starter: true, hp: 100, damage: 15, speed: 5, attack: 'Attack01',
    desc: 'A loyal recruit, honed by drills and stale gruel.' },
  { id: 'Archer',              cost: 0,   starter: true, hp: 75,  damage: 18, speed: 6, attack: 'Attack01',
    desc: 'Strikes from afar — never seen, always feared.' },
  { id: 'Slime',               cost: 0,   starter: true, hp: 50,  damage: 8,  speed: 3, attack: 'Attack01',
    desc: 'Squishy. Loyal. Mildly corrosive on the carpet.' },
  { id: 'Swordsman',           cost: 0,   starter: true, hp: 110, damage: 20, speed: 5, attack: 'Attack01',
    desc: 'A blade for hire who learned chivalry late in life.' },
  { id: 'Orc',                 cost: 0,   starter: true, hp: 130, damage: 22, speed: 4, attack: 'Attack01',
    desc: 'Brutish, simple, and surprisingly fond of poetry.' },
  { id: 'Skeleton',            cost: 0,   starter: true, hp: 80,  damage: 14, speed: 5, attack: 'Attack01',
    desc: 'Rises again each dawn. Hates squeaky knees.' },
  { id: 'Skeleton Archer',     cost: 100, hp: 70,  damage: 20, speed: 6, attack: 'Attack',
    desc: 'Notches a fresh arrow with each missing rib.' },
  { id: 'Armored Axeman',      cost: 100, hp: 140, damage: 25, speed: 4, attack: 'Attack01',
    desc: 'Cleaves through gates and conversations alike.' },
  { id: 'Knight',              cost: 100, hp: 150, damage: 22, speed: 5, attack: 'Attack01',
    desc: 'Sworn to the realm, the lord, and a fine bottle of mead.' },
  { id: 'Lancer',              cost: 100, hp: 120, damage: 26, speed: 6, attack: 'Attack01',
    desc: 'Charges first, asks for directions never.' },
  { id: 'Priest',              cost: 100, hp: 80,  damage: 12, speed: 4, attack: 'Attack',
    desc: 'Mends the faithful, smites the wicked, files the paperwork.' },
  { id: 'Wizard',              cost: 150, hp: 70,  damage: 32, speed: 4, attack: 'Attack01',
    desc: 'Burns parchment, foes, and the occasional eyebrow.' },
  { id: 'Armored Skeleton',    cost: 200, hp: 130, damage: 20, speed: 4, attack: 'Attack01',
    desc: 'Plate over bone — clatters louder than it kills.' },
  { id: 'Greatsword Skeleton', cost: 200, hp: 140, damage: 30, speed: 3, attack: 'Attack01',
    desc: 'Swings a sword bigger than its grave was deep.' },
  { id: 'Armored Orc',         cost: 200, hp: 180, damage: 28, speed: 3, attack: 'Attack01',
    desc: 'Heavier, meaner, still terrible at chess.' },
  { id: 'Knight Templar',      cost: 250, hp: 170, damage: 28, speed: 5, attack: 'Attack01',
    desc: 'Holy zeal sharpened on a thousand campaigns.' },
  { id: 'Elite Orc',           cost: 300, hp: 200, damage: 32, speed: 4, attack: 'Attack01',
    desc: 'The biggest, baddest greenskin in the warband.' },
  { id: 'Orc rider',           cost: 350, hp: 180, damage: 30, speed: 8, attack: 'Attack01',
    desc: 'Mounted fury. The boar is angrier than the rider.' },
  { id: 'Werebear',            cost: 400, hp: 240, damage: 36, speed: 5, attack: 'Attack01',
    desc: 'By day a scholar. By moonrise, a problem.' },
  { id: 'Werewolf',            cost: 400, hp: 200, damage: 38, speed: 8, attack: 'Attack01',
    desc: 'Faster than rumour, hungrier than a tax collector.' },
];

export const UNITS_BY_ID = new Map(UNITS.map(u => [u.id, u]));

// Returns the full list of units this user has access to: starter units +
// anything they've spent gold on. Pass `profiles.unlocked_units`.
export const availableUnits = (unlocked) => {
  const set = new Set(unlocked || []);
  return UNITS.filter(u => u.starter || set.has(u.id));
};

// Per-spawn gold cost during wave deployment. Distinct from `cost` above,
// which is the one-time roster unlock price. Derived from stats so the
// catalog stays the single source of truth — tune the formula here if the
// wave economy needs rebalancing. Starter units are intentionally cheap
// but never free, so every queued unit costs something.
export const deployCost = (unit) => {
  if (!unit) return 0;
  const raw = (unit.hp + unit.damage * 5) / 10;
  return Math.max(10, Math.round(raw / 5) * 5);
};

export const deployCostById = (unitId) => deployCost(UNITS_BY_ID.get(unitId));

// Path to the idle sprite-sheet for a given unit id. Sprite folders have
// spaces in their names (e.g. "Skeleton Archer"), which is fine in URLs as
// long as we percent-encode.
export const idleSpriteUrl = (unitId) => {
  const safe = unitId.replace(/ /g, '%20');
  return `/assets/${safe}/${safe}/${safe}-Idle.png`;
};
