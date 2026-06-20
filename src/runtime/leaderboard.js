/* =========================================================
   BATTLE LEADERBOARD STATE
   Tracks current wave + deaths by team during a match
   ========================================================= */

export const leaderboardState = {
  wave: 1,
  host: {
    label: 'HOST',
    unitDeaths: 0,
    points: 0,
  },
  ally: {
    label: 'ALLY',
    unitDeaths: 0,
    points: 0,
  },
};

// Points awarded on the in-battle board for landing the killing blow on a
// tower. Mirrors the persisted award in award_tower_points() (migration 015).
export const TOWER_KILL_POINTS = 10;

export const resetLeaderboard = () => {
  leaderboardState.wave = 1;
  leaderboardState.host.unitDeaths = 0;
  leaderboardState.ally.unitDeaths = 0;
  leaderboardState.host.points = 0;
  leaderboardState.ally.points = 0;
};

export const setLeaderboardNames = ({ hostName, allyName } = {}) => {
  if (hostName) leaderboardState.host.label = String(hostName).toUpperCase();
  if (allyName) leaderboardState.ally.label = String(allyName).toUpperCase();
};

export const setCurrentWave = (waveNumber) => {
  leaderboardState.wave = Math.max(1, Number(waveNumber) || 1);
};

// Seed the board from each side's PERSISTED tower-kill score (profiles
// .tower_points), so the battle leaderboard survives a refresh instead of
// resetting to 0. Live tower kills then keep incrementing it via
// creditTowerPoints, and the award_tower_points RPC persists the same amount.
export const setLeaderboardPoints = ({ hostPoints, allyPoints } = {}) => {
  if (Number.isFinite(hostPoints)) leaderboardState.host.points = hostPoints;
  if (Number.isFinite(allyPoints)) leaderboardState.ally.points = allyPoints;
};

export const creditUnitDeath = (team) => {
  if (team === 'host' || team === 'ally') {
    leaderboardState[team].unitDeaths += 1;
  }
};

// Landing the killing blow on a tower earns TOWER_KILL_POINTS on the board.
export const creditTowerPoints = (team) => {
  if (team === 'host' || team === 'ally') {
    leaderboardState[team].points += TOWER_KILL_POINTS;
  }
};

export const getLeaderboardRows = () => {
  const rows = [
    {
      side: 'host',
      name: leaderboardState.host.label,
      points: leaderboardState.host.points,
    },
    {
      side: 'ally',
      name: leaderboardState.ally.label,
      points: leaderboardState.ally.points,
    },
  ];

  // More points = better rank
  rows.sort((a, b) => b.points - a.points);

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
};