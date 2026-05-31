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

let wave1Data = null;
try {
  wave1Data = JSON.parse(sessionStorage.getItem('wave1Siege') || 'null');
} catch {
  wave1Data = null;
}

let towers = [];
let attackUnits = [];
let playerGold = 0;
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

const getPathStart = () => ({ x: path[0].x, y: path[0].y });

const addGold = (amount) => {
  playerGold += amount;
  const goldDisplay = document.getElementById("goldDisplay");
  if (goldDisplay) {
    goldDisplay.innerText = "Gold: " + playerGold;
  }
};

window.addGold = addGold;

window.awardTowerReward = async (winnerId, amount) => {
  if (!winnerId || !amount) return;

  // Only the winning player's own client should persist the reward.
  // This avoids both clients writing the same tower reward to the DB.
  if (winnerId !== user.id) return;

  addGold(amount);

  await supabase.rpc('increment_points', {
    user_id_input: winnerId,
    amount_input: amount
  });
};

const initialiseTowers = () => {
  towers.length = 0;
  for (let location of towerLocations) {
    towers.push(new Tower(location, gameCanvas));
  }
};

const showEndScreen = () => {
  document.getElementById("goldEarned").innerText = "Gold Earned: " + playerGold;
  document.getElementById("towersDestroyed").innerText = "Towers Destroyed: " + towersDestroyedCount;
  document.getElementById("unitsLost").innerText = "Units Lost: 0";
  document.getElementById("endScreen").style.display = "flex";
};

const checkWinCondition = () => {
  if (towers.length === 0 && !gameFinished) {
    gameFinished = true;

    addGold(100);

    cancelAnimationFrame(animationId);
    showEndScreen();
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

  // Dev mode fallback so one player can still test both lanes
  if (!allyQueue.length) {
    allyQueue = [...hostQueue];
  }

  const spawnGap = 220;
  const spacing = 10;
  const dir = pathStartDirection();

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

const initRealtime = async () => {
  if (!SIEGE_ID) return;

  posChannel = supabase.channel(`game-${SIEGE_ID}`);
  posChannel.on('broadcast', { event: 'unit-created' }, (msg) => {
    handleUnitCreated(msg);
  }).subscribe();
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
    const tower = towers.find(t => !t.isDead);

    if (!unit || !tower) continue;

    const dx = tower.centre.x - unit.centre.x;
    const dy = tower.centre.y - unit.centre.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= unit.attackRadius) {
      unit.target = tower;
    } else {
      unit.target = null;
    }
  }

  attackUnits = attackUnits.filter(u => !u.isDead);

  attackUnits.forEach(unit => {
    unit.updateFrame();
  });

  towers.forEach(tower => {
    tower.updateFrame(attackUnits);
  });

  let anyTowerRemoved = false;

  towers = towers.filter(tower => {
    if (tower.isDead) {
      towersDestroyedCount++;
      anyTowerRemoved = true;
      return false;
    }
    return true;
  });

  if (anyTowerRemoved) {
    checkWinCondition();
  }
};

const autoStartGame = () => {
  if (!wave1Data) return;

  playerGold = 0;
  towersDestroyedCount = 0;
  gameFinished = false;
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

const mapSrc = (wave1Data && wave1Data.map_src)
  ? wave1Data.map_src
  : "/assets/maps/calista-map.png";

backgroundImage.src = mapSrc;

await loadSiegeOwners();
await initRealtime();

window.deployUnit = deployUnit;
window.startGame = startGame;
window.nextWave = nextWave;
