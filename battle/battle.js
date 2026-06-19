/* ═══════════════════════════════════════════════
   GAME PAGE
   Both players build their wave from the
   3 unit types they locked in during siege-setup, hit
   "Lock In" → spawning begins on the canvas.
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { enforceSingleSession } from '/lib/single-session.js';
import { UNITS_BY_ID, idleSpriteUrl, deployCost, deployCostById } from '/lib/units.js';
import { getMap, getMapKeyForWave } from '/src/data/maps.js';
import { Archer } from '/src/classes/Archer.js';
import { Knight } from '/src/classes/Knight.js';
import { Orc } from '/src/classes/Orc.js';
import { Soldier } from '/src/classes/Soldier.js';
import { Swordsman } from '/src/classes/Swordsman.js';
import { Slime } from '/src/classes/Slime.js';
import { Skeleton } from '/src/classes/Skeleton.js';
import { MeleeUnit } from '/src/classes/MeleeUnit.js';
import { Tower } from '/src/classes/Tower.js';
import { Unit } from '/src/classes/Unit.js';
import { sim } from '/src/runtime/sim.js';
import { contribution, resetContribution, creditTowerKill } from '/src/runtime/contribution.js';


import {
  resetLeaderboard,
  setLeaderboardNames,
  setCurrentWave,
  getLeaderboardRows,
  leaderboardState,
} from '/src/runtime/leaderboard.js';

let blastImage = new Image();
let blastLoaded = false;

blastImage.onload = () => {
  blastLoaded = true;
};

blastImage.src = "/assets/effects/blast.png";

// ── DIFFICULTY KNOBS ──
const STARTING_GOLD = { recruit: 300, veteran: 250, elite: 200 };
const QUEUE_CAP = { recruit: 10, veteran: 8, elite: 6 };
const goldForDifficulty = (d) => STARTING_GOLD[d] ?? 250;
const queueCapForDifficulty = (d) => QUEUE_CAP[d] ?? 8;
const DEMO_TOTAL_WAVES = 3;

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
const levelCompleteOverlay = document.getElementById('levelCompleteOverlay');
const levelCompleteTitleEl = document.getElementById('levelCompleteTitle');
const levelCompleteBodyEl = document.getElementById('levelCompleteBody');
const levelStatTowersEl = document.getElementById('levelStatTowers');
const levelStatLivesEl = document.getElementById('levelStatLives');
const levelStatUnitsEl = document.getElementById('levelStatUnits');
const nextLevelBtn = document.getElementById('nextLevelBtn');

// Reconnect indicator on the ally side. Toggled from the presence
// channel subscription (see further down). The badge sits on the
// banner sprite, the status caption sits under the ally's name, and
// the .is-reconnecting class on the parent .game-player-other drains
// colour from the whole block so the absence reads at a glance.
const otherPlayerEl = document.querySelector('.game-player-other');
const otherReconnectingEl = document.getElementById('otherReconnecting');
const otherStatusEl = document.getElementById('otherStatus');

// Settings menu + abandon-siege flow (decorative pause/speed buttons
// stay no-ops for now). The menu hangs below the ⚙ button; Abandon
// opens a confirmation modal that ultimately calls disbandAndLeave().
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const abandonSiegeBtn = document.getElementById('abandonSiegeBtn');
const abandonOverlay = document.getElementById('abandonOverlay');
const abandonCancelBtn = document.getElementById('abandonCancelBtn');
const abandonConfirmBtn = document.getElementById('abandonConfirmBtn');
const abandonConfirmText = document.getElementById('abandonConfirmText');
const abandonConfirmLoading = document.getElementById('abandonConfirmLoading');
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
let currentMapConfig = null;

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
let totalUnitsDeployedCount = 0;
let explosions = [];
let path = [];
let towerLocations = [];
let currentMapKey = null;
// Single end-of-match guard (used for both victory and defeat) so the
// spawn timeline, settle timer, and overlay flips all key off the same
// flag instead of victory-only logic.
let matchEnded = false;
let levelCompleteOpen = false;

// Observer / reconnect state
let observingMode = false;
let latestSnapshot = null;
let latestSnapshotIsSeed = false;

let battleBroadcastTimer = null;
let snapshotPersistTimer = null;
let battleBroadcastChannel = null;

const clearBattleSyncTimers = () => {
  if (battleBroadcastTimer) {
    clearInterval(battleBroadcastTimer);
    battleBroadcastTimer = null;
  }
  if (snapshotPersistTimer) {
    clearInterval(snapshotPersistTimer);
    snapshotPersistTimer = null;
  }
};

const startBattleSyncTimers = () => {
  if (!battleBroadcastChannel) return;

  clearBattleSyncTimers();

  const sendSnapshotNow = () => {
    if (!battleStarted || observingMode) return;
    if (siege?.outcome) return;

    const payload = buildBattleSnapshot();
    battleBroadcastChannel.send({
      type: 'broadcast',
      event: 'snapshot',
      payload,
    });

    return payload;
  };

  // Immediate push so observer doesn't start empty
  const firstPayload = sendSnapshotNow();

  battleBroadcastTimer = setInterval(() => {
    sendSnapshotNow();
  }, 200);

  snapshotPersistTimer = setInterval(() => {
    if (!battleStarted || observingMode) return;
    if (siege?.outcome) return;

    const payload = buildBattleSnapshot();

    supabase
      .rpc('upsert_siege_snapshot', {
        p_siege: siege.id,
        p_state: payload,
      })
      .then(({ error }) => {
        if (error) console.warn('snapshot persist failed', error);
      });
  }, 500);

  return firstPayload;
};

const buildBattleSnapshot = () => ({
  ts: Date.now(),
  wave: siege?.current_wave ?? 1,
  mapKey: currentMapKey,
  phase: siege?.phase ?? null,

  units: attackUnits
    .filter(u => !u.isDead)
    .map(u => ({
      x: Math.round(u.position?.x ?? 0),
      y: Math.round(u.position?.y ?? 0),
      t: u.team,
      u: u.unitId || u.constructor?.name || 'Soldier',
      h: Math.max(0, Math.round(u.health ?? 0)),
      m: Math.max(1, Math.round(u.maxHealth ?? 1)),
      a: (u.target && (u.target.health ?? 1) > 0) ? 1 : 0,
    })),

  towers: towers.map((t, i) => ({
    i: towersDestroyedCount + i,
    h: Math.max(0, Math.round(t.health ?? 0)),
    m: Math.max(1, Math.round(t.maxHealth ?? 1)),
  })),

  projectiles: towers.flatMap((tower, towerIndex) =>
    (tower.projectiles || []).map((p, projectileIndex) => ({
      id: `${towerIndex}-${projectileIndex}`,
      x: Math.round(p.x),
      y: Math.round(p.y),
    }))
  ),

  td: towersDestroyedCount,
});

// "Observing" mode — set when this client lands on battle.html with a
// wave already in flight on the OTHER client (refresh / reconnect
// mid-wave). The local sim doesn't run; instead we render from the
// most recent broadcast snapshot (see battleBroadcast channel near
// the bottom of init). Reset to false when the wave resolves
// (applySiegeUpdate's 'prep' transition).
// True while latestSnapshot came from a one-shot DB read (seed or
// watchdog refetch) rather than a live broadcast / Postgres CDC push.
// Promotion is intentionally NOT triggered off seed-only data within
// the first few seconds — the DB seed can be moments old AND units in
// it can be near the spawn point, so promoting from it would visually
// "rewind" the wave on the refreshing client.

// "Lives" in the HUD represents wave-attempts remaining — the team can
// fail one wave per remaining attempt. Derived from current_wave /
// total_waves on the siege row so there's no separate column to keep in
// sync. Defeat triggers when this hits 0 (failure on the last wave).



const livesRemaining = () => {
  const current = siege?.current_wave ?? 1;
  const total = Math.min(siege?.total_waves ?? DEMO_TOTAL_WAVES, DEMO_TOTAL_WAVES);
  return Math.max(0, total - current + 1);
};

const livesMax = () => Math.min(siege?.total_waves ?? DEMO_TOTAL_WAVES, DEMO_TOTAL_WAVES);

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

const getLevelBannerText = (wave) => {
  if (wave === 1) return '⚔ LEVEL 1 — CALISTA ⚔';
  if (wave === 2) return '⚔ LEVEL 2 — ARSHDEEP MAP ⚔';
  if (wave <= 4) return '⚔ LEVEL 3 — CANYON ⚔';
  return '⚔ LEVEL 4 — FORTRESS ⚔';
};

// Supports either of these maps.js styles:
//   getMap('calista')
// or
//   getMap(1)
const resolveMapConfig = (wave) => {
  const key = getMapKeyForWave(wave);

  const byKey = getMap(key);
  if (byKey && Array.isArray(byKey.path) && Array.isArray(byKey.towers)) {
    return { key, config: byKey };
  }

  const byWave = getMap(wave);
  if (byWave && Array.isArray(byWave.path) && Array.isArray(byWave.towers)) {
    return { key, config: byWave };
  }

  return { key, config: null };
};

const applyMapForWave = (wave, { force = false, announce = false } = {}) => {
  const { key: mapKey, config: mapConfig } = resolveMapConfig(wave);
  if (!mapConfig) {
    console.error('[battle] map config not found for wave', wave, mapKey);
    return false;
  }

  currentMapConfig = mapConfig;

  // Always keep these current so units/pathing use the right layout
  path = mapConfig.path.map(p => ({ x: p.x, y: p.y }));

  towerLocations = mapConfig.towers.map(t => ({ x: t.x, y: t.y }));

  // If the level did not actually change, do not reload/reset
  if (!force && mapKey === currentMapKey) {
    return false;
  }

  currentMapKey = mapKey;

  // Reset battlefield for the new level
  mapLoaded = false;

  attackUnits = [];
  towers.length = 0;
  unitsDeployedCount = 0;
  explosions = [];
  waveJudged = false;

  towersDestroyedCount = 0;
  totalTowers = 0;
  latestSnapshot = null;
  latestSnapshotIsSeed = false;
  observingMode = false;
  observedDisplayPos.clear();


  if (waveSettleTimer) {
    clearTimeout(waveSettleTimer);
    waveSettleTimer = null;
  }

  clearBattleSyncTimers();

  backgroundImage.src = mapConfig.background;

  if (announce) {
    showAlert(getLevelBannerText(wave), 'info');
  }

  return true;
};

const smoothNavigate = (url) => {
  console.info('[battle:navigate]', { from: window.location.href, to: url });
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

// Latest tab/device wins — opening a new session anywhere else for
// this account signs THIS tab out and bounces it to /login.
enforceSingleSession(user);

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

  setCurrentWave(current);

  const lineEl = document.querySelector('.game-wave-line');
  if (lineEl) {
    lineEl.style.setProperty('--wave-pct', `${((current - 1) / Math.max(1, total - 1)) * 100}%`);
  }
};

const leaderboardBodyEl = document.getElementById('leaderboardBody');
const leaderboardWaveEl = document.getElementById('leaderboardWaveValue');

const renderLeaderboard = () => {
  if (!leaderboardBodyEl) return;

  const rows = getLeaderboardRows();

  if (leaderboardWaveEl) {
    leaderboardWaveEl.textContent = String(leaderboardState.wave);
  }

  leaderboardBodyEl.innerHTML = rows.map(row => `
    <div class="game-leaderboard-row is-${row.side}">
      <span class="game-leaderboard-rank">#${row.rank}</span>
      <span class="game-leaderboard-name">${escapeHtml(row.name)}</span>
      <span class="game-leaderboard-deaths">${row.unitDeaths}</span>
    </div>
  `).join('');
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

  setLeaderboardNames({
    hostName: siege.host_username || 'HOST',
    allyName: siege.ally_username || 'ALLY',
  });
  setCurrentWave(siege.current_wave || 1);

  renderHeader();
  renderTypes(selfTypesEl, myTypes, !battleStarted, myRemaining, myQueue.length >= queueCap, selfTypesCountEl);
  renderTypes(otherTypesEl, otherTypes, false, 0, false, otherTypesCountEl);
  renderQueue(selfQueueEl, myQueue, queueCap, !battleStarted, selfQueueCountEl);
  renderQueue(otherQueueEl, otherQueue, queueCap, false, otherQueueCountEl);
  renderReadyControls();
  renderLeaderboard();
};

// ── SIEGE UPDATES ──
// Direct UPDATEs on the row are only used for columns NOT locked by
// migration 008's `sieges_block_battle` trigger — i.e. setup-phase
// columns like host_units / host_ready. All battle-runtime mutations
// (gold, queue, queue_ready, current_wave, phase, outcome, contribution)
// must go through the security-definer RPCs below; a direct UPDATE on
// any of those columns will be rejected with `battle_columns_locked`.
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

// Thin wrapper around supabase.rpc that surfaces server-side errors
// (insufficient_gold, queue_full, unit_not_owned, …) as user-visible
// medieval alerts. The RPC's row-return is fed back through
// applySiegeUpdate so the UI reconciles before realtime echoes.
//
// `silentErrors` lists error codes that are expected for this caller
// and should be swallowed without an alert (still console-logged so
// they're discoverable). Used by award_tower_kill, where racing the
// match-end RPC is benign — the player just misses 80 gold on the
// final tower, but the match is ending anyway, so showing "THE MOMENT
// HAS PASSED" during the victory overlay is just noise.
// Errors that are part of normal multiplayer racing — the user has no
// action to take, so suppress the visible alert (still log to console).
// not_both_ready: caller hit lock-in/start before the partner readied.
//                 The HUD already shows "waiting for ally" so a popup is
//                 redundant noise.
// wrong_phase:    siege row was updated by the other client between the
//                 caller's check and the RPC landing — idempotent races.
const SILENT_BATTLE_ERRORS = new Set(['not_both_ready']);

const callBattleRpc = async (name, args, applyShape, silentErrors = []) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const code = String(error.message || '').split(':')[0].trim();
    if (silentErrors.includes(code) || SILENT_BATTLE_ERRORS.has(code)) {
      console.warn(`${name} returned ${code} (silenced)`);
      return null;
    }
    const msg = ({
      insufficient_gold: '✗ NOT ENOUGH GOLD',
      queue_full: '✗ QUEUE FULL',
      unit_not_owned: '✗ UNIT NOT IN THY HOST',
      empty_queue: '✗ QUEUE AT LEAST ONE UNIT FIRST',
      wrong_phase: '✗ THE MOMENT HAS PASSED',
      host_only: '✗ ONLY THE HOST MAY DO THAT',
      not_a_player: '✗ THOU ART NOT IN THIS SIEGE',
      final_wave_no_advance: '✗ NO WAVES REMAIN',
    })[code] || `✗ ${code.toUpperCase().replace(/_/g, ' ')}`;
    console.error(`${name} failed`, error);
    showAlert(msg, 'error');
    return null;
  }
  if (data && applyShape) {
    // RPCs that return a row of mutated columns hand them back as the
    // first/only element of the result array. Merge into the local row.
    const row = Array.isArray(data) ? data[0] : data;
    if (row) applySiegeUpdate({ ...siege, ...row });
  }
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

// All queue mutations now go through migration 008's RPCs. The local
// catalog still drives the UI's pre-flight checks (so we can disable
// unaffordable cards before the round-trip), but the *authoritative*
// cost / cap / ownership / balance checks happen inside queue_unit on
// the server. A tampered client can't sneak past those.
const addToQueue = async (unitId) => {
  if (!siege || battleStarted) return;
  // Cheap local pre-flight — keeps the alert snappy and avoids a
  // pointless server round-trip on the obvious "no gold" case. The
  // server check is the real authority and will reject the call if
  // anything looks off (different price, full queue, unowned unit).
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) return;
  const myTypes = siege[isHost ? 'host_units' : 'ally_units'] || [];
  if (!myTypes.includes(unitId)) return;
  const queue = siege[isHost ? 'host_queue' : 'ally_queue'] || [];
  if (queue.length >= queueCap) { showAlert(`✗ QUEUE FULL (${queueCap} MAX)`, 'error'); return; }
  if (deployCost(unit) > myGoldNow()) { showAlert('✗ NOT ENOUGH GOLD', 'error'); return; }

  await callBattleRpc('queue_unit', { p_siege: siege.id, p_unit: unitId }, true);
};

const removeFromQueue = async (idx) => {
  if (!siege || battleStarted) return;
  const queue = siege[isHost ? 'host_queue' : 'ally_queue'] || [];
  if (idx < 0 || idx >= queue.length) return;
  await callBattleRpc('dequeue_unit', { p_siege: siege.id, p_idx: idx }, true);
};

const toggleReady = async () => {
  if (!siege || battleStarted) return;
  const mySide = isHost ? 'host' : 'ally';
  const queue = siege[`${mySide}_queue`] || [];
  if (queue.length === 0) return;
  const readyKey = `${mySide}_queue_ready`;
  const next = !siege[readyKey];
  // Optimistic local flip so the button updates instantly; the
  // realtime echo from the RPC's UPDATE will reconcile in ~100ms.
  applySiegeUpdate({ ...siege, [readyKey]: next });
  await callBattleRpc(next ? 'lock_in_wave' : 'unlock_wave', { p_siege: siege.id }, false);
};

readyBtn.addEventListener('click', toggleReady);

// ── BATTLE RUNTIME ──
const initialiseTowers = () => {
  towers.length = 0;

  const showSprite = currentMapConfig?.drawGeneratedTowers !== false;

  for (const location of towerLocations) {
    towers.push(
      new Tower(location, gameCanvas, {
        showSprite,
        barOffsetX: location.barOffsetX || 0,
        barOffsetY: location.barOffsetY || 0,
      })
    );
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
  else if (lower === 'orc') unit = new Orc(position, gameCanvas);
  else if (lower === 'soldier') unit = new Soldier(position, gameCanvas);
  else if (lower === 'swordsman') unit = new Swordsman(position, gameCanvas);
  else if (lower === 'slime') unit = new Slime(position, gameCanvas);
  else if (lower === 'skeleton') unit = new Skeleton(position, gameCanvas);
  else unit = new PlaceholderUnit(position, gameCanvas, id);
  unit.laneOffset = (typeof laneOffset === 'number') ? laneOffset : 0;
  unit.pathRef = path;
  unit.pathIndex = 1;   // ✅ VERY IMPORTANT
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
  const spacing = 24;
  const dir = pathStartDirection();
  // Snapshot the current attempt — pending timeouts compare against this
  // and drop themselves if the wave has been re-armed since they were
  // scheduled. Survives both wave failure and wave advancement.
  const myAttempt = waveAttemptId;

  const formationLaneOffset = (baseLaneOffset, index) => {
    const slots = [0, -6, 6, -3, 3];
    return baseLaneOffset + slots[index % slots.length];
  };

  const formationPathSpacing = (index) => {
    const row = Math.floor(index / 5);
    const slots = [0, 18, 18, 36, 36];
    return row * (spacing * 3) + slots[index % slots.length];
  };

  const spawn = (queue, laneOffset, team) => {
    queue.forEach((unitId, i) => {
      setTimeout(() => {
        if (matchEnded) return;
        if (myAttempt !== waveAttemptId) return; // stale wave — drop
        const pos = { x: path[0].x, y: path[0].y };
        const unit = createUnitFromId(unitId, pos, formationLaneOffset(laneOffset, i));
        unit.team = team;
        unit.ownerId = team;
        const pathSpacing = formationPathSpacing(i);
        unit.position.x -= dir.x * pathSpacing;
        unit.position.y -= dir.y * pathSpacing;
        attackUnits.push(unit);
        unitsDeployedCount++;
        totalUnitsDeployedCount++;
      }, i * spawnGap);
    });
  };

  spawn(hostQueue, -16, 'host');
  spawn(allyQueue, 16, 'ally');

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
  console.info('[battle:end]', { outcome, origin: window.location.origin, href: window.location.href });
  if (waveSettleTimer) { clearTimeout(waveSettleTimer); waveSettleTimer = null; }
  clearBattleSyncTimers();

  const overlay = outcome === 'victory' ? victoryOverlay : defeatOverlay;
  const statsOf = outcome === 'victory'
    ? { towers: statTowersEl, lives: statLivesEl, units: statUnitsEl }
    : { towers: statTowersDefeatEl, lives: statLivesDefeatEl, units: statUnitsDefeatEl };

  if (statsOf.towers) statsOf.towers.textContent = `${towersDestroyedCount} / ${totalTowers}`;
  if (statsOf.lives)  statsOf.lives.textContent = `${livesRemaining()} / ${livesMax()}`;
  if (statsOf.units)  statsOf.units.textContent = String(totalUnitsDeployedCount);

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  // Only the host writes outcome + contribution so the two clients don't
  // race the payout RPC. The ally sees the row update via realtime and
  // calls award_match_points too — the second call hits the idempotency
  // guard ('already_paid') and we treat that as a no-op so both HUDs
  // render their reward.
  //
  // The terminal-state write goes through set_match_outcome — the
  // trigger blocks direct writes to outcome/phase/contribution to
  // stop a tampered client from inventing a victory on a loss.
  //
  // Either player may now make this call (mig 013). Originally
  // host-only, but after a both-refresh recovery the host's
  // reconstructed sim may never reach victory locally while the
  // ally's does, and the match would hang. RPC is idempotent on
  // phase='complete' so racing calls just no-op on the second one.
  if (siege.outcome !== outcome) {
    await callBattleRpc('set_match_outcome', {
      p_siege: siege.id,
      p_outcome: outcome,
      p_host_contribution: contribution.host,
      p_ally_contribution: contribution.ally,
    }, false);
  }
  emit('battle-ended', { outcome });
  await claimRewards(outcome);
};

// Server-validated payout. award_match_points() splits the pool 60/40
// based on host_contribution / ally_contribution and bumps profiles.points
// for both players. Idempotent via siege.ended_at — the second client to
// call this gets 'already_paid' which we silently treat as success.
//
// The guard intentionally uses the `outcome` parameter (not siege.outcome)
// because the host calls this immediately after set_match_outcome with
// applyShape:false — so the LOCAL siege.outcome is still null when we
// arrive here. Pre-this fix, the host's guard short-circuited and the
// host never paid themselves (the ally's call still updated the DB, so
// the host's points DID get bumped server-side, but the host's HUD
// never reflected it). Using the parameter sidesteps that.

const claimRewards = async (outcome) => {
  if (!siege || (outcome !== 'victory' && outcome !== 'defeat')) return;

  // Only host performs payout RPC
  if (isHost) {
    const { error } = await supabase.rpc('award_match_points', { p_siege: siege.id });
    const alreadyPaid = error && String(error.message || '').includes('already_paid');

    if (error && !alreadyPaid) {
      console.error('award_match_points failed', error);
      return;
    }
  }

  // Both clients refresh profile totals afterwards
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meFresh, themFresh] = await Promise.all([
    supabase.from('profiles').select('points').eq('user_id', user.id).maybeSingle(),
    otherUid
      ? supabase.from('profiles').select('points').eq('user_id', otherUid).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const oldMine = mySelf?.profile?.points ?? 0;
  const newMine = meFresh?.data?.points ?? oldMine;
  const myAward = newMine - oldMine;

  if (mySelf?.profile) {
    mySelf.profile.points = newMine;
    if (selfPointsEl) selfPointsEl.textContent = String(newMine);
  }

  if (themFresh?.data && myOther?.profile) {
    myOther.profile.points = themFresh.data.points;
    if (otherPointsEl) otherPointsEl.textContent = String(themFresh.data.points);
  }

  const target = outcome === 'victory' ? rewardPointsEl : rewardPointsDefeatEl;
  if (target) target.textContent = `+ ${Math.max(0, myAward)}`;
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

// ── SETTINGS MENU + ABANDON SIEGE ─────────────
// The ⚙ button toggles a dropdown menu anchored beneath it. Today
// the menu just hosts the Abandon Siege action; pause/speed/etc.
// can be added as additional .game-settings-menu-item children
// without touching this handler.
const openSettingsMenu = () => {
  settingsMenu.classList.remove('hidden');
  settingsMenu.setAttribute('aria-hidden', 'false');
  settingsBtn.setAttribute('aria-expanded', 'true');
};
const closeSettingsMenu = () => {
  settingsMenu.classList.add('hidden');
  settingsMenu.setAttribute('aria-hidden', 'true');
  settingsBtn.setAttribute('aria-expanded', 'false');
};
const isSettingsMenuOpen = () => !settingsMenu.classList.contains('hidden');

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (isSettingsMenuOpen()) closeSettingsMenu();
  else openSettingsMenu();
});

// Outside-click closes the menu; clicks on the menu itself
// (handled by stopPropagation on each menu item that does work)
// keep it open.
document.addEventListener('click', (e) => {
  if (!isSettingsMenuOpen()) return;
  if (settingsMenu.contains(e.target)) return;
  if (e.target === settingsBtn) return;
  closeSettingsMenu();
});

// ── ABANDON CONFIRMATION ──────────────────────
const openAbandonModal = () => {
  closeSettingsMenu();
  abandonOverlay.classList.remove('hidden');
  abandonOverlay.setAttribute('aria-hidden', 'false');
  abandonConfirmBtn.disabled = false;
  abandonConfirmText.style.display = 'inline';
  abandonConfirmLoading.style.display = 'none';
  // Focus the cancel button by default — fewer fat-finger abandons.
  setTimeout(() => abandonCancelBtn.focus(), 30);
};
const closeAbandonModal = () => {
  abandonOverlay.classList.add('hidden');
  abandonOverlay.setAttribute('aria-hidden', 'true');
};

abandonSiegeBtn.addEventListener('click', openAbandonModal);
abandonCancelBtn.addEventListener('click', closeAbandonModal);
abandonOverlay.addEventListener('click', (e) => {
  if (e.target === abandonOverlay) closeAbandonModal();
});

// Escape closes whichever surface is open (modal first, then menu).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!abandonOverlay.classList.contains('hidden')) {
    e.stopImmediatePropagation();
    closeAbandonModal();
    return;
  }
  if (isSettingsMenuOpen()) {
    e.stopImmediatePropagation();
    closeSettingsMenu();
  }
}, true);

// Confirming abandon deletes the siege row. That fires the realtime
// DELETE event for both clients: the abandoning player sees the
// "ye have abandoned" alert below before being bounced, the OTHER
// player rides the existing postgres_changes DELETE handler at the
// bottom of this file, which surfaces "☠ THE SIEGE WAS DISBANDED"
// and returns them to the lobby. matchEnded is intentionally left
// false here so that DELETE handler does fire — disbandAndLeave
// sets nothing relevant before issuing the delete.
abandonConfirmBtn.addEventListener('click', async () => {
  abandonConfirmBtn.disabled = true;
  abandonConfirmText.style.display = 'none';
  abandonConfirmLoading.style.display = 'inline';
  // Local feedback for the player who pressed Abandon — the other
  // player will see the generic disband alert via realtime.
  showAlert('☠ YE HAVE ABANDONED THE SIEGE', 'error');
  await disbandAndLeave(abandonConfirmBtn);
});

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

  // Host-only: the server-side award_tower_kill RPC re-derives the
  // reward amount from difficulty_settings so we don't have to (and
  // a tampered client can't claim a tower was worth 999 gold). The
  // `reward` field on the event is now informational only — kept on
  // the event so contribution.js can still log the kill, but it's
  // not what the server pays out on.
  //
  // wrong_phase is silenced: when the FINAL tower dies, this RPC
  // races set_match_outcome (fired from the wave-completed handler
  // in the same frame). If set_match_outcome lands first, phase
  // flips to 'complete' and this call is rejected with wrong_phase
  // — surfacing that as an alert would show "THE MOMENT HAS PASSED"
  // right as the victory overlay animates in. Benign loss of 80 gold
  // on the very last tower, match is over anyway.
  if (isHost) {
    callBattleRpc('award_tower_kill', { p_siege: siege.id }, true, ['wrong_phase']);
  }
});

// All towers destroyed = victory, regardless of which wave we're on.
// Clearing the map early is the win condition; remaining waves are
// "you had room to spare," not unfinished work.
battleEvents.addEventListener('wave-completed', async () => {
  const current = siege.current_wave || 1;

  // FINAL LEVEL → custom ending
  if (current >= 3) {   // 👈 IMPORTANT (since you said Level 3 is final)

    // Change overlay text BEFORE showing it
    if (victoryOverlay) {
      const title = document.getElementById('victoryTitle');
      const body = victoryOverlay.querySelector('.game-victory-body');

      if (title) title.textContent = '🏆 ALL LEVELS CLEARED 🏆';
      if (body) body.innerHTML = `
        THOU HAST CONQUERED EVERY BATTLEFIELD.<br/>
        THE REALM STANDS SECURE.
      `;
    }

    await showEndOverlay('victory');
    return;
  }

  showLevelCompleteOverlay(current);
});

const closeLevelCompleteOverlay = () => {
  levelCompleteOpen = false;
  if (!levelCompleteOverlay) return;
  levelCompleteOverlay.classList.add('hidden');
  levelCompleteOverlay.setAttribute('aria-hidden', 'true');
  if (nextLevelBtn) nextLevelBtn.disabled = false;
};

const showLevelCompleteOverlay = (wave) => {
  levelCompleteOpen = true;

  if (levelCompleteTitleEl) {
    levelCompleteTitleEl.textContent = `⚔ ${getLevelBannerText(wave)} COMPLETE ⚔`;
  }

  if (levelCompleteBodyEl) {
    levelCompleteBodyEl.innerHTML = `THE FIELD HATH BEEN CONQUERED.<br/>PREPARE THY HOST FOR THE NEXT ASSAULT.`;
  }

  if (levelStatTowersEl) levelStatTowersEl.textContent = `${towersDestroyedCount} / ${totalTowers}`;
  if (levelStatLivesEl) levelStatLivesEl.textContent = `${livesRemaining()} / ${livesMax()}`;
  if (levelStatUnitsEl) levelStatUnitsEl.textContent = String(unitsDeployedCount);

  if (nextLevelBtn) {
    nextLevelBtn.disabled = !isHost;
    nextLevelBtn.textContent = isHost
      ? '▶ MARCH TO NEXT LEVEL'
      : '⌛ AWAITING HOST';
  }

  if (levelCompleteOverlay) {
    levelCompleteOverlay.classList.remove('hidden');
    levelCompleteOverlay.setAttribute('aria-hidden', 'false');
  }
};

// Wave failed (all friendly units dead, towers still standing). The team
// gets to try again on the next wave — the HUD heart counter is derived
// from total_waves - current_wave + 1, so just bumping current_wave is
// enough to tick the counter down. There is no separate team_lives
// column to maintain.
//
// If this was the last wave, that's defeat. Otherwise the host bumps
// current_wave + clears the queues so both clients re-enter prep.
battleEvents.addEventListener('wave-failed', async () => {
  const current = siege.current_wave || 1;
  const total = livesMax();

  if (current >= total) {
    if (isHost) await showEndOverlay('defeat');
    return;
  }

  await callBattleRpc('advance_wave', { p_siege: siege.id }, false);
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

// ── STUCK-WAVE RESUME ───────────────────────────────────────
// When we enter observingMode and stop getting fresh snapshots (the
// other peer is also gone), neither client is simming and the wave
// freezes. The recovery is to PROMOTE this client back to simmer by
// reconstructing the in-flight battlefield from the most recent
// snapshot. Units are recreated at their broadcast positions with
// their broadcast HP, and their pathIndex is derived from where on
// the lane they actually sit (closest path-segment). Tower HP is
// already synced via the observed render's catchup loop. After
// promotion the local sim resumes, attackUnits is canonical again,
// and snapshots start flowing back out to the other client.
//
// Both clients running this simultaneously is fine: it restores the
// original "both clients sim" model. Tower kills + wave advancement
// route through idempotent RPCs (award_tower_kill, advance_wave), so
// any state divergence is reconciled at the server.

// Find the path segment closest to (x, y) and return the END waypoint
// index — that's the index a unit at this position should be heading
// toward. Standard "project point onto segment, find min distance".
const nearestPathSegmentEnd = (x, y) => {
  let bestDistSq = Infinity;
  let bestEnd = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].x, ay = path[i].y;
    const bx = path[i + 1].x, by = path[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((x - ax) * dx + (y - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distSq = (x - px) * (x - px) + (y - py) * (y - py);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestEnd = i + 1;
    }
  }
  return bestEnd;
};

const promoteToSimmer = () => {
  // Disabled for now to keep host authoritative and both players in sync.
  // Observer client should never take over simulation automatically.
  return false;
};

let stuckWatchdogTimer = null;
let observingSince = 0;
// Promote off live data fast; promote off seed-only data slow.
// The split exists because the DB seed (or watchdog refetch) can be
// moments old AND can show units near the spawn point — promoting from
// it visually "rewinds" the wave on the refreshing client. We only
// trust seed data once we've waited long enough that the live channel
// has clearly failed.
const STUCK_MIN_OBSERVING_MS = 2500;
const STUCK_SNAPSHOT_MAX_AGE = 2500;        // gap for FRESH (live) data
const STUCK_DB_REFETCH_AGE = 1500;
const STUCK_SEED_FALLBACK_MS = 8000;        // only promote off seed after this

const startStuckWaveWatchdog = () => {
  if (stuckWatchdogTimer) clearInterval(stuckWatchdogTimer);
  observingSince = Date.now();
  let lastDbRefetchAt = 0;

  stuckWatchdogTimer = setInterval(async () => {
    if (!observingMode || matchEnded || siege?.outcome) {
      clearInterval(stuckWatchdogTimer);
      stuckWatchdogTimer = null;
      return;
    }

    const observingFor = Date.now() - observingSince;
    const snapAge = latestSnapshot?.ts
      ? Date.now() - latestSnapshot.ts
      : Number.POSITIVE_INFINITY;

    if (observingFor < STUCK_MIN_OBSERVING_MS) return;

    // If we suspect staleness, poke the DB for the most recent snapshot
    // before declaring stuck. Throttled so we don't hammer the API.
    if (snapAge > STUCK_DB_REFETCH_AGE && Date.now() - lastDbRefetchAt > 1000) {
      lastDbRefetchAt = Date.now();
      const { data } = await supabase.rpc('get_siege_snapshot', { p_siege: siege.id });
      if (!observingMode) return;
      if (data) {
        // Reject stale / wrong-wave / wrong-map snapshots
        if ((data.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
        if (data.mapKey && currentMapKey && data.mapKey !== currentMapKey) return;

        const dbTs = data.ts || 0;
        const curTs = latestSnapshot?.ts || 0;
        if (dbTs >= curTs) {
          latestSnapshot = data;
          latestSnapshotIsSeed = true;
        }
      }
    }

    const freshSnapAge = latestSnapshot?.ts
      ? Date.now() - latestSnapshot.ts
      : Number.POSITIVE_INFINITY;
    if (freshSnapAge < STUCK_SNAPSHOT_MAX_AGE) return;

    // We can only safely take over if we have units to reconstruct.
    // Without a snapshot we have no way to know what was on the field
    // — and firing advance_wave here would bump the wave counter and
    // wipe the queues, which the user perceives as "the wave restarted
    // from scratch". So if there's nothing to promote from, keep
    // waiting (the server-side watchdog from migration 012 handles
    // the truly-abandoned case after 60s).
    if (!latestSnapshot || !Array.isArray(latestSnapshot.units) || latestSnapshot.units.length === 0) {
      return;
    }

    // Hold off on promotion if all we have is seed/CDC-refetch data
    // and we haven't waited long enough — the live broadcast subscription
    // might just be slow. Promoting off a stale seed places units near
    // their spawn point even though the actual wave has progressed far
    // beyond that, which reads to the user as "the wave restarted".
    // After STUCK_SEED_FALLBACK_MS the peer is presumed gone for good
    // and we promote off whatever we have.
    if (latestSnapshotIsSeed && observingFor < STUCK_SEED_FALLBACK_MS) {
      return;
    }

    clearInterval(stuckWatchdogTimer);
    stuckWatchdogTimer = null;

    if (promoteToSimmer()) {
      showAlert('⚔ RESUMING COMMAND OF THE FIELD', 'success');
    }
  }, 500);
};

if (nextLevelBtn) {
  nextLevelBtn.addEventListener('click', async () => {
    if (!siege || matchEnded) return;

    if (!isHost) {
      showAlert('⌛ AWAITING HOST TO MARCH', 'info');
      return;
    }

    nextLevelBtn.disabled = true;

    // Host advances the shared row
    const data = await callBattleRpc('advance_wave', { p_siege: siege.id }, false);

    // Apply the returned row immediately on the host too,
    // so the host does not wait for realtime echo.
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      applySiegeUpdate({ ...siege, ...row });
    }
  });
}
// Tracks each observed unit's *displayed* position so we can ease it
// toward the latest snapshot position instead of teleporting 200ms at
// a time. Keyed by `${team}|${unitType}|${index}` — units broadcast
// in spawn order, so the index is stable enough for visual purposes
// (mismatches just snap, never drift).
const observedDisplayPos = new Map();
const OBSERVED_LERP_PER_MS = 0.012; // per ms; ~92%/frame over a 200ms gap
const observedKey = (u, i) => `${u.t}|${u.u}|${i}`;

const renderObservedState = () => {
  if (!latestSnapshot) {
    towers.forEach(t => t.render());
    return;
  }
  const snap = latestSnapshot;

  // Catch up tower destructions. snap.td is the simming client's
  // running towersDestroyedCount; we shift towers off our local
  // array (and spawn explosions) until we match.
  while (towersDestroyedCount < snap.td && towers.length > 0) {
    const dead = towers.shift();
    towersDestroyedCount++;
    if (dead?.centre) spawnExplosion(dead.centre.x, dead.centre.y);
  }
  updateWaveProgress();

  // OBSERVED VICTORY DETECTION ─────────────────────────────────
  // When the snapshot reports all towers destroyed, the wave is won
  // — regardless of whether our local sim has reached that state.
  // Both peers see the same snapshot, so both fire showEndOverlay in
  // the same frame: the host's call inside it writes set_match_outcome
  // (host-only), and the ally just shows the overlay locally and waits
  // for the row update to land. This is the fix for "victory screen
  // doesn't pop up when both refresh" — without it, an ally who reached
  // the final tower locally could hang waiting for the host's sim to
  // catch up. Guarded by !matchEnded so it only fires once per match.

  const currentWave = siege?.current_wave ?? 1;
  const allTowersGone =
    totalTowers > 0 &&
    towers.length === 0 &&
    towersDestroyedCount >= totalTowers &&
    Array.isArray(snap.towers) &&
    snap.towers.length === 0;

  if (!matchEnded && allTowersGone) {
    // Final level -> victory
    if (currentWave >= DEMO_TOTAL_WAVES) {
      showEndOverlay('victory');
      return;
    }

    // Non-final level -> both players should see level complete
    if (!levelCompleteOpen) {
      battleStarted = false;
      observingMode = false;
      clearBattleSyncTimers();
      showLevelCompleteOverlay(currentWave);
    }
    return;
  }

  // Sync remaining towers' HP from the snapshot.
  for (const t of snap.towers || []) {
    const idx = t.i - snap.td;
    if (idx >= 0 && idx < towers.length) {
      towers[idx].health = t.h;
    }
  }

  towers.forEach(tower => tower.render());

  // Frame-rate-independent ease toward each unit's snapshot position.
  // The result is smooth motion at the canvas's full refresh rate even
  // though we only receive 5 snapshots per second.
  const dt = Math.max(1, Math.min(100, sim.dt));
  const alpha = Math.min(1, OBSERVED_LERP_PER_MS * dt);

  const seenKeys = new Set();
  const units = snap.units || [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const key = observedKey(u, i);
    seenKeys.add(key);

    let disp = observedDisplayPos.get(key);
    if (!disp) {
      disp = { x: u.x, y: u.y };
      observedDisplayPos.set(key, disp);
    } else {
      disp.x += (u.x - disp.x) * alpha;
      disp.y += (u.y - disp.y) * alpha;
    }

    drawObservedUnit(u, disp.x, disp.y);
  }

  drawObservedProjectiles(snap.projectiles || []);
  // Purge stale entries so the map doesn't grow unboundedly across waves.
  if (observedDisplayPos.size > seenKeys.size * 2) {
    for (const k of observedDisplayPos.keys()) {
      if (!seenKeys.has(k)) observedDisplayPos.delete(k);
    }
  }
};

// Lazy-loaded sprite sheets for observed units. Each entry holds the
// Image plus the inferred frame geometry — we assume sheets are
// horizontal strips of square frames (matches every unit folder under
// /assets/<Unit>/<Unit>/<Unit>-Idle.png).
//
// Keyed by `${unitId}|${kind}` so we can cache both Idle and Attack
// sheets per unit type without colliding.
const observedSpriteMeta = new Map();

const attackSpriteUrl = (unitId) =>
  `/assets/${encodeURI(unitId)}/${encodeURI(unitId)}/${unitId}-Attack01.png`;
const attackFallbackUrl = (unitId) =>
  `/assets/${encodeURI(unitId)}/${encodeURI(unitId)}/${unitId}-Attack.png`;

const ensureObservedSprite = (unitId, kind = 'idle') => {
  const cacheKey = `${unitId}|${kind}`;
  if (observedSpriteMeta.has(cacheKey)) return observedSpriteMeta.get(cacheKey);
  const meta = {
    img: new Image(),
    loaded: false,
    frameWidth: 100,
    frameHeight: 100,
    frameCount: 6,
    sheetWidth: 600,
    triedAttackFallback: false,
  };
  meta.img.onload = () => {
    meta.frameHeight = meta.img.naturalHeight;
    meta.frameWidth = meta.img.naturalHeight;  // assume square frames
    meta.sheetWidth = meta.img.naturalWidth;
    meta.frameCount = Math.max(1, Math.round(meta.sheetWidth / meta.frameWidth));
    meta.loaded = true;
  };
  meta.img.onerror = () => {
    // Some units (Priest, Skeleton Archer) ship Attack.png instead of
    // Attack01.png — retry the fallback name before giving up.
    if (kind === 'attack' && !meta.triedAttackFallback) {
      meta.triedAttackFallback = true;
      meta.img.src = attackFallbackUrl(unitId);
    }
    // Otherwise leave loaded=false; the box fallback in drawObservedUnit
    // handles missing sheets gracefully.
  };
  meta.img.src = kind === 'attack' ? attackSpriteUrl(unitId) : idleSpriteUrl(unitId);
  observedSpriteMeta.set(cacheKey, meta);
  return meta;
};

// Live-sim convention: Unit.position is the TOP-LEFT of a width×height
// hitbox (50×50 for melee). The sprite is rendered at
// (position.x - (drawWidth-width)/2, ...), so the visual offset between
// the unit's logical anchor and its sprite is 35px when drawWidth=120
// and width=50. The broadcast carries u.x/u.y = position (top-left), so
// observed mode replicates the same math here. Health bars also follow
// the live sim's drawHealthBar() — same background colour, same
// HP-ratio-based fill, same black border — so visual continuity is
// preserved across a refresh.
const OBSERVED_UNIT_WIDTH = 50;
const OBSERVED_UNIT_HEIGHT = 50;
const OBSERVED_DRAW_SIZE = 120;
const OBSERVED_VISUAL_OFFSET = (OBSERVED_DRAW_SIZE - OBSERVED_UNIT_WIDTH) / 2; // 35

const drawObservedUnit = (u, x = u.x, y = u.y) => {
  // u.a (attack flag) is set in the broadcast when the live unit had a
  // live target. Swap to the Attack sheet so observed clients see the
  // proper swing/strike instead of the idle pose. Attack sheets are
  // loaded lazily on first attacking sighting; until loaded we still
  // show the idle pose (which is already cached) as a graceful fallback.
  const unitId = u.u || 'Soldier';
  const attackMeta = u.a ? ensureObservedSprite(unitId, 'attack') : null;
  const idleMeta = ensureObservedSprite(unitId, 'idle');
  const meta = (attackMeta && attackMeta.loaded) ? attackMeta : idleMeta;

  if (meta.loaded) {
    // Attack frames run faster than idle (~70ms in the live sim) so the
    // strike reads as a strike, not a stretched idle.
    const framePeriod = (meta === attackMeta) ? 90 : 130;
    const frame = Math.floor(performance.now() / framePeriod) % meta.frameCount;
    gameCanvas.drawImage(
      meta.img,
      frame * meta.frameWidth, 0, meta.frameWidth, meta.frameHeight,
      x - OBSERVED_VISUAL_OFFSET, y - OBSERVED_VISUAL_OFFSET,
      OBSERVED_DRAW_SIZE, OBSERVED_DRAW_SIZE,
    );
  } else {
    // Box fallback while the sprite sheet loads — draw at the same
    // logical box the live sim uses.
    gameCanvas.fillStyle = u.t === 'host' ? '#4a90e2' : '#e85d2a';
    gameCanvas.fillRect(x, y, OBSERVED_UNIT_WIDTH, OBSERVED_UNIT_HEIGHT);
  }

  // HP bar — matches Unit.drawHealthBar exactly: 5px tall, full-unit-
  // width, dark grey background, HP-ratio fill, black border.
  if (u.m > 0) {
    const barW = OBSERVED_UNIT_WIDTH;
    const barH = 5;
    const bx = x;
    const by = y - 8;
    gameCanvas.fillStyle = '#3a3a3a';
    gameCanvas.fillRect(bx, by, barW, barH);
    const ratio = Math.max(0, Math.min(1, u.h / u.m));
    gameCanvas.fillStyle =
      ratio > 0.6 ? 'limegreen' :
        ratio > 0.3 ? 'yellow' :
          '#ff3b30';
    gameCanvas.fillRect(bx, by, barW * ratio, barH);
    gameCanvas.strokeStyle = 'black';
    gameCanvas.strokeRect(bx, by, barW, barH);
  }
};

const drawObservedProjectiles = (projectiles = []) => {
  for (const p of projectiles) {
    gameCanvas.save();

    gameCanvas.beginPath();
    gameCanvas.arc(p.x, p.y, 8, 0, Math.PI * 2);
    gameCanvas.fillStyle = 'rgba(255,160,60,0.25)';
    gameCanvas.fill();

    gameCanvas.beginPath();
    gameCanvas.arc(p.x, p.y, 5, 0, Math.PI * 2);
    gameCanvas.fillStyle = '#ffb347';
    gameCanvas.fill();

    gameCanvas.beginPath();
    gameCanvas.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    gameCanvas.fillStyle = '#fff5cc';
    gameCanvas.fill();

    gameCanvas.restore();
  }
};

const unitCanReachTower = (unit, tower) => {
  const dx = tower.centre.x - unit.centre.x;
  const dy = tower.centre.y - unit.centre.y;
  const distance = Math.hypot(dx, dy);
  const towerBuffer = Math.max(tower.width, tower.height) / 2;
  const meleeAdjustment = unit instanceof MeleeUnit ? -8 : 0;
  return distance <= unit.attackRadius + towerBuffer + meleeAdjustment;
};

const DEBUG_DRAW = false; // ← toggle this ON/OFF

const clearDestroyedTowers = () => {
  let clearedAny = false;

  for (let i = 0; i < towers.length;) {
    const tower = towers[i];
    if (!tower?.isDead) {
      i++;
      continue;
    }

    const dead = towers.splice(i, 1)[0];
    towersDestroyedCount++;
    clearedAny = true;
    emit('tower-destroyed', {
      towerIndex: towersDestroyedCount - 1,
      lastAttackerTeam: dead?.lastAttackerTeam ?? null,
      reward: dead?.reward ?? 0,
      x: dead?.centre?.x ?? dead?.position?.x ?? 0,
      y: dead?.centre?.y ?? dead?.position?.y ?? 0,
    });
  }

  if (!clearedAny) return;
  updateWaveProgress();
  renderHeader();
  if (towers.length === 0) checkWaveOutcome();
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (!mapLoaded) return;

  const now = performance.now();
  sim.dt = Math.min(100, now - lastFrameTime);
  lastFrameTime = now;
  drawBackground();

  // ── DEBUG DRAW (PATH + TOWERS) ─────────────────────────
  if (DEBUG_DRAW) {
    // Path points
    path.forEach(p => {
      gameCanvas.fillStyle = 'red';
      gameCanvas.fillRect(p.x - 3, p.y - 3, 6, 6);
    });

    // Tower placement markers
    towerLocations.forEach(t => {
      gameCanvas.fillStyle = 'blue';
      gameCanvas.fillRect(t.x - 5, t.y - 5, 10, 10);
    });
  }

  // ── OBSERVING MODE ─────────────────────────────────────
  if (observingMode) {
    renderObservedState();
    updateAndRenderExplosions();
    return;
  }

  // ── TARGETING + TOWER DESTRUCTION ─────────────────────
  // ── TARGETING + TOWER DESTRUCTION ─────────────────────

  clearDestroyedTowers();

  // Then allow units to attack ANY reachable tower
  for (let i = 0; i < attackUnits.length; i++) {
    const unit = attackUnits[i];
    if (!unit) continue;

    let reachableTower = null;

    for (const tower of towers) {
      if (!tower || tower.isDead) continue;
      if (unitCanReachTower(unit, tower)) {
        reachableTower = tower;
        break;
      }
    }

    unit.target = reachableTower;
  }

  if (towers.length === 0) {
    checkWaveOutcome();
  }
  // ── UNIT UPDATES ───────────────────────────────────────
  attackUnits = attackUnits.filter(u => !u.isDead);
  attackUnits.forEach(u => u.updateFrame());

  // ── TOWER UPDATES ──────────────────────────────────────
  towers.forEach(tower => {
    tower.updateFrame(attackUnits);
  });
  clearDestroyedTowers();

  // ── VFX + UI ───────────────────────────────────────────
  updateAndRenderExplosions();
  renderLeaderboard();

  // ── WAVE CHECK ─────────────────────────────────────────
  if (battleStarted) checkWaveOutcome();
};

// Kick off one wave of combat. Called for each wave in the multi-wave
// loop, not just the first one — re-uses the same banner / spawn / settle
// machinery between waves.
const startWave = () => {
  if (!mapLoaded || matchEnded) return;
  if (battleStarted) return; // already running this wave

  // ── COMPLETED-MATCH GUARD ──────────────────────────────────
  // If we landed on battle.html with the siege already terminal
  // (outcome set, phase='complete' — e.g. the player refreshed
  // AFTER set_match_outcome had already landed in the DB), don't
  // spawn anything. Fire the end overlay straight away so the
  // player sees their victory/defeat screen + reward instead of a
  // bogus fresh wave kicking off into a finished match.
  if (siege?.outcome) {
    battleStarted = true;
    waveJudged = true;
    showEndOverlay(siege.outcome);
    return;
  }

  // ── REFRESH-RECOVERY GUARD ─────────────────────────────────
  // If the siege row already says phase='battle' when this client
  // calls startWave, a wave is in flight on the OTHER client. That
  // state can only exist after start_wave_battle has fired, which
  // only happens once both queue_ready flags are true — so a fresh
  // battle entry NEVER sees phase='battle' here (it starts at
  // 'setup'/'prep' and only flips to 'battle' as a result of our
  // own RPC call below, which happens AFTER spawnWaveQueues). The
  // only way to land here with phase already 'battle' is a refresh
  // / reconnect mid-wave.
  //
  // In that case re-spawning would diverge our local sim from the
  // other client's. Bail out: mark battle as started locally (so
  // the queue UI is disabled and the both-ready check doesn't
  // re-fire startWave) but DON'T touch attackUnits. We'll catch
  // up via the realtime echo when the other client's sim resolves
  // the wave (gold updates as towers fall, phase flips to 'prep'
  // on fail, outcome set on win).
  if (siege?.phase === 'battle') {
    battleStarted = true;
    waveJudged = true;
    observingMode = true;  // ← render from broadcast snapshots, not local sim
    // Pre-warm sprite sheets for every unit type either side picked so
    // the FIRST snapshot we receive renders with real sprites instead of
    // flashing the box fallback for ~1 frame per new unit type.
    const preload = new Set([
      ...(siege.host_units || []),
      ...(siege.ally_units || []),
      ...(siege.host_queue || []),
      ...(siege.ally_queue || []),
    ]);
    preload.forEach(id => { if (id) ensureObservedSprite(id); });

    // Seed the observed state from the persisted DB snapshot. Without
    // this we'd stare at an empty canvas for up to 200ms while waiting
    // for the other peer's first broadcast — and if they happen to be
    // disconnected, indefinitely. After this seed, the broadcast +
    // postgres_changes paths keep latestSnapshot fresh.
    supabase
      .rpc('get_siege_snapshot', { p_siege: siege.id })
      .then(({ data, error }) => {
        if (error) {
          console.warn('snapshot seed failed', error);
          return;
        }
        if (!observingMode || !data) return;

        if ((data.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
        if (data.mapKey && currentMapKey && data.mapKey !== currentMapKey) return;

        if (latestSnapshot && (latestSnapshot.ts || 0) >= (data.ts || 0)) return;

        latestSnapshot = data;
        latestSnapshotIsSeed = true;
      });

    // Keep retrying briefly until we get the first valid snapshot
    let observerSeedTries = 0;
    const observerSeedTimer = setInterval(async () => {
      if (!observingMode || latestSnapshot) {
        clearInterval(observerSeedTimer);
        return;
      }

      observerSeedTries++;
      if (observerSeedTries > 12) {
        clearInterval(observerSeedTimer);
        return;
      }

      const { data, error } = await supabase.rpc('get_siege_snapshot', { p_siege: siege.id });
      if (error || !data || !observingMode) return;

      if ((data.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
      if (data.mapKey && currentMapKey && data.mapKey !== currentMapKey) return;

      latestSnapshot = data;
      latestSnapshotIsSeed = true;
      clearInterval(observerSeedTimer);
    }, 250);

    startStuckWaveWatchdog();
    showAlert('⚔ WAVE IN PROGRESS — AWAITING THINE ALLY', 'info');
    return;
  }

  // Phase is 'prep' + bothReady. Don't spawn here — spawning is now
  // driven by the server-committed phase='prep' → 'battle' transition
  // (see beginWaveSpawn() called from applySiegeUpdate). This makes the
  // wave start deterministic across both clients: nobody has units on
  // the field until start_wave_battle has actually committed. A refresh
  // in the gap between local lock-in and the RPC commit now lands on
  // either phase='prep' (waits for echo → spawn) or phase='battle'
  // (observes), instead of re-spawning at path[0] and visually
  // restarting the wave for one player.
  if (isHost) {
    callBattleRpc('start_wave_battle', { p_siege: siege.id }, false);
  }
  // Ally has nothing to do — just waits for the host's RPC to commit.
};

// Spawn the queues for the wave that just transitioned to phase='battle'
// on the server. Called from applySiegeUpdate when prevPhase==='prep'
// and the fresh row's phase==='battle'. Idempotent via battleStarted.
const beginWaveSpawn = () => {
  if (!mapLoaded || matchEnded) return;
  if (battleStarted) return;

  battleStarted = true;
  waveJudged = false;
  waveAttemptId++;
  attackUnits = [];

  // Always rebuild towers for the current map
  initialiseTowers();
  updateWaveProgress();
  renderWaveTrack(siege.current_wave || 1, livesMax());

  bothReadyBanner.classList.remove('hidden');
  setTimeout(() => bothReadyBanner.classList.add('hidden'), 1400);

  // HOST runs the simulation
  if (isHost) {
    observingMode = false;
    latestSnapshot = null;
    latestSnapshotIsSeed = false;
    observedDisplayPos.clear();

    if ((siege.current_wave ?? 1) === 1) resetContribution();

    spawnWaveQueues();
    render();

    // Restart broadcasting for THIS wave
    startBattleSyncTimers();

    return;
  }

  // ALLY observes host snapshots
  observingMode = true;
  latestSnapshot = null;
  latestSnapshotIsSeed = false;
  observedDisplayPos.clear();

  const preload = new Set([
    ...(siege.host_units || []),
    ...(siege.ally_units || []),
    ...(siege.host_queue || []),
    ...(siege.ally_queue || []),
  ]);
  preload.forEach(id => { if (id) ensureObservedSprite(id); });

  // Immediately seed the observer with the latest saved snapshot
  supabase
    .rpc('get_siege_snapshot', { p_siege: siege.id })
    .then(({ data, error }) => {
      if (error) {
        console.warn('observer snapshot seed failed', error);
        return;
      }
      if (!observingMode || !data) return;

      if ((data.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
      if (data.mapKey && currentMapKey && data.mapKey !== currentMapKey) return;

      latestSnapshot = data;
      latestSnapshotIsSeed = true;
    });

  // Retry briefly until the first valid snapshot arrives
  let observerSeedTries = 0;
  const observerSeedTimer = setInterval(async () => {
    if (!observingMode || latestSnapshot) {
      clearInterval(observerSeedTimer);
      return;
    }

    observerSeedTries++;
    if (observerSeedTries > 12) {
      clearInterval(observerSeedTimer);
      return;
    }

    const { data, error } = await supabase.rpc('get_siege_snapshot', { p_siege: siege.id });
    if (error || !data || !observingMode) return;

    if ((data.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
    if (data.mapKey && currentMapKey && data.mapKey !== currentMapKey) return;

    latestSnapshot = data;
    latestSnapshotIsSeed = true;
    clearInterval(observerSeedTimer);
  }, 250);

  startStuckWaveWatchdog();
  showAlert('⚔ HOST COMMANDS THE FIELD — SYNCING BATTLE', 'info');
  render();
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

  // ── STALE UPDATE GUARD ─────────────────────────
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
  const prevWave = siege?.current_wave ?? 1;

  siege = fresh;

  const waveChanged = (siege.current_wave ?? 1) !== prevWave;

  // ── UPDATE WAVE TRACK ─────────────────────────
  if (waveChanged) {
    renderWaveTrack(siege.current_wave || 1, livesMax());
  }

  // Close overlay when moving to next level
  if (waveChanged && levelCompleteOpen) {
    closeLevelCompleteOverlay();
  }

  // ── LOAD NEW MAP IF NEEDED ─────────────────────
  const mapChanged = applyMapForWave(siege.current_wave ?? 1, {
    announce: waveChanged,
  });

  // Reset battle state when wave changes
  if (waveChanged && !matchEnded && !siege.outcome) {
    battleStarted = false;
    waveJudged = false;
    attackUnits = [];
    unitsDeployedCount = 0;
  }

  if (siege.phase === 'prep' && prevPhase !== 'prep') {
    battleStarted = false;
    waveJudged = false;
    observingMode = false;
    latestSnapshot = null;
    observedDisplayPos.clear();

    if (waveSettleTimer) {
      clearTimeout(waveSettleTimer);
      waveSettleTimer = null;
    }

    clearBattleSyncTimers();

    attackUnits = [];
    unitsDeployedCount = 0;

    if (!mapChanged) {
      updateWaveProgress();
    }
  }

  // ── START BATTLE WHEN SERVER COMMITS ──────────
  if (
    siege.phase === 'battle' &&
    prevPhase === 'prep' &&
    !battleStarted &&
    !observingMode &&
    !matchEnded
  ) {
    beginWaveSpawn();
  }

  // ── UPDATE UI ────────────────────────────────
  render();

  // ── HANDLE MATCH END ─────────────────────────
  if (siege.outcome && !matchEnded) {
    showEndOverlay(siege.outcome);
    return;
  }

  // ── BOTH READY → START WAVE ──────────────────
  const bothReady = !!siege.host_queue_ready && !!siege.ally_queue_ready;
  if (bothReady && !battleStarted && !matchEnded) {
    startWave();
  }
};

// ── MAP LOAD ──
const backgroundImage = new Image();

const drawBackground = () => {
  if (!backgroundImage.complete) return;

  gameCanvas.clearRect(0, 0, gameCanvasElement.width, gameCanvasElement.height);

  gameCanvas.drawImage(
    backgroundImage,
    0,
    0,
    gameCanvasElement.width,
    gameCanvasElement.height
  );
};

backgroundImage.onload = () => {
  mapLoaded = true;
  initialiseTowers();
  drawBackground();
  towers.forEach(t => t.render());
  updateWaveProgress();
  if (!animationId) animate();

  if (siege && siege.host_queue_ready && siege.ally_queue_ready) startWave();
};

backgroundImage.onerror = () => {
  console.error('[battle] failed to load background image:', backgroundImage.src);
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

  resetLeaderboard();
  setCurrentWave(siege.current_wave || 1);
  setLeaderboardNames({
    hostName: siege.host_username || 'HOST',
    allyName: siege.ally_username || 'ALLY',
  });

  // Preload profiles so we display fresh usernames (siege row also has them
  // but profile is canonical).
  const myUid = user.id;
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meProfile, themProfile] = await Promise.all([
    loadProfile(myUid),
    otherUid ? loadProfile(otherUid) : Promise.resolve(null),
  ]);
  mySelf = { profile: meProfile || { points: 0 } };
  myOther = { profile: themProfile || { points: 0 } };
  if (meProfile?.username) siege[isHost ? 'host_username' : 'ally_username'] = meProfile.username;
  if (themProfile?.username) siege[isHost ? 'ally_username' : 'host_username'] = themProfile.username;

  // ── REFRESH-INTO-COMPLETED-MATCH GUARD ─────────────────
  // The match is already terminal on the row (the other player resolved
  // it while we were refreshing). Show the overlay immediately and skip
  // enter_prep_phase / realtime sub / wave spawn — those paths can blow
  // away siege.outcome or kick a fresh wave that the user never sees.
  // This is the fix for "victory screen doesn't show up for the player
  // who was refreshing during".
  if (siege.outcome === 'victory' || siege.outcome === 'defeat') {
    // Pull final totals from the persisted contribution columns so the
    // overlay shows real numbers instead of "0 / N".
    towersDestroyedCount =
      (siege.host_contribution?.towers_destroyed ?? 0) +
      (siege.ally_contribution?.towers_destroyed ?? 0);
    // Paint the map background once so the canvas behind the overlay
    // isn't blank. Doesn't matter that towers aren't drawn — the
    // overlay covers them.
    applyMapForWave(siege.current_wave || 1, { force: true });

    if (backgroundImage.complete) {
      drawBackground();
    }

    await showEndOverlay(siege.outcome);
  } else {

    // Both players call enter_prep_phase on first battle entry. The RPC
    // is idempotent and the second caller's seed branch no-ops once gold
    // is non-zero (FOR UPDATE row lock makes the check race-safe). Doing
    // this from both sides — not just the host — covers two edge cases:
    //   • Host's RPC fails / slow connection: ally still gets a seed
    //   • Ally lands on battle.html before host's RPC echoes via realtime
    // The RPC also catches legacy sieges where phase advanced before
    // migration 008/009 were applied (so the seed was silently dropped).
    {
      const { data, error } = await supabase.rpc('enter_prep_phase', { p_siege: siege.id });
      if (error) console.error('enter_prep_phase failed', error);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) applySiegeUpdate({ ...siege, ...row });
    }

    renderWaveTrack(siege.current_wave || 1, livesMax());
    render();

    // Map + tower init kicks off via backgroundImage.onload below.
    applyMapForWave(siege.current_wave || 1, { force: true });

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

    // ── REAL-TIME BATTLE-STATE BROADCAST ─────────
    // Every actively-simming client (i.e. !observingMode) broadcasts a
    // small snapshot of the battlefield ~5x per second. Observing
    // clients consume the snapshots and render them, so a player who
    // refreshed into an active wave actually SEES units moving and
    // towers being destroyed instead of staring at an empty canvas.
    //
    // ── SERVER-AUTH NOTE ─────────────────────────
    // This is a transient Realtime BROADCAST (channel.send) — values
    // are NOT persisted and NOT used for any gold / queue / outcome /
    // payout decision. Authoritative gold flows via award_tower_kill
    // RPC; wave progression via advance_wave; outcome via
    // set_match_outcome. The snapshot is pure presentation catch-up.
    // A tampered client lying in their broadcast can't cheat — they'd
    // just paint wrong pixels on the observing client's canvas.
    battleBroadcastChannel = supabase.channel(`battle-broadcast-${siege.id}`, {
      config: { broadcast: { self: false } },
    });
    const battleBroadcast = battleBroadcastChannel;

    // Track the last broadcast payload so the periodic DB-persist tick can
    // forward it without re-building.

    battleBroadcast
      .on('broadcast', { event: 'snapshot' }, (msg) => {
        if (!observingMode || !msg?.payload) return;

        const snap = msg.payload;

        // Ignore stale / wrong-wave / wrong-map / wrong-phase snapshots
        if ((snap.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
        if (snap.mapKey && currentMapKey && snap.mapKey !== currentMapKey) return;

        latestSnapshot = snap;
        latestSnapshotIsSeed = false;
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;

        // If battle is already running on this client when the channel comes up,
        // start sync timers immediately.
        if (battleStarted && !observingMode && !siege?.outcome) {
          startBattleSyncTimers();
        }
      });

    // ── DB SNAPSHOT FALLBACK ─────────────────────────────────────
    // Listen for siege_snapshots row UPDATEs so a client in observingMode
    // gets the latest battlefield state through Postgres CDC even when
    // the other peer's BROADCAST channel isn't reaching us (slow network,
    // momentary disconnect, etc.). This is the "B always has data" half
    // of disconnect-resilience.
    supabase
      .channel(`siege-snap-${siege.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'siege_snapshots', filter: `siege_id=eq.${siege.id}` },
        (payload) => {
          if (!observingMode) return;
          const state = payload.new?.state;
          if (state) {
            if ((state.wave ?? 1) !== (siege?.current_wave ?? 1)) return;
            if (state.mapKey && currentMapKey && state.mapKey !== currentMapKey) return;

            latestSnapshot = state;
            latestSnapshotIsSeed = false;
          }
        })
      .subscribe();

    // ── PRESENCE CHANNEL ─────────────────────────
    // Tracks WHO is currently connected to this siege so the HUD can
    // surface a "RECONNECTING…" indicator on the ally's profile when
    // they lose connection (closed tab / network drop / signed out).
    //
    // ── SERVER-AUTH NOTE ─────────────────────────
    // Presence intentionally lives in the Realtime layer only — NEVER
    // persist it to public.sieges or any other auth-relevant table.
    // Otherwise a tampered client could spoof "I'm online" to dodge
    // teammate-disconnect penalties, or spoof "they're offline" to
    // trigger them. Today presence affects ZERO gameplay decisions
    // (gold, queue, outcome, payout, …) — it's a pure UI hint. Keep
    // it that way. If a future feature needs "disconnect for N seconds
    // triggers X", build that off the server clock + a dedicated
    // server-side heartbeat, not off this channel.
    const renderConnectionIndicator = (onlineUserIds) => {
      // user.id is always considered online from its own client's
      // POV — we only render the indicator for the OTHER player.
      if (!otherUid) {
        otherReconnectingEl.classList.add('hidden');
        otherStatusEl.classList.add('hidden');
        otherPlayerEl?.classList.remove('is-reconnecting');
        return;
      }
      const otherOnline = onlineUserIds.has(otherUid);
      otherReconnectingEl.classList.toggle('hidden', otherOnline);
      otherStatusEl.classList.toggle('hidden', otherOnline);
      otherPlayerEl?.classList.toggle('is-reconnecting', !otherOnline);
    };

    // Start in the "ally is reconnecting" state until their presence
    // sync confirms them online — better to flash the indicator
    // briefly than to falsely claim everything's fine while we wait.
    renderConnectionIndicator(new Set());

    const presenceChannel = supabase.channel(`presence-${siege.id}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        // presenceState() returns an object keyed by presence key
        // (user.id in our config). One key per connected client.
        const state = presenceChannel.presenceState();
        renderConnectionIndicator(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        // Only track ourselves once the channel is actually live —
        // otherwise track() rejects with "channel not subscribed".
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    // Clean teardown on page unload so the OTHER client sees us drop
    // off the presence list immediately, not after the WebSocket's
    // ~30s timeout. Belt-and-braces: closing the tab tears down the
    // socket anyway, but explicit untrack lets a clean navigation
    // (e.g. clicking RETURN TO WAR ROOM) flip the ally's UI right
    // away instead of leaving them with a stale "ally still here".
    window.addEventListener('beforeunload', () => {
      clearBattleSyncTimers();
      try { presenceChannel.untrack(); } catch { /* socket already gone */ }
    });
  } // end refresh-into-completed-match else
}
