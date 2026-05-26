import { supabase } from '/lib/supabase.js';
import { path } from '../src/data/path.js';
import { towerLocations } from '../src/data/towerLocations.js';
import { Archer } from '../src/classes/Archer.js';
import { Knight } from '../src/classes/Knight.js';
import { Tower } from '../src/classes/Tower.js';
import { Unit } from '../src/classes/Unit.js';

const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const playerStats = {};

let wave1Data = null;
try {
  wave1Data = JSON.parse(sessionStorage.getItem('wave1Siege') || 'null');
} catch {
  wave1Data = null;
}

const towers = [];
let attackUnits = [];
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;
let mapLoaded = false;

const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

const SIEGE_ID = (wave1Data && wave1Data.id)
  ? String(wave1Data.id)
  : sessionStorage.getItem('wave1SiegeId');

let posChannel = null;

let hostId = null;
let allyId = null;
let hostName = "Host";
let allyName = "Ally";

const loadSiegeOwners = async () => {
  if (!SIEGE_ID) return;

  const { data, error } = await supabase
    .from('sieges')
    .select('host_id, ally_id')
    .eq('id', SIEGE_ID)
    .maybeSingle();

  if (!error && data) {
    hostId = data.host_id || null;
    allyId = data.ally_id || null;
  }
};

const loadPlayerNames = async () => {
  const ids = [hostId, allyId].filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name, username')
    .in('user_id', ids);

  if (error || !data) return;

  const hostProfile = data.find(p => p.user_id === hostId);
  const allyProfile = data.find(p => p.user_id === allyId);

  hostName = hostProfile?.full_name || hostProfile?.username || "Host";
  allyName = allyProfile?.full_name || allyProfile?.username || "Ally";
};

const ensurePlayerStat = (playerId) => {
  if (!playerId) return;
  if (!playerStats[playerId]) {
    playerStats[playerId] = { gold: 0 };
  }
};

const getDisplayLabels = () => {
  const isHostUser = user.id === hostId;

  const myName = isHostUser ? hostName : allyName;
  const otherName = isHostUser ? allyName : hostName;

  const myId = user.id;
  const otherId = isHostUser ? allyId : hostId;

  return { myName, otherName, myId, otherId };
};

const getPathStart = () => ({ x: path[0].x, y: path[0].y });

const addGold = (amount) => {
  if (!amount) return;
  ensurePlayerStat(user.id);
  playerStats[user.id].gold += amount;
  syncGoldDisplays();
};

const syncGoldDisplays = () => {
  const { myName, otherName, myId, otherId } = getDisplayLabels();

  const myGold = playerStats[myId]?.gold || 0;
  const otherGold = playerStats[otherId]?.gold || 0;

  const goldDisplay = document.getElementById("goldDisplay");
  const otherGoldDisplay = document.getElementById("otherGoldDisplay");

  if (goldDisplay) goldDisplay.innerText = `${myName}: ${myGold}`;
  if (otherGoldDisplay) otherGoldDisplay.innerText = `${otherName}: ${otherGold}`;
};

window.addGold = addGold;

window.awardTowerReward = async (winnerId, amount) => {
  if (!winnerId || !amount) return;

  // Host is the single authority for rewards
  if (user.id !== hostId) return;

  ensurePlayerStat(winnerId);
  playerStats[winnerId].gold += amount;

  console.log(
    "Tower reward winner:",
    winnerId,
    "hostId:",
    hostId,
    "allyId:",
    allyId,
    "amount:",
    amount
  );

  syncGoldDisplays();

  // Persist once from host
  await supabase.rpc('increment_points', {
    user_id_input: winnerId,
    amount_input: amount
  });

  // Broadcast to the other client so both UIs stay in sync
  if (posChannel) {
    await posChannel.send({
      type: 'broadcast',
      event: 'tower-reward',
      payload: {
        winnerId: winnerId,
        amount: amount
      }
    });
  }
};

const initialiseTowers = () => {
  towers.length = 0;
  for (let location of towerLocations) {
    towers.push(new Tower(location, gameCanvas));
  }
};

const showEndScreen = () => {
  const panelText = document.getElementById("results");

  const hostGold = playerStats[hostId]?.gold || 0;
  const allyGold = playerStats[allyId]?.gold || 0;

  panelText.innerHTML = `
    <strong>${hostName}</strong>: ${hostGold} gold<br/>
    <strong>${allyName}</strong>: ${allyGold} gold
  `;

  document.getElementById("endScreen").style.display = "flex";
};

const checkWinCondition = () => {
  if (towers.length === 0 && !gameFinished) {
    gameFinished = true;

    cancelAnimationFrame(animationId);

    // ✅ Give time for final reward sync
    setTimeout(() => {
      showEndScreen();
    }, 300);
  }
};

const unitFactory = (unitType, ownerIdOverride = null, teamOverride = null) => {
  const t = String(unitType || '').toLowerCase();
  const start = getPathStart();

  let u;
  if (t === "archer") u = new Archer(start, gameCanvas);
  else if (t === "knight") u = new Knight(start, gameCanvas);
  else if (t === "unit") u = new Unit(start, gameCanvas);
  else u = new Unit(start, gameCanvas);

  u.ownerId = ownerIdOverride || user.id;
  u.team = teamOverride || null;
  u.pathRef = path;

  return u;
};

const createUnitFromId = (unitId, position, laneOffset, ownerIdOverride = null, teamOverride = null) => {
  const id = String(unitId || '').toLowerCase();

  let unit;
  if (id === "archer") unit = new Archer(position, gameCanvas);
  else if (id === "knight") unit = new Knight(position, gameCanvas);
  else unit = new Unit(position, gameCanvas);

  unit.laneOffset = (typeof laneOffset === "number") ? laneOffset : 0;
  unit.pathRef = path;
  unit.ownerId = ownerIdOverride || user.id;
  unit.team = teamOverride || null;

  return unit;
};

const pathStartDirection = () => {
  const p0 = path[0];
  const p1 = path[1] || path[0];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};

const spawnWaveQueues = () => {
  if (!wave1Data) return;

  const hostQueue = wave1Data.host_wave1 || [];
  let allyQueue = wave1Data.ally_wave1 || [];

  // Solo/dev fallback only if ally queue is empty
  if (!allyQueue.length) {
    allyQueue = [...hostQueue];
  }

  const spawnGap = 300;
  const spacing = 10;
  const dir = pathStartDirection();

  // Important: by the time this runs, hostId/allyId must already be loaded
  const hostOwner = hostId || user.id;
  const allyOwner = allyId || user.id;

  hostQueue.forEach((unitId, i) => {
    setTimeout(() => {
      const pos = { x: path[0].x, y: path[0].y };
      const unit = createUnitFromId(unitId, pos, -14, hostOwner, "host");
      unit.position.x -= dir.x * (i * spacing);
      unit.position.y -= dir.y * (i * spacing);
      attackUnits.push(unit);
    }, i * spawnGap);
  });

  allyQueue.forEach((unitId, i) => {
    setTimeout(() => {
      const pos = { x: path[0].x, y: path[0].y };
      const unit = createUnitFromId(unitId, pos, 14, allyOwner, "ally");
      unit.position.x -= dir.x * (i * spacing);
      unit.position.y -= dir.y * (i * spacing);
      attackUnits.push(unit);
    }, i * spawnGap);
  });
};

const handleUnitCreated = (msg) => {
  const payload = msg && msg.payload ? msg.payload : null;
  if (!payload) return;
  if (payload.clientId === user.id) return;

  const teamGuess = (allyId && payload.clientId === allyId) ? "ally" : "host";
  const remoteUnit = unitFactory(payload.type, payload.clientId, teamGuess);
  attackUnits.push(remoteUnit);
};

const handleTowerReward = (msg) => {
  const payload = msg?.payload;
  if (!payload) return;

  const { winnerId, amount } = payload;
  if (!winnerId || !amount) return;

  // Host already applied reward locally, so only non-host clients should apply the broadcast
  if (user.id === hostId) return;

  ensurePlayerStat(winnerId);
  playerStats[winnerId].gold += amount;

  console.log("Received tower reward:", winnerId, amount);

  syncGoldDisplays();
};

const initRealtime = async () => {
  if (!SIEGE_ID) return;

  posChannel = supabase.channel(`game-${SIEGE_ID}`);

  posChannel.on('broadcast', { event: 'unit-created' }, (msg) => {
    handleUnitCreated(msg);
  });

  posChannel.on('broadcast', { event: 'tower-reward' }, (msg) => {
    handleTowerReward(msg);
  });

  await posChannel.subscribe();
};

const deployUnit = () => {
  if (!mapLoaded) {
    alert("Map is still loading. Try again in a moment.");
    return;
  }

  const selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;
  if (!selectedUnitType) {
    alert("Select a unit first!");
    return;
  }

  const newUnit = unitFactory(selectedUnitType, user.id, "host");
  attackUnits.push(newUnit);

  const unitId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  if (posChannel) {
    posChannel.send({
      type: 'broadcast',
      event: 'unit-created',
      payload: {
        unitId: unitId,
        clientId: user.id,
        type: String(selectedUnitType || '').toLowerCase()
      }
    });
  }
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  if (!mapLoaded) return;

  gameCanvas.drawImage(backgroundImage, 0, 0);

  for (let i = 0; i < attackUnits.length && towers.length && !gameFinished; i++) {
    const unit = attackUnits[i];
    const tower = towers[0];

    if (!unit || !tower) continue;

    const dx = tower.centre.x - unit.centre.x;
    const dy = tower.centre.y - unit.centre.y;
    const distance = Math.hypot(dx, dy);

    if (!tower.isDead && distance <= unit.attackRadius) {
      unit.target = tower;
    } else {
      if (tower.isDead) {
        towers.shift();
        towersDestroyedCount++;
        checkWinCondition();
      }
      unit.target = null;
    }
  }

  attackUnits = attackUnits.filter(u => !u.isDead);

  attackUnits.forEach(unit => {
    unit.updateFrame();
  });

  towers.forEach(tower => {
    const target = attackUnits.find(u => !u.isDead);
    tower.updateFrame(target);
  });
};

const autoStartGame = () => {
  if (!wave1Data) return;

  gameFinished = false;
  towersDestroyedCount = 0;
  attackUnits = [];

  spawnWaveQueues();
};

const startGame = () => {
  if (!mapLoaded) return;
  if (wave1Data) {
    autoStartGame();
  }
};

const nextWave = () => {
  location.reload();
};

const backgroundImage = new Image();

backgroundImage.onload = () => {
  mapLoaded = true;

  initialiseTowers();

  gameCanvas.drawImage(backgroundImage, 0, 0);
  towers.forEach(t => t.render());

  if (wave1Data) {
    autoStartGame();
  }

  if (!animationId) {
    animate();
  }
};

// IMPORTANT: load owners/names/stats FIRST, then start image/game
await loadSiegeOwners();
await loadPlayerNames();

if (hostId) {
  playerStats[hostId] = { gold: 0 };
}
if (allyId) {
  playerStats[allyId] = { gold: 0 };
}

syncGoldDisplays();
await initRealtime();

const mapSrc = (wave1Data && wave1Data.map_src)
  ? wave1Data.map_src
  : "/assets/maps/calista-map.png";

backgroundImage.src = mapSrc;

window.deployUnit = deployUnit;
window.startGame = startGame;
window.nextWave = nextWave;