/* ═══════════════════════════════════════════════
   PER-MATCH CONTRIBUTION ACCUMULATOR
   Tracks each team's damage_dealt and towers_destroyed during a
   battle. Written into siege.host_contribution / ally_contribution
   on match end (host only); award_match_points() uses it to split
   the reward pool 60/40.
   ═══════════════════════════════════════════════ */

export const contribution = {
  host: { damage_dealt: 0, towers_destroyed: 0 },
  ally: { damage_dealt: 0, towers_destroyed: 0 },
};

export const resetContribution = () => {
  contribution.host.damage_dealt = 0;
  contribution.host.towers_destroyed = 0;
  contribution.ally.damage_dealt = 0;
  contribution.ally.towers_destroyed = 0;
};

// Called from Tower.takeDamage. Guarded against unattributed hits
// (any code path that hasn't been updated to pass an attacker).
export const creditDamage = (team, amount) => {
  if (team === 'host' || team === 'ally') {
    contribution[team].damage_dealt += amount;
  }
};

export const creditTowerKill = (team) => {
  if (team === 'host' || team === 'ally') {
    contribution[team].towers_destroyed += 1;
  }
};
