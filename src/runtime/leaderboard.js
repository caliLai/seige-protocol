/* =========================================================
   BATTLE LEADERBOARD STATE
   Tracks current wave + deaths by team during a match
   ========================================================= */

export const leaderboardState = {
  wave: 1,
  host: {
    label: 'HOST',
    unitDeaths: 0,
  },
  ally: {
    label: 'ALLY',
    unitDeaths: 0,
  },
};

export const resetLeaderboard = () => {
  leaderboardState.wave = 1;
  leaderboardState.host.unitDeaths = 0;
  leaderboardState.ally.unitDeaths = 0;
};

export const setLeaderboardNames = ({ hostName, allyName } = {}) => {
  if (hostName) leaderboardState.host.label = String(hostName).toUpperCase();
  if (allyName) leaderboardState.ally.label = String(allyName).toUpperCase();
};

export const setCurrentWave = (waveNumber) => {
  leaderboardState.wave = Math.max(1, Number(waveNumber) || 1);
};

export const creditUnitDeath = (team) => {
  if (team === 'host' || team === 'ally') {
    leaderboardState[team].unitDeaths += 1;
  }
};

export const getLeaderboardRows = () => {
  const rows = [
    {
      side: 'host',
      name: leaderboardState.host.label,
      unitDeaths: leaderboardState.host.unitDeaths,
    },
    {
      side: 'ally',
      name: leaderboardState.ally.label,
      unitDeaths: leaderboardState.ally.unitDeaths,
    },
  ];

  // Fewer deaths = better rank
  rows.sort((a, b) => a.unitDeaths - b.unitDeaths);

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
};