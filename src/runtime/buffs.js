/* ═══════════════════════════════════════════════
   RUN BUFFS
   Reward buffs picked from the tower-destruction popup. Each buff boosts ONE
   stat (hp / damage / speed) of ONE unit type for ONE side, and lasts for the
   whole run (until the match ends — see resetBuffs). Both clients simulate
   both sides' units, so buff picks are broadcast over the realtime channel and
   applied on BOTH clients, keeping the two sims in lockstep.
   ═══════════════════════════════════════════════ */

export const runBuffs = { host: [], ally: [] };

export const resetBuffs = () => {
  runBuffs.host = [];
  runBuffs.ally = [];
};

// buff = { unitType, stat: 'hp'|'damage'|'speed', mult, label }
export const addBuff = (side, buff) => {
  if (side !== "host" && side !== "ally") return;
  if (!buff || !buff.unitType || !buff.stat || !buff.mult) return;
  runBuffs[side].push({
    unitType: buff.unitType,
    stat: buff.stat,
    mult: Number(buff.mult),
    label: buff.label || "",
  });
};

// Combined multipliers for a unit of `unitType` on `side`.
export const buffMultipliers = (side, unitType) => {
  const m = { hp: 1, damage: 1, speed: 1 };
  for (const b of runBuffs[side] || []) {
    if (b.unitType !== unitType) continue;
    if (b.stat in m) m[b.stat] *= b.mult;
  }
  return m;
};

// Apply the side's active buffs to a freshly-spawned unit. Call AFTER both
// unit.team and unit.unitType are set.
export const applyBuffsToUnit = (unit) => {
  if (!unit) return;
  const m = buffMultipliers(unit.team, unit.unitType);
  if (m.hp !== 1) {
    unit.maxHealth = Math.round(unit.maxHealth * m.hp);
    unit.health = unit.maxHealth;
  }
  if (m.damage !== 1 && typeof unit.attackStrength === "number") {
    unit.attackStrength = Math.round(unit.attackStrength * m.damage);
  }
  if (m.speed !== 1 && typeof unit.moveSpeedPxPerSecond === "number") {
    unit.moveSpeedPxPerSecond = Math.round(unit.moveSpeedPxPerSecond * m.speed);
  }
};
