/* ═══════════════════════════════════════════════
   GAME PAGE
   Both players build their wave from the
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
import { sim } from '/src/runtime/sim.js';
import { contribution, resetContribution, creditTowerKill } from '/src/runtime/contribution.js';

let blastImage = new Image();
let blastLoaded = false;

blastImage.onload = () => {
  blastLoaded = true;
};

blastImage.src = "../assets/effects/blast.png";

// ── DIFFICULTY KNOBS ──
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
const selfPointsEl = document.getElementById('selfPoints');
const otherPointsEl = document.getElementById('otherPoints');
const livesLabelEl = document.getElementById('livesLabel');

const victoryOverlay = document.getElementById('victoryOverlay');
const victoryLobbyBtn = document.getElementById('victoryLobbyBtn');
const statTowersEl = document.getElementById('statTowers');
const statLivesEl = document.getElementById('statLives');
const statUnitsEl = document.getElementById('statUnits');
const rewardPointsEl = document.getElementById('rewardPoints');

const defeatOverlay = document.getElementById('defeatOverlay');
const defeatLobbyBtn = document.getElementById('defeatLobbyBtn');
const statTowersDefeatEl = document.getElementById('statTowersDefeat');
const statLivesDefeatEl = document.getElementById('statLivesDefeat');
const statUnitsDefeatEl = document.getElementById('statUnitsDefeat');
const rewardPointsDefeatEl = document.getElementById('rewardPointsDefeat');

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

// Profiles loaded once at battle entry — used for the POINTS counter in
// the HUD. Not refreshed mid-match (points only change via the payout RPC
// at game end and will re-load on next page visit).
let mySelf = { profile: null };
let myOther = { profile: null };

// Battle runtime
const towers = [];
let attackUnits = [];
let animationId = null;
let mapLoaded = false;
let battleStarted = false;
let towersDestroyedCount = 0;
let totalTowers = 0;
let unitsDeployedCount = 0;
let explosions = [];
// Single end-of-match guard (used for both victory and defeat) so the
// spawn timeline, settle timer, and overlay flips all key off the same
// flag instead of victory-only logic.
let matchEnded = false;

// "Lives" in the HUD represents wave-attempts remaining — the team can
// fail one wave per remaining attempt. Derived from current_wave /
// total_waves on the siege row so there's no separate column to keep in
// sync. Defeat triggers when this hits 0 (failure on the last wave).



const livesRemaining = () => {
  const current = siege?.current_wave ?? 1;
  const total = siege?.total_waves ?? 15;
  return Math.max(0, total - current + 1);
};
const livesMax = () => siege?.total_waves ?? 15;

// ── SIMULATION EVENT BUS ──
// Single hook point for discrete combat events. Local listeners drive HUD
// + state writes; the multiplayer sync layer (added by coworker) will
// attach a second listener that broadcasts each event to the other client
// so neither needs to know about the other.
//   'tower-destroyed' detail: { towerIndex, lastAttackerTeam, reward }
//   'wave-failed'     detail: { wave, towersRemaining }
//   'wave-completed'  detail: { wave, towersRemaining: 0 }
//   'battle-ended'    detail: { outcome: 'victory' | 'defeat' }
export const battleEvents = new EventTarget();
const emit = (name, detail) => battleEvents.dispatchEvent(new CustomEvent(name, { detail }));

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

const spawnExplosion = (x, y) => {
  explosions.push({
    x,
    y,
    age: 0,
    maxAge: 650, // ms
    radius: 18,
    sparks: Array.from({ length: 12 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 2.5;
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 250 + Math.random() * 250,
      };
    }),
  });
};

const updateAndRenderExplosions = () => {
  if (!explosions.length) return;

  const dt = sim.dt || 16;

  explosions = explosions.filter((ex) => {
    ex.age += dt;
    const progress = Math.min(1, ex.age / ex.maxAge);

    // Main blast ring
    const blastRadius = ex.radius + progress * 40;
    const alpha = 1 - progress;

    gameCanvas.save();
    gameCanvas.globalAlpha = alpha;
    if (blastLoaded) {
      gameCanvas.drawImage(
        blastImage,
        ex.x - 40,
        ex.y - 40,
        80,
        80
      );
    }

    // Outer orange ring
    gameCanvas.beginPath();
    gameCanvas.arc(ex.x, ex.y, blastRadius, 0, Math.PI * 2);
    gameCanvas.fillStyle = 'rgba(255,140,0,0.35)';
    gameCanvas.fill();

    // Inner bright core
    gameCanvas.beginPath();
    gameCanvas.arc(ex.x, ex.y, blastRadius * 0.55, 0, Math.PI * 2);
    gameCanvas.fillStyle = 'rgba(255,220,80,0.7)';
    gameCanvas.fill();

    // Small white hot centre
    gameCanvas.beginPath();
    gameCanvas.arc(ex.x, ex.y, blastRadius * 0.22, 0, Math.PI * 2);
    gameCanvas.fillStyle = 'rgba(255,255,255,0.9)';
    gameCanvas.fill();

    // Sparks
    ex.sparks.forEach((spark) => {
      const sparkProgress = Math.min(1, ex.age / spark.life);
      const sx = ex.x + spark.vx * ex.age * 0.06;
      const sy = ex.y + spark.vy * ex.age * 0.06;

      gameCanvas.globalAlpha = Math.max(0, 0.9 - sparkProgress);
      gameCanvas.fillStyle = sparkProgress < 0.5 ? '#ffd54a' : '#ff7a00';
      gameCanvas.fillRect(sx - 2, sy - 2, 4, 4);
    });

    gameCanvas.restore();

    return ex.age < ex.maxAge;
  });
};
const returnToLobby = () => smoothNavigate('/lobby/lobby.html');

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

// ── SPRITE STRIP ANIMATION ──
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
    .select('user_id, username, points')
    .eq('user_id', userId)
    .maybeSingle();
  return data || { user_id: userId, username: 'KNIGHT', points: 0 };
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
// Both players see the same canonical states, just from their own POV:
// the action button on the left side and the status indicator on the
// right side both render off the same siege.host_queue_ready /
// ally_queue_ready columns, so flipping ready on one client always
// reflects on the other via the postgres_changes echo.
const renderReadyControls = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myQueue = siege[`${mySide}_queue`] || [];
  const otherQueue = siege[`${otherSide}_queue`] || [];
  const myReady = !!siege[`${mySide}_queue_ready`];
  const otherReady = !!siege[`${otherSide}_queue_ready`];

  // My button:
  //   - "BATTLE IN PROGRESS" while the wave is actually running
  //   - "QUEUE UNITS FIRST" disabled if I haven't queued anything
  //   - "STAND DOWN" if I've locked in (re-press to unready)
  //   - "LOCK IN WAVE" otherwise
  readyBtn.disabled = battleStarted || myQueue.length === 0;
  readyBtn.classList.toggle('is-ready', myReady && !battleStarted);
  if (battleStarted) {
    readyBtn.textContent = '⚔ BATTLE IN PROGRESS ⚔';
  } else if (myQueue.length === 0) {
    readyBtn.textContent = '◇ QUEUE UNITS FIRST ◇';
  } else if (myReady) {
    readyBtn.textContent = '⊘ STAND DOWN';
  } else {
    readyBtn.textContent = '⚔ LOCK IN WAVE ⚔';
  }

  // Other player's indicator — three states, mirroring my button:
  //   - "IN BATTLE" while the wave is running (both sides are committed)
  //   - "READY" if they've locked in their queue
  //   - "QUEUING…" if they haven't locked in yet (whether their queue is
  //     empty or just unconfirmed — both look the same from my side)
  otherReadyEl.classList.toggle('is-ready', otherReady && !battleStarted);
  let otherText;
  if (battleStarted) otherText = 'IN BATTLE';
  else if (otherReady) otherText = 'READY';
  else if (otherQueue.length > 0) otherText = 'QUEUING…';
  else otherText = 'NOT READY';
  otherReadyEl.querySelector('.setup-ready-text').textContent = otherText;
};

// ── RENDER: top-bar names/gold ──
const renderHeader = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myName = (siege[`${mySide}_username`] || 'KNIGHT').toUpperCase();
  const otherName = (siege[`${otherSide}_username`] || 'KNIGHT').toUpperCase();
  selfNameEl.textContent = myName;
  otherNameEl.textContent = otherName;

  // Gold is now persisted on the siege row (host_gold/ally_gold) so it
  // carries across waves and tower-kill rewards stick. Falls back to the
  // pre-battle derivation while the wave is still being queued for the
  // very first time (host hasn't seeded the columns yet).
  const myGold = siege[`${mySide}_gold`];
  const otherGold = siege[`${otherSide}_gold`];
  const mySpent = queueCost(siege[`${mySide}_queue`] || []);
  const otherSpent = queueCost(siege[`${otherSide}_queue`] || []);
  selfGoldEl.textContent = String(Number.isFinite(myGold) && myGold > 0
    ? myGold
    : Math.max(0, startingGold - mySpent));
  otherGoldEl.textContent = String(Number.isFinite(otherGold) && otherGold > 0
    ? otherGold
    : Math.max(0, startingGold - otherSpent));

  // POINTS = lifetime profile.points, read once on battle entry. No live
  // updates mid-match — the value only changes via award_match_points()
  // and will refresh on the next page load.
  selfPointsEl.textContent = String(mySelf?.profile?.points ?? 0);
  otherPointsEl.textContent = String(myOther?.profile?.points ?? 0);

  // "Lives" = remaining wave attempts. Derived from current_wave /
  // total_waves on the siege row — no separate column to sync.
  livesLabelEl.textContent = `${livesRemaining()} / ${livesMax()}`;
};

// ── MAIN RENDER ──
const render = () => {
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myTypes = siege[`${mySide}_units`] || [];
  const otherTypes = siege[`${otherSide}_units`] || [];
  const myQueue = siege[`${mySide}_queue`] || [];
  const otherQueue = siege[`${otherSide}_queue`] || [];
  const myRemaining = myGoldNow();

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

// Gold is debited/refunded immediately against siege.host_gold /
// ally_gold so it persists across waves. Falls back to startingGold for
// the very first queue change when the column hasn't been seeded yet.
const myGoldNow = () => {
  const k = isHost ? 'host_gold' : 'ally_gold';
  const v = siege?.[k];
  return Number.isFinite(v) && v > 0 ? v : startingGold;
};

const addToQueue = (unitId) => {
  if (!siege || battleStarted) return;
  const queueKey = isHost ? 'host_queue' : 'ally_queue';
  const goldKey = isHost ? 'host_gold' : 'ally_gold';
  const readyKey = isHost ? 'host_queue_ready' : 'ally_queue_ready';
  const queue = [...(siege[queueKey] || [])];
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) return;

  const myTypes = siege[isHost ? 'host_units' : 'ally_units'] || [];
  if (!myTypes.includes(unitId)) return;

  if (queue.length >= queueCap) {
    showAlert(`✗ QUEUE FULL (${queueCap} MAX)`, 'error');
    return;
  }
  const cost = deployCost(unit);
  const have = myGoldNow();
  if (cost > have) {
    showAlert('✗ NOT ENOUGH GOLD', 'error');
    return;
  }
  queue.push(unitId);
  const patch = { [queueKey]: queue, [goldKey]: have - cost };
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const removeFromQueue = (idx) => {
  if (!siege || battleStarted) return;
  const queueKey = isHost ? 'host_queue' : 'ally_queue';
  const goldKey = isHost ? 'host_gold' : 'ally_gold';
  const readyKey = isHost ? 'host_queue_ready' : 'ally_queue_ready';
  const queue = [...(siege[queueKey] || [])];
  if (idx < 0 || idx >= queue.length) return;
  const removed = queue.splice(idx, 1)[0];
  const refund = deployCostById(removed);
  const patch = {
    [queueKey]: queue,
    [goldKey]: myGoldNow() + refund,
  };
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const toggleReady = async () => {
  if (!siege || battleStarted) return;
  const mySide = isHost ? 'host' : 'ally';
  const queue = siege[`${mySide}_queue`] || [];
  if (queue.length === 0) return;
  const readyKey = `${mySide}_queue_ready`;
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

// Track whether the current wave has already been judged so the settle
// timeout doesn't double-fire (e.g. on re-renders / state replays).
let waveJudged = false;
let waveSettleTimer = null;
// Monotonic wave-attempt counter so spawn timeouts from a finished/failed
// wave can't leak units into the next wave. Bumped every startWave().
let waveAttemptId = 0;

const spawnWaveQueues = () => {
  const hostQueue = siege.host_queue || [];
  const allyQueue = siege.ally_queue || [];

  const spawnGap = 220;
  const spacing = 10;
  const dir = pathStartDirection();
  // Snapshot the current attempt — pending timeouts compare against this
  // and drop themselves if the wave has been re-armed since they were
  // scheduled. Survives both wave failure and wave advancement.
  const myAttempt = waveAttemptId;

  const spawn = (queue, laneOffset, team) => {
    queue.forEach((unitId, i) => {
      setTimeout(() => {
        if (matchEnded) return;
        if (myAttempt !== waveAttemptId) return; // stale wave — drop
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
  if (waveSettleTimer) clearTimeout(waveSettleTimer);
  waveSettleTimer = setTimeout(checkWaveOutcome, settleMs);
};

// Called continuously from animate() once the wave has begun, AND from
// the settle timer as a safety net. Fires either 'wave-completed'
// (towers gone) or 'wave-failed' (all queued units spawned and dead,
// towers still standing). Guarded by waveJudged so it fires at most
// once per wave.
const checkWaveOutcome = () => {
  if (matchEnded || waveJudged || !battleStarted) return;
  if (towers.length === 0) {
    waveJudged = true;
    emit('wave-completed', { wave: siege?.current_wave ?? 1, towersRemaining: 0 });
    return;
  }
  // Wave can only fail once every queued unit has had a chance to spawn —
  // otherwise we'd judge before late spawns even hit the field. The
  // expected total spawn count equals host_queue.length + ally_queue.length.
  const expectedTotal = (siege?.host_queue?.length ?? 0) + (siege?.ally_queue?.length ?? 0);
  if (unitsDeployedCount < expectedTotal) return;
  const hostAlive = attackUnits.some(u => !u.isDead && u.team === 'host');
  const allyAlive = attackUnits.some(u => !u.isDead && u.team === 'ally');
  if (hostAlive || allyAlive) return;
  waveJudged = true;
  emit('wave-failed', { wave: siege?.current_wave ?? 1, towersRemaining: towers.length });
};

// Renders the end-of-match overlay (victory or defeat — both share the
// same structure with different copy / accent colour). Host writes the
// authoritative outcome + contribution JSONB so award_match_points()
// gives both clients the same payout.
const showEndOverlay = async (outcome) => {
  if (matchEnded) return;
  matchEnded = true;
  if (waveSettleTimer) { clearTimeout(waveSettleTimer); waveSettleTimer = null; }

  const overlay = outcome === 'victory' ? victoryOverlay : defeatOverlay;
  const statsOf = outcome === 'victory'
    ? { towers: statTowersEl, lives: statLivesEl, units: statUnitsEl }
    : { towers: statTowersDefeatEl, lives: statLivesDefeatEl, units: statUnitsDefeatEl };

  if (statsOf.towers) statsOf.towers.textContent = `${towersDestroyedCount} / ${totalTowers}`;
  if (statsOf.lives)  statsOf.lives.textContent = `${livesRemaining()} / ${livesMax()}`;
  if (statsOf.units)  statsOf.units.textContent = String(unitsDeployedCount);

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  // Only the host writes outcome + contribution so the two clients don't
  // race the payout RPC. The ally sees the row update via realtime and
  // calls the RPC too — the second call hits the idempotency guard
  // ('already_paid') and we treat that as a no-op so both HUDs render
  // their reward.
  if (isHost && siege.outcome !== outcome) {
    const patch = {
      outcome,
      phase: 'complete',
      host_contribution: contribution.host,
      ally_contribution: contribution.ally,
    };
    applySiegeUpdate({ ...siege, ...patch });
    await updateSiege(patch);
  }
  emit('battle-ended', { outcome });
  await claimRewards(outcome);
};

// Server-validated payout. award_match_points() splits the pool 60/40
// based on host_contribution / ally_contribution and bumps profiles.points
// for both players. Idempotent via siege.ended_at — the second client to
// call this gets 'already_paid' which we silently treat as success.
const claimRewards = async (outcome) => {
  if (!siege || (siege.outcome !== 'victory' && siege.outcome !== 'defeat')) return;
  const { data, error } = await supabase.rpc('award_match_points', { p_siege: siege.id });
  if (error) {
    if (!String(error.message || '').includes('already_paid')) {
      console.error('award_match_points failed', error);
    }
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return;
  const myPoints = isHost ? row.host_award : row.ally_award;
  const target = outcome === 'victory' ? rewardPointsEl : rewardPointsDefeatEl;
  if (target) target.textContent = `+ ${myPoints ?? 0}`;
};

// End-of-match return-to-lobby. The match is over, so the siege row has
// no further use — disband it the same way siege-setup does so both
// clients' postgres_changes DELETE handlers bounce them back. If the
// delete fails (RLS / network), still navigate locally so the user
// isn't stuck. Idempotent: the second click (or the partner's click)
// just deletes a row that's already gone.
const disbandAndLeave = async (btn) => {
  if (btn) btn.disabled = true;
  if (siege?.id) {
    const { error } = await supabase.from('sieges').delete().eq('id', siege.id);
    if (error) console.error('post-match disband failed', error);
  }
  returnToLobby();
};
victoryLobbyBtn.addEventListener('click', () => disbandAndLeave(victoryLobbyBtn));
if (defeatLobbyBtn) defeatLobbyBtn.addEventListener('click', () => disbandAndLeave(defeatLobbyBtn));

// ── BATTLE EVENT WIRING ──
// All discrete combat outcomes go through battleEvents above. Local
// listeners drive HUD + state writes; the sync layer can mirror.

// A tower fell. Credit the killing side for the tower kill and the gold
// reward. Host writes both gold columns so the row reflects the shared
// payout (game-flow §10 — both players bank tower-kill gold).
battleEvents.addEventListener('tower-destroyed', (e) => {
  const { lastAttackerTeam, reward, x, y } = e.detail;

  if (typeof x === 'number' && typeof y === 'number') {
    spawnExplosion(x, y);
  }

  if (lastAttackerTeam) creditTowerKill(lastAttackerTeam);

  if (isHost && reward) {
    const next = {
      host_gold: Math.max(0, (siege.host_gold ?? 0) + reward),
      ally_gold: Math.max(0, (siege.ally_gold ?? 0) + reward),
    };
    applySiegeUpdate({ ...siege, ...next });
    updateSiege(next);
  }
});

// All towers destroyed = victory, regardless of which wave we're on.
// Clearing the map early is the win condition; remaining waves are
// "you had room to spare," not unfinished work.
battleEvents.addEventListener('wave-completed', async () => {
  await showEndOverlay('victory');
});

// Wave failed (all friendly units dead, towers still standing). The team
// gets to try again on the next wave — the HUD heart counter is derived
// from total_waves - current_wave + 1, so just bumping current_wave is
// enough to tick the counter down. There is no separate team_lives
// column to maintain.
//
// If this was the last wave, that's defeat. Otherwise the host bumps
// current_wave + clears the queues so both clients re-enter prep.
battleEvents.addEventListener('wave-failed', async () => {
  if (!isHost) return;
  const current = siege.current_wave || 1;
  const total = siege.total_waves || 15;
  if (current >= total) {
    await showEndOverlay('defeat');
    return;
  }
  const patch = {
    current_wave: current + 1,
    host_queue: [],
    ally_queue: [],
    host_queue_ready: false,
    ally_queue_ready: false,
    phase: 'prep',
  };
  applySiegeUpdate({ ...siege, ...patch });
  await updateSiege(patch);
});

const updateWaveProgress = () => {
  const destroyed = towersDestroyedCount;
  const pct = totalTowers ? Math.round((destroyed / totalTowers) * 100) : 0;
  waveProgressLabelEl.textContent = `${pct}%`;
  waveProgressBarEl.style.width = `${pct}%`;
  towersRemainingEl.textContent = `TOWERS REMAINING: ${totalTowers - destroyed}`;
};

// Wall-clock deltaTime so the simulation runs at the same speed on 60Hz
// and 144Hz monitors. Cap at 100ms to prevent teleport-on-tab-return.
let lastFrameTime = performance.now();

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (!mapLoaded) return;

  const now = performance.now();
  sim.dt = Math.min(100, now - lastFrameTime);
  lastFrameTime = now;

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
        const dead = towers.shift();
        towersDestroyedCount++;
        updateWaveProgress();
        renderHeader();
        emit('tower-destroyed', {
          towerIndex: towersDestroyedCount - 1,
          lastAttackerTeam: dead?.lastAttackerTeam ?? null,
          reward: dead?.reward ?? 0,
          x: dead?.centre?.x ?? dead?.position?.x ?? 0,
          y: dead?.centre?.y ?? dead?.position?.y ?? 0,
        });

        if (towers.length === 0) checkWaveOutcome();
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
  updateAndRenderExplosions();
  // Continuously check whether the wave has resolved so failure feedback
  // is instant. The settle timer in spawnWaveQueues() is still kept as a
  // belt-and-braces fallback in case unitsDeployedCount somehow undercounts.
  if (battleStarted) checkWaveOutcome();
};

// Kick off one wave of combat. Called for each wave in the multi-wave
// loop, not just the first one — re-uses the same banner / spawn / settle
// machinery between waves.
const startWave = () => {
  if (!mapLoaded || matchEnded) return;
  if (battleStarted) return; // already running this wave
  battleStarted = true;
  waveJudged = false;
  waveAttemptId++;
  attackUnits = [];
  // Towers persist across waves — damage and destruction from previous
  // waves carries over. Only seed the full set on the very first wave
  // (or if the page reloaded mid-match and the local tower array is
  // empty). towersDestroyedCount is local-only and tracks per-match
  // progress; don't reset it between waves.
  if (towers.length === 0 && towersDestroyedCount === 0) {
    initialiseTowers();
  }
  updateWaveProgress();
  // Per-wave contribution accumulates into the same totals across the
  // whole match — only zero it once per match (first wave). After the
  // first wave the totals just keep climbing.
  if ((siege.current_wave ?? 1) === 1) resetContribution();

  bothReadyBanner.classList.remove('hidden');
  setTimeout(() => bothReadyBanner.classList.add('hidden'), 1400);
  spawnWaveQueues();
  renderWaveTrack(siege.current_wave || 1, siege.total_waves || 15);
  render();

  // First-wave bookkeeping: host seeds gold for both sides and flips
  // phase to 'battle'. On subsequent waves gold already persists; we
  // only flip phase back to 'battle' from 'prep'.
  if (isHost) {
    const patch = {};
    if (siege.phase !== 'battle') patch.phase = 'battle';
    if (!Number.isFinite(siege.host_gold) || siege.host_gold === 0) patch.host_gold = startingGold;
    if (!Number.isFinite(siege.ally_gold) || siege.ally_gold === 0) patch.ally_gold = startingGold;
    if (Object.keys(patch).length) {
      applySiegeUpdate({ ...siege, ...patch });
      updateSiege(patch);
    }
  }
};

// ── REALTIME RECONCILIATION ──
// Stale-write guard: optimistic local applies use an in-memory row that
// hasn't been round-tripped through Supabase, so the realtime echo of an
// earlier write can land *after* a later optimistic apply and regress
// state. Track the highest phase + current_wave we've seen and ignore
// any incoming row that's behind.
const phaseOrder = { lobby: 0, setup: 1, prep: 2, battle: 3, complete: 4 };

const applySiegeUpdate = (fresh) => {
  if (!fresh || fresh.id !== siege?.id) return;
  // Drop rows that are strictly older than what we already have.
  // - Lower current_wave: stale.
  // - Same wave but lower phase order: stale (e.g. echo of 'battle'
  //   arriving after we've optimistically flipped to 'prep' for the
  //   re-attempt). Outcome is a one-way door — once set, never unset.
  if (siege) {
    const freshWave = fresh.current_wave ?? 1;
    const liveWave = siege.current_wave ?? 1;
    if (freshWave < liveWave) return;
    if (freshWave === liveWave) {
      const freshPhaseOrd = phaseOrder[fresh.phase] ?? 0;
      const livePhaseOrd = phaseOrder[siege.phase] ?? 0;
      if (freshPhaseOrd < livePhaseOrd) return;
    }
    if (siege.outcome && !fresh.outcome) return;
  }
  const prevPhase = siege?.phase;
  siege = fresh;

  // Phase flipped back to 'prep' — wave failed and the host bumped
  // current_wave. Drop the battle-running state so the queue UI re-enables
  // and clear the in-flight unit list, but DO NOT touch towersDestroyedCount
  // or the towers array — map state persists across waves so the next wave
  // continues the assault on whatever's left standing. unitsDeployedCount
  // resets per wave so the new wave's expected-total check works.
  //
  // Flip state BEFORE rendering so renderTypes() / renderReadyControls()
  // see the post-prep `battleStarted = false` and enable the queue UI.
  // Pre-this fix, render() ran first with the stale `battleStarted = true`
  // and the ally's type cards stayed disabled until the next echo.
  if (siege.phase === 'prep' && prevPhase !== 'prep') {
    battleStarted = false;
    waveJudged = false;
    if (waveSettleTimer) { clearTimeout(waveSettleTimer); waveSettleTimer = null; }
    attackUnits = [];
    unitsDeployedCount = 0;
    updateWaveProgress();
  }
  render();

  // End-of-match overlay if the host wrote outcome from the other client.
  if (siege.outcome && !matchEnded) {
    showEndOverlay(siege.outcome);
    return;
  }
  // Both sides ready — start (or re-start, between waves) the current wave.
  const bothReady = !!siege.host_queue_ready && !!siege.ally_queue_ready;
  if (bothReady && !battleStarted && !matchEnded) startWave();
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
  if (siege && siege.host_queue_ready && siege.ally_queue_ready) startWave();
};

// ── INIT ──
const handoffId = sessionStorage.getItem('battleSiegeId');

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
  mySelf  = { profile: meProfile || { points: 0 } };
  myOther = { profile: themProfile || { points: 0 } };
  if (meProfile?.username) siege[isHost ? 'host_username' : 'ally_username'] = meProfile.username;
  if (themProfile?.username) siege[isHost ? 'ally_username' : 'host_username'] = themProfile.username;

  renderWaveTrack(siege.current_wave || 1, siege.total_waves || 15);
  render();

  // Map + tower init kicks off via backgroundImage.onload below.
  backgroundImage.src = siege.map_src || '/assets/maps/calista-map.png';

  supabase
    .channel(`game-${siege.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      (payload) => applySiegeUpdate(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      () => {
        // After the match has ended, the row delete is just cleanup
        // triggered by either player clicking Lobby on the end overlay.
        // Don't bounce — let the user read their reward and leave when
        // they want via their own button.
        if (matchEnded) return;
        showAlert('☠ THE SIEGE WAS DISBANDED', 'error');
        setTimeout(returnToLobby, 900);
      })
    .subscribe();
}
