/* ═══════════════════════════════════════════════
   GAME PAGE
   Absorbs wave-1's queue/gold/ready handshake into the
   in-game HUD: both players build their wave from the
   3 unit types they locked in during siege-setup, hit
   "Lock In" → spawning begins on the canvas.
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { UNITS_BY_ID, idleSpriteUrl, deployCost, deployCostById } from '/lib/units.js';
import { path } from '/src/data/path.js';
import { towerLocations } from '/src/data/towerLocations.js';
import { Archer } from '/src/classes/Archer.js';
import { Knight } from '/src/classes/Knight.js';
import { Tower } from '/src/classes/Tower.js';
import { Unit } from '/src/classes/Unit.js';

// ── DIFFICULTY KNOBS (mirrors wave-1.js) ──
const STARTING_GOLD = { recruit: 300, veteran: 250, elite: 200 };
const QUEUE_CAP = { recruit: 10, veteran: 8, elite: 6 };
const goldForDifficulty = (d) => STARTING_GOLD[d] ?? 250;
const queueCapForDifficulty = (d) => QUEUE_CAP[d] ?? 8;

// ── CANVAS ──
const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');
gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

// ── DOM REFS ──
const selfNameEl = document.getElementById('selfName');
const otherNameEl = document.getElementById('otherName');
const selfGoldEl = document.getElementById('selfGold');
const otherGoldEl = document.getElementById('otherGold');
const selfShardsEl = document.getElementById('selfShards');
const otherShardsEl = document.getElementById('otherShards');
const livesLabelEl = document.getElementById('livesLabel');

const victoryOverlay = document.getElementById('victoryOverlay');
const victoryLobbyBtn = document.getElementById('victoryLobbyBtn');
const statTowersEl = document.getElementById('statTowers');
const statLivesEl = document.getElementById('statLives');
const statUnitsEl = document.getElementById('statUnits');

const selfTypesEl = document.getElementById('selfTypes');
const otherTypesEl = document.getElementById('otherTypes');
const selfTypesCountEl = document.getElementById('selfTypesCount');
const otherTypesCountEl = document.getElementById('otherTypesCount');

const selfQueueEl = document.getElementById('selfQueue');
const otherQueueEl = document.getElementById('otherQueue');
const selfQueueCountEl = document.getElementById('selfQueueCount');
const otherQueueCountEl = document.getElementById('otherQueueCount');

const readyBtn = document.getElementById('readyBtn');
const otherReadyEl = document.getElementById('otherReady');
const bothReadyBanner = document.getElementById('bothReadyBanner');
const alertEl = document.getElementById('alertBanner');
const waveTitleEl = document.getElementById('waveTitle');
const waveTrackEl = document.getElementById('waveTrack');
const towersRemainingEl = document.getElementById('towersRemainingLabel');
const waveProgressLabelEl = document.getElementById('waveProgressLabel');
const waveProgressBarEl = document.getElementById('waveProgressBar');

// ── STATE ──
let siege = null;
let isHost = false;
let startingGold = 250;
let queueCap = 8;

// Battle runtime
const towers = [];
let attackUnits = [];
let animationId = null;
let mapLoaded = false;
let battleStarted = false;
let towersDestroyedCount = 0;
let totalTowers = 0;
let unitsDeployedCount = 0;
let victoryShown = false;

// Shared team lives — how many failed waves the team can absorb before
// losing. A wave fails when both queues run out and towers still stand.
const MAX_LIVES = 12;
let teamLives = MAX_LIVES;

// ── HELPERS ──
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const queueCost = (queue) => queue.reduce((sum, id) => sum + deployCostById(id), 0);

const showAlert = (msg, type = 'info') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  clearTimeout(alertEl._t);
  alertEl._t = setTimeout(() => { alertEl.style.display = 'none'; }, 2400);
};

const smoothNavigate = (url) => {
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};

const returnToLobby = () => smoothNavigate('/lobby/lobby.html');

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

// ── SPRITE STRIP ANIMATION (same approach as wave-1) ──
const FRAME_DURATION_MS = 130;
const spriteMetaCache = new Map();
const spriteTimers = new WeakMap();

const loadIdleMeta = (unitId) => {
  if (spriteMetaCache.has(unitId)) return Promise.resolve(spriteMetaCache.get(unitId));
  const src = idleSpriteUrl(unitId);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const frameHeight = img.naturalHeight;
      const frameWidth = frameHeight;
      const frameCount = Math.max(1, Math.round(img.naturalWidth / frameWidth));
      const meta = { sheetWidth: img.naturalWidth, frameWidth, frameHeight, frameCount, src };
      spriteMetaCache.set(unitId, meta);
      resolve(meta);
    };
    img.onerror = () => {
      const meta = { sheetWidth: 600, frameWidth: 100, frameHeight: 100, frameCount: 6, src };
      spriteMetaCache.set(unitId, meta);
      resolve(meta);
    };
    img.src = src;
  });
};

const animateSprite = async (spriteEl, unitId, scaleMultiplier = 1.6) => {
  const prev = spriteTimers.get(spriteEl);
  if (prev) clearInterval(prev);
  const meta = await loadIdleMeta(unitId);
  if (!spriteEl.isConnected) return;
  const stageSize = spriteEl.parentElement?.getBoundingClientRect().width || 40;
  const scale = (stageSize * scaleMultiplier) / Math.max(meta.frameWidth, meta.frameHeight);
  spriteEl.style.width = `${meta.frameWidth}px`;
  spriteEl.style.height = `${meta.frameHeight}px`;
  spriteEl.style.backgroundSize = `${meta.sheetWidth}px ${meta.frameHeight}px`;
  spriteEl.style.backgroundImage = `url('${meta.src}')`;
  spriteEl.style.backgroundPosition = '0 0';
  spriteEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  let frame = 0;
  const timer = setInterval(() => {
    if (!spriteEl.isConnected) { clearInterval(timer); return; }
    frame = (frame + 1) % meta.frameCount;
    spriteEl.style.backgroundPosition = `${-frame * meta.frameWidth}px 0`;
  }, FRAME_DURATION_MS);
  spriteTimers.set(spriteEl, timer);
};

// ── DATA LOADERS ──
const loadProfile = async (userId) => {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, username')
    .eq('user_id', userId)
    .maybeSingle();
  return data || { user_id: userId, username: 'KNIGHT' };
};

const loadSiege = async (siegeId) => {
  let q = supabase.from('sieges').select('*');
  q = siegeId
    ? q.eq('id', siegeId)
    : q.or(`host_id.eq.${user.id},ally_id.eq.${user.id}`).not('started_at', 'is', null);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error('siege load failed', error); return null; }
  return data || null;
};

// ── RENDER: types (the 3 picks) ──
const renderTypes = (containerEl, types, interactive, remainingGold, queueFull, countEl) => {
  containerEl.innerHTML = '';
  countEl.textContent = `(${types.length}/3)`;
  if (!types.length) {
    containerEl.innerHTML = `<div class="setup-pool-empty" style="grid-column:1/-1">NO TYPES SELECTED</div>`;
    return;
  }
  for (const id of types) {
    const unit = UNITS_BY_ID.get(id);
    if (!unit) continue;
    const cost = deployCost(unit);
    const canAfford = interactive ? cost <= remainingGold && !queueFull : true;
    const card = document.createElement('div');
    card.className = `game-type-card${canAfford ? '' : ' is-disabled'}`;
    card.title = `${id} — COST ${cost}, HP ${unit.hp}, DMG ${unit.damage}`;
    card.innerHTML = `
      <div class="game-type-cost"><span class="game-coin">◆</span>${cost}</div>
      <div class="game-type-stage"><div class="game-type-sprite" data-unit="${escapeHtml(id)}"></div></div>
      <div class="game-type-name">${escapeHtml(id.toUpperCase())}</div>
    `;
    const spriteEl = card.querySelector('.game-type-sprite');
    animateSprite(spriteEl, id, 1.6);
    if (interactive && canAfford) card.addEventListener('click', () => addToQueue(id));
    containerEl.appendChild(card);
  }
};

// ── RENDER: queue (numbered rows) ──
const renderQueue = (containerEl, queue, cap, interactive, countEl) => {
  containerEl.innerHTML = '';
  if (countEl) countEl.textContent = `(${queue.length}/${cap})`;
  containerEl.classList.toggle('game-queue-readonly', !interactive);

  for (let i = 0; i < cap; i++) {
    const id = queue[i];
    const row = document.createElement('li');
    if (id) {
      const unit = UNITS_BY_ID.get(id);
      row.className = 'game-queue-row is-filled';
      row.innerHTML = `
        <span class="game-queue-idx">${i + 1}</span>
        <span class="game-queue-thumb"><span class="game-queue-sprite" data-unit="${escapeHtml(id)}"></span></span>
        <span class="game-queue-name">${escapeHtml(id.toUpperCase())}</span>
        <span class="game-queue-cost">${unit ? deployCost(unit) : 0}g</span>
      `;
      const spriteEl = row.querySelector('.game-queue-sprite');
      animateSprite(spriteEl, id, 1.4);
      if (interactive) row.addEventListener('click', () => removeFromQueue(i));
    } else {
      row.className = 'game-queue-row is-empty';
      row.innerHTML = `<span class="game-queue-idx">${i + 1}</span><span></span><span>—</span><span></span>`;
    }
    containerEl.appendChild(row);
  }
};

// ── RENDER: wave track pips ──
const renderWaveTrack = (current, total) => {
  waveTitleEl.textContent = `WAVE ${current} / ${total}`;
  waveTrackEl.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const pip = document.createElement('div');
    pip.className = 'game-wave-pip';
    if (i < current) pip.classList.add('is-past');
    else if (i === current) pip.classList.add('is-current');
    else pip.classList.add('is-future');
    waveTrackEl.appendChild(pip);
  }
  const lineEl = document.querySelector('.game-wave-line');
  if (lineEl) lineEl.style.setProperty('--wave-pct', `${((current - 1) / Math.max(1, total - 1)) * 100}%`);
};

// ── RENDER: ready controls ──
const renderReadyControls = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myQueue = siege[`${mySide}_wave1`] || [];
  const myReady = !!siege[`${mySide}_wave1_ready`];
  const otherReady = !!siege[`${otherSide}_wave1_ready`];

  readyBtn.disabled = myQueue.length === 0 || battleStarted;
  readyBtn.classList.toggle('is-ready', myReady);
  readyBtn.textContent = battleStarted
    ? '⚔ BATTLE IN PROGRESS ⚔'
    : (myReady ? '⊘ STAND DOWN' : '⚔ LOCK IN WAVE ⚔');

  otherReadyEl.classList.toggle('is-ready', otherReady);
  otherReadyEl.querySelector('.setup-ready-text').textContent = otherReady ? 'READY' : 'NOT READY';
};

// ── RENDER: top-bar names/gold ──
const renderHeader = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myName = (siege[`${mySide}_username`] || 'KNIGHT').toUpperCase();
  const otherName = (siege[`${otherSide}_username`] || 'KNIGHT').toUpperCase();
  selfNameEl.textContent = myName;
  otherNameEl.textContent = otherName;

  const mySpent = queueCost(siege[`${mySide}_wave1`] || []);
  const otherSpent = queueCost(siege[`${otherSide}_wave1`] || []);
  selfGoldEl.textContent = String(Math.max(0, startingGold - mySpent));
  otherGoldEl.textContent = String(Math.max(0, startingGold - otherSpent));

  // Shards are visual-only for now.
  selfShardsEl.textContent = '0';
  otherShardsEl.textContent = '0';

  // Shared team lives — decremented in checkWaveOutcome().
  livesLabelEl.textContent = `${teamLives} / ${MAX_LIVES}`;
};

// ── MAIN RENDER ──
const render = () => {
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myTypes = siege[`${mySide}_units`] || [];
  const otherTypes = siege[`${otherSide}_units`] || [];
  const myQueue = siege[`${mySide}_wave1`] || [];
  const otherQueue = siege[`${otherSide}_wave1`] || [];
  const mySpent = queueCost(myQueue);
  const myRemaining = Math.max(0, startingGold - mySpent);

  renderHeader();
  // Interactive types disabled once the battle is rolling (no mid-wave changes).
  renderTypes(selfTypesEl, myTypes, !battleStarted, myRemaining, myQueue.length >= queueCap, selfTypesCountEl);
  renderTypes(otherTypesEl, otherTypes, false, 0, false, otherTypesCountEl);
  renderQueue(selfQueueEl, myQueue, queueCap, !battleStarted, selfQueueCountEl);
  renderQueue(otherQueueEl, otherQueue, queueCap, false, otherQueueCountEl);
  renderReadyControls();
};

// ── SIEGE UPDATES ──
const updateSiege = async (patch) => {
  const mySideKey = isHost ? 'host_id' : 'ally_id';
  const { data, error } = await supabase
    .from('sieges')
    .update(patch)
    .eq('id', siege.id)
    .eq(mySideKey, user.id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('siege update failed', error);
    showAlert(`✗ UPDATE FAILED: ${(error.message || '').toUpperCase()}`, 'error');
    return null;
  }
  if (data) applySiegeUpdate(data);
  return data;
};

const addToQueue = (unitId) => {
  if (!siege || battleStarted) return;
  const mySide = isHost ? 'host_wave1' : 'ally_wave1';
  const readyKey = isHost ? 'host_wave1_ready' : 'ally_wave1_ready';
  const queue = [...(siege[mySide] || [])];
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) return;

  const myTypes = siege[isHost ? 'host_units' : 'ally_units'] || [];
  if (!myTypes.includes(unitId)) return;

  if (queue.length >= queueCap) {
    showAlert(`✗ QUEUE FULL (${queueCap} MAX)`, 'error');
    return;
  }
  const spent = queueCost(queue);
  if (spent + deployCost(unit) > startingGold) {
    showAlert('✗ NOT ENOUGH GOLD', 'error');
    return;
  }
  queue.push(unitId);
  const patch = { [mySide]: queue };
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const removeFromQueue = (idx) => {
  if (!siege || battleStarted) return;
  const mySide = isHost ? 'host_wave1' : 'ally_wave1';
  const readyKey = isHost ? 'host_wave1_ready' : 'ally_wave1_ready';
  const queue = [...(siege[mySide] || [])];
  if (idx < 0 || idx >= queue.length) return;
  queue.splice(idx, 1);
  const patch = { [mySide]: queue };
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const toggleReady = async () => {
  if (!siege || battleStarted) return;
  const mySide = isHost ? 'host' : 'ally';
  const queue = siege[`${mySide}_wave1`] || [];
  if (queue.length === 0) return;
  const readyKey = `${mySide}_wave1_ready`;
  const next = !siege[readyKey];
  applySiegeUpdate({ ...siege, [readyKey]: next });
  await updateSiege({ [readyKey]: next });
};

readyBtn.addEventListener('click', toggleReady);

// ── BATTLE RUNTIME ──
const initialiseTowers = () => {
  towers.length = 0;
  for (const location of towerLocations) {
    towers.push(new Tower(location, gameCanvas));
  }
  totalTowers = towers.length;
};

const pathStartDirection = () => {
  const p0 = path[0];
  const p1 = path[1] || path[0];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};

// Colour-block stand-in for any unit-id we don't have a sprite class for yet.
// Pulls hp/damage/speed from the catalog so combat still feels distinct, and
// hashes the id to a stable hue so each unit type reads as a different block.
const hashHue = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
};

class PlaceholderUnit extends Unit {
  constructor(position, ctx, unitId) {
    super(position, ctx);
    const meta = UNITS_BY_ID.get(unitId) || { hp: 80, damage: 12, speed: 5 };
    this.unitId = unitId;
    this.maxHealth = meta.hp;
    this.health = meta.hp;
    this.attackStrength = meta.damage;
    this.moveSpeedPxPerSecond = (meta.speed || 5) * 12;
    this.width = 44;
    this.height = 44;
    this.color = `hsl(${hashHue(unitId)} 70% 50%)`;
    this.darkColor = `hsl(${hashHue(unitId)} 70% 28%)`;
  }
  render() {
    const ctx = this.gameCanvas;
    ctx.fillStyle = this.darkColor;
    ctx.fillRect(this.position.x - 2, this.position.y - 2, this.width + 4, this.height + 4);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((this.unitId || '?').slice(0, 6), this.centre.x, this.centre.y);
    this.drawHealthBar();
  }
}

const createUnitFromId = (unitId, position, laneOffset) => {
  const id = String(unitId || '');
  const lower = id.toLowerCase();
  let unit;
  // Only Archer/Knight have real sprite classes today. Anything else from
  // the catalog (Soldier, Slime, Wizard, Werewolf, …) renders as a coloured
  // block placeholder until a proper class is added.
  if (lower === 'archer') unit = new Archer(position, gameCanvas);
  else if (lower === 'knight') unit = new Knight(position, gameCanvas);
  else unit = new PlaceholderUnit(position, gameCanvas, id);
  unit.laneOffset = (typeof laneOffset === 'number') ? laneOffset : 0;
  unit.pathRef = path;
  return unit;
};

const spawnWaveQueues = () => {
  const hostQueue = siege.host_wave1 || [];
  const allyQueue = siege.ally_wave1 || [];

  const spawnGap = 220;
  const spacing = 10;
  const dir = pathStartDirection();

  const spawn = (queue, laneOffset, team) => {
    queue.forEach((unitId, i) => {
      setTimeout(() => {
        if (victoryShown) return;
        const pos = { x: path[0].x, y: path[0].y };
        const unit = createUnitFromId(unitId, pos, laneOffset);
        unit.team = team;
        unit.position.x -= dir.x * (i * spacing);
        unit.position.y -= dir.y * (i * spacing);
        attackUnits.push(unit);
        unitsDeployedCount++;
      }, i * spawnGap);
    });
  };

  spawn(hostQueue, -14, 'host');
  spawn(allyQueue, 14, 'ally');

  // After every unit has been spawned and resolved, check the wave outcome.
  // Total spawn time = (longer queue - 1) * spawnGap; pad a few seconds for
  // units to finish marching and dying before we judge.
  const longest = Math.max(hostQueue.length, allyQueue.length);
  const settleMs = longest * spawnGap + 6000;
  setTimeout(checkWaveOutcome, settleMs);
};

// Called once after the wave's units have spawned and had time to fight.
// Per-side failure: that side's queue is exhausted (no living units of theirs
// remain) AND towers still stand. Each failure burns one life.
const checkWaveOutcome = () => {
  if (victoryShown) return;
  if (towers.length === 0) {
    // Victory — both sides cleared the towers. No lives lost.
    return;
  }
  const hostAlive = attackUnits.some(u => !u.isDead && u.team === 'host');
  const allyAlive = attackUnits.some(u => !u.isDead && u.team === 'ally');
  if (hostAlive || allyAlive) return; // wave still resolving

  // Wave failed — burn one shared life.
  teamLives = Math.max(0, teamLives - 1);
  renderHeader();
};

const showVictory = () => {
  if (victoryShown) return;
  victoryShown = true;
  statTowersEl.textContent = `${towersDestroyedCount} / ${totalTowers}`;
  statLivesEl.textContent = `${teamLives} / ${MAX_LIVES}`;
  statUnitsEl.textContent = String(unitsDeployedCount);
  victoryOverlay.classList.remove('hidden');
  victoryOverlay.setAttribute('aria-hidden', 'false');
};

victoryLobbyBtn.addEventListener('click', returnToLobby);

const updateWaveProgress = () => {
  const destroyed = towersDestroyedCount;
  const pct = totalTowers ? Math.round((destroyed / totalTowers) * 100) : 0;
  waveProgressLabelEl.textContent = `${pct}%`;
  waveProgressBarEl.style.width = `${pct}%`;
  towersRemainingEl.textContent = `TOWERS REMAINING: ${totalTowers - destroyed}`;
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (!mapLoaded) return;

  gameCanvas.drawImage(backgroundImage, 0, 0);

  for (let i = 0; i < attackUnits.length && towers.length; i++) {
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
        updateWaveProgress();
        renderHeader();
        if (towers.length === 0) showVictory();
      }
      unit.target = null;
    }
  }

  attackUnits = attackUnits.filter(u => !u.isDead);
  attackUnits.forEach(u => u.updateFrame());
  towers.forEach(tower => {
    const target = attackUnits.find(u => !u.isDead);
    tower.updateFrame(target);
  });
};

const startBattle = () => {
  if (battleStarted || !mapLoaded) return;
  battleStarted = true;
  attackUnits = [];
  towersDestroyedCount = 0;
  bothReadyBanner.classList.remove('hidden');
  setTimeout(() => bothReadyBanner.classList.add('hidden'), 1400);
  spawnWaveQueues();
  render();
};

// ── REALTIME RECONCILIATION ──
const applySiegeUpdate = (fresh) => {
  if (!fresh || fresh.id !== siege?.id) return;
  siege = fresh;
  render();

  const bothReady = !!siege.host_wave1_ready && !!siege.ally_wave1_ready;
  if (bothReady && !battleStarted) startBattle();
};

// ── MAP LOAD ──
const backgroundImage = new Image();
backgroundImage.onload = () => {
  mapLoaded = true;
  initialiseTowers();
  gameCanvas.drawImage(backgroundImage, 0, 0);
  towers.forEach(t => t.render());
  updateWaveProgress();
  if (!animationId) animate();
  if (siege && siege.host_wave1_ready && siege.ally_wave1_ready) startBattle();
};

// ── INIT ──
const handoffId = sessionStorage.getItem('wave1SiegeId');

siege = await loadSiege(handoffId);
if (!siege && handoffId) {
  await new Promise(r => setTimeout(r, 400));
  siege = await loadSiege(handoffId);
}

const bounce = (reason, msg) => {
  console.error('[game] bouncing to lobby:', reason, { handoffId, userId: user?.id, siege });
  showAlert(msg, 'error');
  setTimeout(returnToLobby, 1200);
};

if (!siege) {
  bounce('siege row not found', '⊘ SIEGE NOT FOUND — RETURNING TO WAR ROOM');
} else if (siege.host_id !== user.id && siege.ally_id !== user.id) {
  bounce('user not in siege', '⊘ THOU ART NOT IN THIS SIEGE — RETURNING');
} else if (!siege.started_at) {
  bounce('siege not started', '⊘ SIEGE NOT YET STARTED — RETURNING');
} else if (!(siege.host_ready && siege.ally_ready)) {
  bounce('siege-setup not locked in', '⊘ HOST NOT YET MUSTERED — RETURNING');
  setTimeout(() => { sessionStorage.setItem('setupSiegeId', siege.id); smoothNavigate('/siege-setup/siege-setup.html'); }, 1200);
} else {
  isHost = siege.host_id === user.id;
  startingGold = goldForDifficulty(siege.difficulty);
  queueCap = queueCapForDifficulty(siege.difficulty);

  // Preload profiles so we display fresh usernames (siege row also has them
  // but profile is canonical).
  const myUid = user.id;
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meProfile, themProfile] = await Promise.all([
    loadProfile(myUid),
    otherUid ? loadProfile(otherUid) : Promise.resolve(null),
  ]);
  if (meProfile?.username) siege[isHost ? 'host_username' : 'ally_username'] = meProfile.username;
  if (themProfile?.username) siege[isHost ? 'ally_username' : 'host_username'] = themProfile.username;

  renderWaveTrack(1, 15);
  render();

  // Map + tower init kicks off via backgroundImage.onload below.
  backgroundImage.src = siege.map_src || '/assets/maps/calista-map.png';

  supabase
    .channel(`game-${siege.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      (payload) => applySiegeUpdate(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      () => {
        showAlert('☠ THE SIEGE WAS DISBANDED', 'error');
        setTimeout(returnToLobby, 900);
      })
    .subscribe();
}
