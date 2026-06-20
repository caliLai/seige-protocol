/* ═══════════════════════════════════════════════
   GAME PAGE
   Both players build their wave from the
   3 unit types they locked in during siege-setup, hit
   "Lock In" → spawning begins on the canvas.
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { enforceSingleSession } from '/lib/single-session.js';
import { UNITS, UNITS_BY_ID, idleSpriteUrl, deployCost, deployCostById } from '/lib/units.js';
import { getMapByIndex, isLastMap } from '/src/data/maps.js';
import { generateTowers } from '/src/runtime/towerPlacement.js';
import { resetBuffs, addBuff, applyBuffsToUnit } from '/src/runtime/buffs.js';
import { Archer } from '/src/classes/Archer.js';
import { Knight } from '/src/classes/Knight.js';
import { Orc } from '/src/classes/Orc.js';
import { Soldier } from '/src/classes/Soldier.js';
import { Swordsman } from '/src/classes/Swordsman.js';
import { Slime } from '/src/classes/Slime.js';
import { Skeleton } from '/src/classes/Skeleton.js';
import { Tower } from '/src/classes/Tower.js';
import { Unit } from '/src/classes/Unit.js';
import { sim } from '/src/runtime/sim.js';
import { contribution, resetContribution, creditTowerKill } from '/src/runtime/contribution.js';
import { initTowerMatchups, getTowerMatchupSummary } from '/src/runtime/towerMatchups.js';

import {
  resetLeaderboard,
  setLeaderboardNames,
  setLeaderboardPoints,
  setCurrentWave,
  getLeaderboardRows,
  creditTowerPoints,
  leaderboardState,
} from '/src/runtime/leaderboard.js';

let blastImage = new Image();
let blastLoaded = false;

blastImage.onload = () => {
  blastLoaded = true;
};

blastImage.src = "../assets/effects/blast.png";

// Tower-death explosion frames exported from the Animate source
// (assets/Tower/PNG/54–61): a burst -> fireball -> smoke -> dissipate
// sequence played in order across each explosion's lifetime by
// updateAndRenderExplosions(). Preloaded once at module load.
const EXPLOSION_FRAME_IDS = [54, 55, 56, 57, 58, 59, 60, 61];
const explosionFrames = EXPLOSION_FRAME_IDS.map((id) => {
  const img = new Image();
  img.src = `../assets/Tower/PNG/${id}.png`;
  return img;
});

// ── DIFFICULTY KNOBS ──
const STARTING_GOLD = { recruit: 50, veteran: 50, elite: 50 };
const QUEUE_CAP = { recruit: 10, veteran: 8, elite: 6 };
const goldForDifficulty = (d) => STARTING_GOLD[d] ?? 50;
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
const unitInfoEl = document.getElementById('unitInfo');

// ── STATE ──
let siege = null;
let isHost = false;
let startingGold = 50;
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

// Which map of the run we're on, and its derived data. Set for real from
// siege.map_index during INIT; updated when advance_map bumps the index.
// `activePath` is the road units march along on the current map — every
// spawned unit gets it as its pathRef, so swapping it switches maps.
let mapIndex = 0;
let currentMap = getMapByIndex(0);
let activePath = currentMap.path;
let battleStarted = false;
let towersDestroyedCount = 0;
let totalTowers = 0;
let unitsDeployedCount = 0;
// Run-wide totals (across every map/wave), shown on the end screen. Unlike the
// per-map towersDestroyedCount / per-wave unitsDeployedCount, these only reset
// at the very start of a run.
let runTowersDestroyed = 0;
let runUnitsDeployed = 0;
let explosions = [];
// Single end-of-match guard (used for both victory and defeat) so the
// spawn timeline, settle timer, and overlay flips all key off the same
// flag instead of victory-only logic.
let matchEnded = false;

// "Observing" mode — set when this client lands on battle.html with a
// wave already in flight on the OTHER client (refresh / reconnect
// mid-wave). The local sim doesn't run; instead we render from the
// most recent broadcast snapshot (see battleBroadcast channel near
// the bottom of init). Reset to false when the wave resolves
// (applySiegeUpdate's 'prep' transition).
let observingMode = false;
let latestSnapshot = null;
// True while latestSnapshot came from a one-shot DB read (seed or
// watchdog refetch) rather than a live broadcast / Postgres CDC push.
// Promotion is intentionally NOT triggered off seed-only data within
// the first few seconds — the DB seed can be moments old AND units in
// it can be near the spawn point, so promoting from it would visually
// "rewind" the wave on the refreshing client.
let latestSnapshotIsSeed = false;

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
    maxAge: 720, // ms (~90ms per explosion frame across 8 frames)
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

    gameCanvas.save();

    // Step through the burst -> smoke frame sequence over the explosion's
    // lifetime. The frames already animate the fade, so draw them at full
    // opacity except for a short tail-out on the final frames.
    const frameIdx = Math.min(
      explosionFrames.length - 1,
      Math.floor(progress * explosionFrames.length)
    );
    const frame = explosionFrames[frameIdx];
    if (frame && frame.complete && frame.naturalWidth) {
      const size = 110;
      gameCanvas.globalAlpha = progress > 0.85 ? (1 - progress) / 0.15 : 1;
      gameCanvas.drawImage(frame, ex.x - size / 2, ex.y - size / 2, size, size);
    } else if (blastLoaded) {
      // Fallback to the legacy blast sprite if a frame hasn't loaded yet.
      gameCanvas.globalAlpha = 1 - progress;
      gameCanvas.drawImage(blastImage, ex.x - 40, ex.y - 40, 80, 80);
    }

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
    .select('user_id, username, points, tower_points')
    .eq('user_id', userId)
    .maybeSingle();
  return data || { user_id: userId, username: 'KNIGHT', points: 0, tower_points: 0 };
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
// Fill the UNIT INFORMATION panel with a unit's stats + flavour. Driven by
// hovering a card in either AVAILABLE UNIT TYPES list. We deliberately never
// clear it on mouseleave, so the panel keeps showing the last unit hovered.
const showUnitInfo = (id) => {
  if (!unitInfoEl) return;
  const unit = UNITS_BY_ID.get(id);
  if (!unit) return;

  unitInfoEl.classList.add('has-info');
  unitInfoEl.innerHTML = `
    <div class="game-info-name">${escapeHtml(id.toUpperCase())}</div>
    <div class="game-info-stats">
      <span><b>COST</b> ◆${deployCost(unit)}</span>
      <span><b>HP</b> ${unit.hp}</span>
      <span><b>DMG</b> ${unit.damage}</span>
      <span><b>SPD</b> ${unit.speed}</span>
    </div>
    ${unit.desc ? `<div class="game-info-desc">${escapeHtml(unit.desc)}</div>` : ''}
  `;
};

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
    card.addEventListener('mouseenter', () => showUnitInfo(id));
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
      <span class="game-leaderboard-points">${row.points}</span>
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
      queue_full:        '✗ QUEUE FULL',
      unit_not_owned:    '✗ UNIT NOT IN THY HOST',
      empty_queue:       '✗ QUEUE AT LEAST ONE UNIT FIRST',
      wrong_phase:       '✗ THE MOMENT HAS PASSED',
      host_only:         '✗ ONLY THE HOST MAY DO THAT',
      not_a_player:      '✗ THOU ART NOT IN THIS SIEGE',
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

// Cheapest unit a side could deploy this run (Infinity if they picked none).
const cheapestUnitCost = (side) => {
  const types = siege?.[`${side}_units`] || [];
  let min = Infinity;
  for (const id of types) { const c = deployCostById(id); if (c < min) min = c; }
  return min;
};

// If, at the start of a wave, NEITHER player can afford a single unit, the
// siege is unwinnable (no one can mount an assault) → game over. Only judged
// once gold has actually been seeded, so the wave-1 pre-seed race can't trip
// a false defeat.
const checkGoldStarvation = () => {
  if (matchEnded) return;
  const hg = siege?.host_gold;
  const ag = siege?.ally_gold;
  const allyPresent = !!siege?.ally_id;
  if (!Number.isFinite(hg)) return;                 // host gold not seeded yet
  if (allyPresent && !Number.isFinite(ag)) return;  // ally gold not seeded yet

  const hostBroke = hg < cheapestUnitCost('host');
  const allyBroke = !allyPresent || ag < cheapestUnitCost('ally');
  if (hostBroke && allyBroke) {
    showAlert('☠ THY COFFERS ARE BARE — THE SIEGE IS LOST', 'error');
    showEndOverlay('defeat');
  }
};

const sideGoldVal = (side) => {
  const v = siege?.[`${side}_gold`];
  return Number.isFinite(v) ? v : 0;
};

// A side can't take part in this wave when it has nothing queued AND can't
// afford any unit — i.e. it's broke. Such a side doesn't need to "ready up"
// for the wave to start (it has nothing to lock in).
const sideCantParticipate = (side) => {
  const q = siege?.[`${side}_queue`] || [];
  return q.length === 0 && sideGoldVal(side) < cheapestUnitCost(side);
};

// The wave may begin once every side that CAN participate is ready. A broke
// side is skipped, so a single solvent player can launch the wave alone.
const canStartWave = () => {
  const hostReady = !!siege?.host_queue_ready;
  const allyReady = !!siege?.ally_queue_ready;
  const allyPresent = !!siege?.ally_id;
  if (!allyPresent) return hostReady;                       // solo siege
  if (hostReady && allyReady) return true;
  if (hostReady && !allyReady && sideCantParticipate('ally')) return true;
  if (allyReady && !hostReady && sideCantParticipate('host')) return true;
  return false;
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
  // Seeded from siege id + map index so BOTH clients generate the identical
  // set of towers (positions hugging the road sides, types from the map pool).
  let spots = generateTowers({
    seed: `${siege?.id ?? 'siege'}:${mapIndex}`,
    path: currentMap.path,
    types: currentMap.towerTypes,
    count: 7,
  });
  // Defensive fallback to the map's fixed spots if generation ever comes up
  // empty (e.g. a degenerate path).
  if (!spots.length) spots = (currentMap.towers || []).map(p => ({ ...p, type: 25 }));
  for (const s of spots) {
    towers.push(new Tower({ x: s.x, y: s.y }, gameCanvas, s.type));
  }
  totalTowers = towers.length;
};

const pathStartDirection = () => {
  const p0 = activePath[0];
  const p1 = activePath[1] || activePath[0];
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
  // Catalog id (e.g. 'Archer', 'Skeleton Archer') — used by the stone-tower
  // matchup system to look up this unit's damage multipliers vs towers.
  unit.unitType = id;
  unit.laneOffset = (typeof laneOffset === 'number') ? laneOffset : 0;
  unit.pathRef = activePath;
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
        const pos = { x: activePath[0].x, y: activePath[0].y };
        const unit = createUnitFromId(unitId, pos, formationLaneOffset(laneOffset, i));
        unit.team = team;
        unit.ownerId = team;
        applyBuffsToUnit(unit); // run-long reward buffs for this side/type

        const pathSpacing = formationPathSpacing(i);
        unit.position.x -= dir.x * pathSpacing;
        unit.position.y -= dir.y * pathSpacing;
        attackUnits.push(unit);
        unitsDeployedCount++;
        runUnitsDeployed++;
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
  if (waveSettleTimer) { clearTimeout(waveSettleTimer); waveSettleTimer = null; }

  // Drop any pending tower-reward rounds and unfreeze — the run is over.
  rewardRounds.forEach(r => { if (r.waitTimer) clearTimeout(r.waitTimer); });
  rewardRounds.length = 0;
  remotePicks.clear();
  rewardActive = false;
  if (rewardOverlay) { rewardOverlay.classList.add('hidden'); rewardOverlay.setAttribute('aria-hidden', 'true'); }

  const overlay = outcome === 'victory' ? victoryOverlay : defeatOverlay;
  const statsOf = outcome === 'victory'
    ? { towers: statTowersEl, lives: statLivesEl, units: statUnitsEl }
    : { towers: statTowersDefeatEl, lives: statLivesDefeatEl, units: statUnitsDefeatEl };

  // Run-wide totals: towers destroyed and units deployed across EVERY map of
  // the run, not just the current map/wave.
  if (statsOf.towers) statsOf.towers.textContent = String(runTowersDestroyed);
  if (statsOf.lives)  statsOf.lives.textContent = `${livesRemaining()} / ${livesMax()}`;
  if (statsOf.units)  statsOf.units.textContent = String(runUnitsDeployed);

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

  const { error } = await supabase.rpc('award_match_points', { p_siege: siege.id });
  const alreadyPaid = error && String(error.message || '').includes('already_paid');
  if (error && !alreadyPaid) {
    console.error('award_match_points failed', error);
    return;
  }

  // Whichever client called the RPC first did the actual UPDATE; the
  // other got 'already_paid'. Either way, profiles.points now holds
  // the new totals on both sides, so re-fetch and compute the delta
  // from our cached pre-match values. This approach is uniform across
  // both clients and survives the race.
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meFresh, themFresh] = await Promise.all([
    supabase.from('profiles').select('points').eq('user_id', user.id).maybeSingle(),
    otherUid
      ? supabase.from('profiles').select('points').eq('user_id', otherUid).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const oldMine  = mySelf?.profile?.points ?? 0;
  const newMine  = meFresh?.data?.points ?? oldMine;
  const myAward  = newMine - oldMine;

  if (mySelf?.profile) {
    mySelf.profile.points = newMine;
    if (selfPointsEl) selfPointsEl.textContent = String(newMine);
  }

  if (themFresh?.data && myOther?.profile) {
    myOther.profile.points = themFresh.data.points;
    if (otherPointsEl) otherPointsEl.textContent = String(themFresh.data.points);
  }

  // End-screen reward line ("+ N POINTS") — show the delta we just
  // earned so the player sees what changed, not just the new total.
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

// ── GAMEPLAY SPEED (x1 / x2 / x4) ──────────────
// The top-right speed button cycles the shared sim.speed multiplier. Unit
// movement scales by it per frame and every attack cooldown elapses that many
// times faster, so the whole match fast-forwards. The chosen speed is
// broadcast to the other client so BOTH sims fast-forward together and the
// two battlefields stay in lockstep. Assigned once the realtime channel is up.
let battleBroadcast = null;
const speedBtn = document.getElementById('speedBtn');
const SPEED_STEPS = [1, 2, 4];

// Apply a speed locally (movement + cooldowns read sim.speed) and optionally
// tell the other client. Broadcast is fire-and-forget — if the channel isn't
// subscribed yet the local change still takes effect.
const setGameSpeed = (speed, { broadcast = false } = {}) => {
  if (!SPEED_STEPS.includes(speed)) return;
  sim.speed = speed;
  if (speedBtn) speedBtn.textContent = `x${speed}`;
  if (broadcast && battleBroadcast) {
    battleBroadcast.send({ type: 'broadcast', event: 'speed', payload: { speed } });
  }
};

if (speedBtn) {
  speedBtn.textContent = `x${sim.speed}`;
  speedBtn.addEventListener('click', () => {
    const next = (SPEED_STEPS.indexOf(sim.speed) + 1) % SPEED_STEPS.length;
    setGameSpeed(SPEED_STEPS[next], { broadcast: true });
  });
}

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

// ── TOWER REWARD POPUP ──
// Each fallen tower offers THIS player three cards: one gold (50–150) and two
// run-long buffs to one of their chosen unit types. Picks are independent per
// player. Gold goes through the award_reward_gold RPC (server clamps 50–150);
// buff picks are applied locally AND broadcast so the other client applies the
// same buff to this side's units (both clients simulate all units).
const rewardOverlay = document.getElementById('rewardOverlay');
const rewardCardsEl = document.getElementById('rewardCards');
const mySideKey = () => (isHost ? 'host' : 'ally');
const myUnitTypes = () => (siege?.[`${mySideKey()}_units`] || []);

const BUFF_OPTIONS = [
  { stat: 'damage', mult: 1.25, label: '+25% DAMAGE', icon: '⚔' },
  { stat: 'damage', mult: 1.4,  label: '+40% DAMAGE', icon: '⚔' },
  { stat: 'hp',     mult: 1.3,  label: '+30% HEALTH', icon: '❤' },
  { stat: 'hp',     mult: 1.5,  label: '+50% HEALTH', icon: '❤' },
  { stat: 'speed',  mult: 1.2,  label: '+20% SPEED',  icon: '✦' },
];
const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randGold = () => 50 + Math.floor(Math.random() * 101);

// One gold card + two distinct buff cards (or extra gold if the player has no
// unit types selected).
const buildRewardCards = () => {
  const cards = [{ kind: 'gold', amount: randGold() }];
  const types = myUnitTypes();
  const used = new Set();
  for (let n = 0; n < 2; n++) {
    if (!types.length) { cards.push({ kind: 'gold', amount: randGold() }); continue; }
    let opt, unitType, key, tries = 0;
    do { opt = pickRand(BUFF_OPTIONS); unitType = pickRand(types); key = unitType + opt.stat + opt.mult; tries++; }
    while (used.has(key) && tries < 12);
    used.add(key);
    cards.push({ kind: 'buff', unitType, stat: opt.stat, mult: opt.mult, label: opt.label, icon: opt.icon });
  }
  return cards;
};

// LOCKSTEP: the battle stays frozen on BOTH clients until BOTH players have
// chosen this round's reward. Each fallen tower is a "round" keyed by its
// destruction sequence number (towerIndex), which pairs up across clients even
// if towers die in a slightly different order — the reward is generic, so we
// only need matching counts. Picks are exchanged over the realtime channel.
let rewardActive = false;                 // sim frozen while true
const rewardRounds = [];                  // queue of { id, localDone, remoteDone, waitTimer }
const remotePicks = new Set();            // ally picks that arrived before we made the round
const ALLY_WAIT_MS = 20000;               // fail-safe so a disconnected ally can't hang the run
const isSoloSiege = () => !siege?.ally_id;

// Replace the popup body with a "waiting for ally" state after the local pick.
const renderWaitingForAlly = () => {
  rewardCardsEl.innerHTML =
    `<div class="reward-waiting">▌ AWAITING THINE ALLY'S CHOICE ▐</div>`;
};

const resolveFrontRound = () => {
  const r = rewardRounds[0];
  if (!r || !r.localDone || !(r.remoteDone || isSoloSiege())) return;
  if (r.waitTimer) { clearTimeout(r.waitTimer); r.waitTimer = null; }
  rewardRounds.shift();
  rewardActive = false;
  rewardOverlay.classList.add('hidden');
  rewardOverlay.setAttribute('aria-hidden', 'true');
  showNextReward();            // next queued round, or unfreeze if none
};

const chooseReward = (card) => {
  const r = rewardRounds[0];
  if (!r || r.localDone) return;            // already picked this round
  r.localDone = true;

  if (card.kind === 'gold') {
    callBattleRpc('award_reward_gold', { p_siege: siege.id, p_amount: card.amount }, false, ['wrong_phase']);
  } else {
    const buff = { unitType: card.unitType, stat: card.stat, mult: card.mult, label: `${card.unitType} ${card.label}` };
    addBuff(mySideKey(), buff);
    if (battleBroadcast) {
      battleBroadcast.send({ type: 'broadcast', event: 'buff', payload: { side: mySideKey(), buff } });
    }
    showAlert(`✦ ${card.unitType.toUpperCase()} ${card.label}`);
  }

  // Tell the ally we've chosen this round.
  if (battleBroadcast) {
    battleBroadcast.send({ type: 'broadcast', event: 'reward-picked', payload: { round: r.id, side: mySideKey() } });
  }

  if (r.remoteDone || isSoloSiege()) {
    resolveFrontRound();
  } else {
    renderWaitingForAlly();
    r.waitTimer = setTimeout(() => { r.remoteDone = true; resolveFrontRound(); }, ALLY_WAIT_MS);
  }
};

// The ally finished choosing round `id` (or buffer it if we're not there yet).
const onAllyRewardPick = (id) => {
  const r = rewardRounds.find((rr) => rr.id === id);
  if (r) { r.remoteDone = true; resolveFrontRound(); }
  else remotePicks.add(id);
};

function showNextReward() {
  if (!rewardOverlay || rewardActive || matchEnded) return;
  const r = rewardRounds[0];
  if (!r) return;
  rewardActive = true;

  const cards = buildRewardCards();
  rewardCardsEl.innerHTML = '';
  cards.forEach((card) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `reward-card ${card.kind === 'gold' ? 'is-gold' : 'is-buff'}`;
    el.innerHTML = card.kind === 'gold'
      ? `<span class="reward-card-icon">◆</span>
         <span class="reward-card-kind">GOLD</span>
         <span class="reward-card-title">+${card.amount}</span>
         <span class="reward-card-desc">BATTLE GOLD</span>`
      : `<span class="reward-card-icon">${card.icon}</span>
         <span class="reward-card-kind">BUFF · RUN-LONG</span>
         <span class="reward-card-title">${escapeHtml(card.unitType.toUpperCase())}</span>
         <span class="reward-card-desc">${card.label}</span>`;
    el.addEventListener('click', () => chooseReward(card));
    rewardCardsEl.appendChild(el);
  });

  rewardOverlay.classList.remove('hidden');
  rewardOverlay.setAttribute('aria-hidden', 'false');
}

// Queue a reward round for a fallen tower (called once per destruction).
const enqueueReward = (towerSeq) => {
  if (!rewardOverlay) return;
  const id = Number(towerSeq) || 0;
  const remoteDone = remotePicks.delete(id) || isSoloSiege();
  rewardRounds.push({ id, localDone: false, remoteDone, waitTimer: null });
  showNextReward();
};

// ── BATTLE EVENT WIRING ──
// All discrete combat outcomes go through battleEvents above. Local
// listeners drive HUD + state writes; the sync layer can mirror.

// A tower fell. Credit the killing side for the tower kill and the gold
// reward. Host writes both gold columns so the row reflects the shared
// payout (game-flow §10 — both players bank tower-kill gold).
battleEvents.addEventListener('tower-destroyed', (e) => {
  const { lastAttackerTeam, towerIndex, x, y } = e.detail;

  if (typeof x === 'number' && typeof y === 'number') {
    spawnExplosion(x, y);
  }

  if (lastAttackerTeam) {
    creditTowerKill(lastAttackerTeam);

    // Killing-blow side earns 10 board points this match...
    creditTowerPoints(lastAttackerTeam);
    renderLeaderboard();

    // ...and the host persists those 10 points to that player's lifetime
    // tower-kill score (profiles.tower_points) via the server-authoritative
    // RPC, which maps the team to the right user. wrong_phase is silenced for
    // the final-tower race with set_match_outcome.
    if (isHost) {
      callBattleRpc(
        'award_tower_points',
        { p_siege: siege.id, p_team: lastAttackerTeam },
        false,
        ['wrong_phase'],
      );
    }
  }

  // Every fallen tower offers THIS player a reward choice (gold or a buff).
  // Both clients queue their own popup — each player picks independently.
  // Replaces the old auto gold-to-both award_tower_kill payout.
  enqueueReward(typeof towerIndex === 'number' ? towerIndex : towersDestroyedCount);
});

// ── WAVE-FAILED SUMMARY POPUP ──
// On a repulsed wave we show a per-side breakdown of what died and how much
// tower damage was dealt THIS wave, then let either player advance both.
// Tower damage per wave is the contribution total diffed against a baseline
// captured at wave start (contribution itself accumulates across the match).
let waveStartDamage = { host: 0, ally: 0 };

const waveSummaryOverlay = document.getElementById('waveSummaryOverlay');
const waveSummaryTitleEl = document.getElementById('waveSummaryTitle');
const waveSummaryGridEl = document.getElementById('waveSummaryGrid');
const waveNextBtn = document.getElementById('waveNextBtn');

const countByType = (queue) => {
  const m = new Map();
  (queue || []).forEach((id) => m.set(id, (m.get(id) || 0) + 1));
  return [...m.entries()];
};

const sideSummaryHtml = (label, queue, dmg) => {
  const rows = countByType(queue);
  const list = rows.length
    ? rows.map(([id, n]) => `<li><span>${id}</span><span>×${n}</span></li>`).join('')
    : '<li class="wave-sum-empty">— none deployed —</li>';
  return `
    <div class="wave-sum-col">
      <div class="wave-sum-side">${label}</div>
      <ul class="wave-sum-list">${list}</ul>
      <div class="wave-sum-foot">
        <div><span>UNITS LOST</span><span>${(queue || []).length}</span></div>
        <div><span>TOWER DMG</span><span>${Math.max(0, Math.round(dmg))}</span></div>
      </div>
    </div>`;
};

const showWaveSummary = (waveNum) => {
  if (!waveSummaryOverlay) return;
  const hostDmg = contribution.host.damage_dealt - waveStartDamage.host;
  const allyDmg = contribution.ally.damage_dealt - waveStartDamage.ally;
  waveSummaryTitleEl.textContent = `⚔ WAVE ${waveNum} REPULSED ⚔`;
  waveSummaryGridEl.innerHTML =
    sideSummaryHtml(leaderboardState.host.label, siege.host_queue, hostDmg) +
    sideSummaryHtml(leaderboardState.ally.label, siege.ally_queue, allyDmg);
  if (waveNextBtn) {
    waveNextBtn.disabled = false;
    waveNextBtn.textContent = `⚔ ADVANCE TO NEXT WAVE ⚔`;
  }
  waveSummaryOverlay.classList.remove('hidden');
  waveSummaryOverlay.setAttribute('aria-hidden', 'false');
};

const hideWaveSummary = () => {
  if (!waveSummaryOverlay) return;
  waveSummaryOverlay.classList.add('hidden');
  waveSummaryOverlay.setAttribute('aria-hidden', 'true');
};

if (waveNextBtn) {
  waveNextBtn.addEventListener('click', async () => {
    waveNextBtn.disabled = true;
    // advance_wave is idempotent on phase: whichever player clicks first
    // bumps current_wave; the prep echo flips both clients (and hides the
    // other player's popup via applySiegeUpdate).
    await callBattleRpc('advance_wave', { p_siege: siege.id }, false);
    hideWaveSummary();
  });
}

// All towers destroyed = this map is cleared, regardless of which wave we're
// on. Clearing the map within the wave limit is the goal; remaining waves are
// "you had room to spare," not unfinished work.
//   • Not the last map → march to the next map (advance_map, idempotent —
//     the realtime echo reloads the map + re-enters prep on both clients).
//   • Last map → the whole run is won.
battleEvents.addEventListener('wave-completed', async () => {
  if (!isLastMap(mapIndex)) {
    showAlert(`⚔ ${currentMap.name} CLEARED — MARCH ONWARD ⚔`);
    await callBattleRpc('advance_map', { p_siege: siege.id }, false);
    return;
  }
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
  const current = siege.current_wave || 1;
  const total = siege.total_waves || 15;
  if (current >= total) {
    // Defeat write stays host-only (set_match_outcome enforces it).
    if (isHost) await showEndOverlay('defeat');
    return;
  }
  // Show the wave summary instead of auto-advancing. Advancing is now a
  // manual "Go to Next Wave" click (see waveNextBtn) — either player's
  // click fires the idempotent advance_wave RPC and flips both to prep.
  showWaveSummary(current);
});

const updateWaveProgress = () => {
  const destroyed = towersDestroyedCount;
  const pct = totalTowers ? Math.round((destroyed / totalTowers) * 100) : 0;
  if (waveProgressLabelEl) waveProgressLabelEl.textContent = `${pct}%`;
  if (waveProgressBarEl) waveProgressBarEl.style.width = `${pct}%`;
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
  for (let i = 0; i < activePath.length - 1; i++) {
    const ax = activePath[i].x,     ay = activePath[i].y;
    const bx = activePath[i + 1].x, by = activePath[i + 1].y;
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
  if (!latestSnapshot || !Array.isArray(latestSnapshot.units)) return false;

  // Rebuild attackUnits from the snapshot. createUnitFromId returns a
  // properly-typed instance (Archer / Soldier / etc.) and we then patch
  // its position / HP / path bookkeeping to match the snapshot.
  const rebuilt = [];
  for (const u of latestSnapshot.units) {
    const unitType = u.u || 'Soldier';
    const pos = { x: u.x, y: u.y };
    const laneOffset = u.t === 'host' ? -14 : 14;
    const unit = createUnitFromId(unitType, pos, laneOffset);
    unit.team = u.t;
    unit.position.x = u.x;
    unit.position.y = u.y;
    unit.health = Math.max(1, u.h);
    if (u.m && u.m > unit.maxHealth) unit.maxHealth = u.m;
    unit.pathRef = activePath;
    unit.pathIndex = nearestPathSegmentEnd(u.x, u.y);
    rebuilt.push(unit);
  }

  attackUnits = rebuilt;
  // Re-arm wave-outcome detection. While observing, waveJudged is forced
  // to true so the observer doesn't double-judge a wave the other peer
  // is finishing. Now that WE are simming, checkWaveOutcome must run.
  waveJudged = false;
  waveAttemptId++;
  observingMode = false;     // ← start broadcasting + simming again
  console.info('[battle] promoted to simmer; rebuilt %d units', rebuilt.length);
  return true;
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
const STUCK_DB_REFETCH_AGE   = 1500;
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
      if (data && Array.isArray(data.units)) {
        const dbTs = data.ts || 0;
        const curTs = latestSnapshot?.ts || 0;
        if (dbTs >= curTs) {
          latestSnapshot = data;
          latestSnapshotIsSeed = true;  // DB origin, not a live broadcast
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
    towers.forEach(t => t.updateFrame(null));
    return;
  }
  const snap = latestSnapshot;

  // Catch up tower destructions. snap.td is the simming client's
  // running towersDestroyedCount; we shift towers off our local
  // array (and spawn explosions) until we match.
  while (towersDestroyedCount < snap.td && towers.length > 0) {
    const dead = towers.shift();
    towersDestroyedCount++;
    runTowersDestroyed++;
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
  if (!matchEnded && towers.length === 0 && towersDestroyedCount >= totalTowers) {
    showEndOverlay('victory');
    return;
  }

  // Sync remaining towers' HP from the snapshot.
  for (const t of snap.towers || []) {
    const idx = t.i - snap.td;
    if (idx >= 0 && idx < towers.length) {
      towers[idx].health = t.h;
    }
  }
  towers.forEach(tower => tower.updateFrame(null));

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
      // Fresh sighting — snap directly to the broadcast position.
      disp = { x: u.x, y: u.y };
      observedDisplayPos.set(key, disp);
    } else {
      disp.x += (u.x - disp.x) * alpha;
      disp.y += (u.y - disp.y) * alpha;
    }
    drawObservedUnit(u, disp.x, disp.y);
  }
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
    meta.frameWidth  = meta.img.naturalHeight;  // assume square frames
    meta.sheetWidth  = meta.img.naturalWidth;
    meta.frameCount  = Math.max(1, Math.round(meta.sheetWidth / meta.frameWidth));
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
const OBSERVED_UNIT_WIDTH  = 50;
const OBSERVED_UNIT_HEIGHT = 50;
const OBSERVED_DRAW_SIZE   = 120;
const OBSERVED_VISUAL_OFFSET = (OBSERVED_DRAW_SIZE - OBSERVED_UNIT_WIDTH) / 2; // 35

const drawObservedUnit = (u, x = u.x, y = u.y) => {
  // u.a (attack flag) is set in the broadcast when the live unit had a
  // live target. Swap to the Attack sheet so observed clients see the
  // proper swing/strike instead of the idle pose. Attack sheets are
  // loaded lazily on first attacking sighting; until loaded we still
  // show the idle pose (which is already cached) as a graceful fallback.
  const unitId = u.u || 'Soldier';
  const attackMeta = u.a ? ensureObservedSprite(unitId, 'attack') : null;
  const idleMeta   = ensureObservedSprite(unitId, 'idle');
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
      ratio > 0.3 ? 'yellow'    :
                    '#ff3b30';
    gameCanvas.fillRect(bx, by, barW * ratio, barH);
    gameCanvas.strokeStyle = 'black';
    gameCanvas.strokeRect(bx, by, barW, barH);
  }
};

const unitCanReachTower = (unit, tower) => {
  const dx = tower.centre.x - unit.centre.x;
  const dy = tower.centre.y - unit.centre.y;
  const distance = Math.hypot(dx, dy);
  const towerBuffer = Math.max(tower.width, tower.height) / 2;
  // Target-ACQUISITION radius, deliberately wider than a unit's raw attack
  // range. Once a unit commits to a tower it stops marching — melee units then
  // close in to strike, ranged fire from where they stand. Short-range melee
  // units (attackRadius ~80) would otherwise march straight past road-side
  // towers whenever lane spread or a high sim-speed frame jump kept them just
  // outside range for the brief pass. The floor guarantees a generous commit
  // window for every unit type.
  const engageRadius = Math.max(unit.attackRadius, 130);
  return distance <= engageRadius + towerBuffer;
};

// ── TOWER INFORMATION PANEL ──
// Click a tower on the map to inspect it. All stone towers share the same
// matchup roll (the "stone tower type"), so the panel shows this match's
// weaknesses/resistances plus the clicked tower's live HP.
const towerInfoEl = document.getElementById('towerInfo');
let selectedTower = null;

const towerHitTest = (t, x, y) => {
  const left = t.position.x - (t.drawWidth - t.width) / 2;
  const top = t.position.y - (t.drawHeight - t.height);
  return x >= left && x <= left + t.drawWidth && y >= top && y <= top + t.drawHeight;
};

const towerIsDestroyed = (t) => !t || t.isDead || !towers.includes(t);

const renderTowerInfo = () => {
  if (!towerInfoEl) return;
  if (!selectedTower) {
    towerInfoEl.classList.remove('has-info');
    towerInfoEl.textContent = '— SELECT A TOWER —';
    return;
  }
  towerInfoEl.classList.add('has-info');

  // Per-type matchup: each tower type has its own weaknesses/resistances.
  const { weakTo, resists } = getTowerMatchupSummary(selectedTower.type);
  const destroyed = towerIsDestroyed(selectedTower);
  const hpText = destroyed
    ? 'DESTROYED'
    : `${Math.max(0, Math.round(selectedTower.health))} / ${selectedTower.maxHealth}`;

  towerInfoEl.innerHTML = `
    <div class="tower-info-row"><span class="tower-info-key">TYPE</span><span class="tower-info-val">MK ${selectedTower.type} TOWER</span></div>
    <div class="tower-info-row"><span class="tower-info-key">HP</span><span class="tower-info-val" id="towerInfoHp">${hpText}</span></div>
    <div class="tower-info-row tower-info-weak"><span class="tower-info-key">WEAK TO</span><span class="tower-info-val">${weakTo.length ? weakTo.join(', ') : '—'}</span></div>
    <div class="tower-info-row tower-info-resist"><span class="tower-info-key">RESISTS</span><span class="tower-info-val">${resists.length ? resists.join(', ') : '—'}</span></div>
  `;
};

// Cheap per-frame refresh of just the HP value while a tower is selected.
const updateTowerInfoHp = () => {
  if (!selectedTower) return;
  const el = document.getElementById('towerInfoHp');
  if (!el) return;
  el.textContent = towerIsDestroyed(selectedTower)
    ? 'DESTROYED'
    : `${Math.max(0, Math.round(selectedTower.health))} / ${selectedTower.maxHealth}`;
};

gameCanvasElement.addEventListener('click', (e) => {
  const rect = gameCanvasElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = (e.clientX - rect.left) * (gameCanvasElement.width / rect.width);
  const y = (e.clientY - rect.top) * (gameCanvasElement.height / rect.height);
  const tower = towers.find(t => towerHitTest(t, x, y));
  if (tower) {
    // Move the white highlight from the previously selected tower to this one.
    if (selectedTower) selectedTower.selected = false;
    selectedTower = tower;
    selectedTower.selected = true;
    renderTowerInfo();
  }
});

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (!mapLoaded) return;

  const now = performance.now();
  sim.dt = Math.min(100, now - lastFrameTime);
  lastFrameTime = now;

  gameCanvas.drawImage(backgroundImage, 0, 0);

  // Observing mode skips the local sim entirely and renders the most
  // recent broadcast snapshot. Explosions still play locally so the
  // tower destructions we catch up to are visually punctuated.
  if (observingMode) {
    renderObservedState();
    updateAndRenderExplosions();
    updateTowerInfoHp();
    return;
  }

  // A reward popup is up — the battle is BLOCKED until this player picks.
  // Re-render the current frame (entities frozen in place) without advancing
  // the sim, so the battlefield stays visible behind the modal but nothing
  // moves, attacks, or dies while choosing.
  if (rewardActive) {
    towers.forEach(t => t.render());
    attackUnits.forEach(u => (u.isDead ? u.renderDeath() : u.render()));
    updateAndRenderExplosions();
    updateTowerInfoHp();
    return;
  }

  // Clear out any destroyed towers — anywhere in the array, not just the
  // front of the line. Units can now bring towers down out of order, so a
  // dead one may sit at any index. Each removal credits the killing side.
  for (let i = towers.length - 1; i >= 0; i--) {
    if (!towers[i].isDead) continue;
    const dead = towers.splice(i, 1)[0];
    towersDestroyedCount++;
    runTowersDestroyed++;
    updateWaveProgress();
    renderHeader();
    emit('tower-destroyed', {
      towerIndex: towersDestroyedCount - 1,
      lastAttackerTeam: dead?.lastAttackerTeam ?? null,
      reward: dead?.reward ?? 0,
      x: dead?.centre?.x ?? dead?.position?.x ?? 0,
      y: dead?.centre?.y ?? dead?.position?.y ?? 0,
    });
  }
  // Defer map-clear/victory while a reward popup is open, so the last tower's
  // reward is chosen before the map advances or the run ends.
  if (towers.length === 0 && !rewardActive) checkWaveOutcome();

  // Each unit locks onto the nearest tower it can actually reach — scanning
  // ALL towers, not just towers[0]. Previously a unit only ever checked the
  // front-of-line tower, so it walked straight past any other tower it was
  // standing next to instead of attacking it.
  for (const unit of attackUnits) {
    if (!unit) continue;

    const hadTarget = !!unit.target;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const tower of towers) {
      if (!tower || tower.isDead) continue;
      if (!unitCanReachTower(unit, tower)) continue;
      const d = Math.hypot(
        tower.centre.x - unit.centre.x,
        tower.centre.y - unit.centre.y,
      );
      if (d < nearestDistance) {
        nearest = tower;
        nearestDistance = d;
      }
    }
    unit.target = nearest;

    // Just disengaged (the tower fell or moved out of range): the unit likely
    // detoured off the road to reach it, so its pathIndex now points at a
    // waypoint it already passed — resuming would march it BACKWARDS. Re-anchor
    // to the nearest segment's forward waypoint so it continues onward.
    if (hadTarget && !nearest) {
      unit.pathIndex = nearestPathSegmentEnd(unit.centre.x, unit.centre.y);
    }
  }

  
  // Keep dying units around until their death animation finishes (isGone),
  // not the instant they hit 0 HP (isDead) — otherwise they'd vanish before
  // a single death frame could render. They're excluded from "alive" checks
  // and broadcasts by isDead, so this is purely a local visual lifetime.
  attackUnits = attackUnits.filter(u => !u.isGone);
  attackUnits.forEach(u => u.updateFrame());
  towers.forEach(tower => {
    tower.updateFrame(attackUnits);
  });
  updateAndRenderExplosions();
  updateTowerInfoHp();

  renderLeaderboard();

  // Continuously check whether the wave has resolved so failure feedback
  // is instant. The settle timer in spawnWaveQueues() is still kept as a
  // belt-and-braces fallback in case unitsDeployedCount somehow undercounts.
  if (battleStarted && !rewardActive) checkWaveOutcome();
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
        if (error) { console.warn('snapshot seed failed', error); return; }
        if (!observingMode) return;        // we may have left observing already
        if (!data) return;                 // no DB row yet — fall through to broadcast
        if (latestSnapshot && (latestSnapshot.ts || 0) >= (data.ts || 0)) return;
        latestSnapshot = data;
        latestSnapshotIsSeed = true;       // DB origin — gate promotion accordingly
      });

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
  const hostReady = !!siege.host_queue_ready;
  const allyReady = !!siege.ally_queue_ready;
  if (hostReady && allyReady) {
    // Normal path: host commits the prep → battle transition. Ally waits.
    if (isHost) callBattleRpc('start_wave_battle', { p_siege: siege.id }, false);
  } else {
    // Solo start: the other side is broke, so whichever solvent player IS
    // ready launches the wave on their own (either player may, hence not
    // host-only). The server verifies the other side has nothing queued.
    const iAmReady = isHost ? hostReady : allyReady;
    if (iAmReady) {
      callBattleRpc('start_wave_solo', { p_siege: siege.id }, false,
        ['not_ready', 'other_has_units', 'wrong_phase']);
    }
  }
};

// Spawn the queues for the wave that just transitioned to phase='battle'
// on the server. Called from applySiegeUpdate when prevPhase==='prep'
// and the fresh row's phase==='battle'. Idempotent via battleStarted.
const beginWaveSpawn = () => {
  if (!mapLoaded || matchEnded) return;
  if (battleStarted) return;
  if (observingMode) return;  // refreshers stay observing instead of spawning

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
  // Per-wave contribution accumulates into the same totals across the whole
  // RUN (every wave of every map) — only zero it at the very start of the run
  // (first map, first wave). advance_map resets current_wave to 1, so guarding
  // on the wave alone would wipe earlier maps' contribution from the payout.
  if (mapIndex === 0 && (siege.current_wave ?? 1) === 1) {
    resetContribution();
    resetBuffs();
    runTowersDestroyed = 0;
    runUnitsDeployed = 0;
  }

  // Baseline for the wave-failed summary's per-wave tower-damage figure,
  // and clear any summary popup left over from the previous attempt.
  waveStartDamage = { host: contribution.host.damage_dealt, ally: contribution.ally.damage_dealt };
  hideWaveSummary();

  bothReadyBanner.classList.remove('hidden');
  setTimeout(() => bothReadyBanner.classList.add('hidden'), 1400);
  spawnWaveQueues();
  renderWaveTrack(siege.current_wave || 1, siege.total_waves || 15);
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
  // Drop rows that are strictly older than what we already have.
  // - Lower current_wave: stale.
  // - Same wave but lower phase order: stale (e.g. echo of 'battle'
  //   arriving after we've optimistically flipped to 'prep' for the
  //   re-attempt). Outcome is a one-way door — once set, never unset.
  if (siege) {
    // map_index outranks current_wave: advancing to a new map resets the
    // wave counter to 1, so a higher map is ALWAYS newer even though its
    // wave number is lower. Only fall through to the wave/phase ordering
    // when both rows are on the same map.
    const freshMap = fresh.map_index ?? 0;
    const liveMap = siege.map_index ?? 0;
    if (freshMap < liveMap) return;
    if (freshMap === liveMap) {
      const freshWave = fresh.current_wave ?? 1;
      const liveWave = siege.current_wave ?? 1;
      if (freshWave < liveWave) return;
      if (freshWave === liveWave) {
        const freshPhaseOrd = phaseOrder[fresh.phase] ?? 0;
        const livePhaseOrd = phaseOrder[siege.phase] ?? 0;
        if (freshPhaseOrd < livePhaseOrd) return;
      }
    }
    if (siege.outcome && !fresh.outcome) return;
  }
  const prevPhase = siege?.phase;
  siege = fresh;

  // Map advanced (we cleared the previous one). Swap in the new map's art,
  // path and a fresh tower set before the prep-phase handling below resets
  // the per-wave battle state.
  if ((fresh.map_index ?? 0) !== mapIndex) {
    loadMap(fresh.map_index ?? 0);
  }

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
    observingMode = false;   // ← back to normal sim for the next wave
    latestSnapshot = null;
    if (waveSettleTimer) { clearTimeout(waveSettleTimer); waveSettleTimer = null; }
    attackUnits = [];
    unitsDeployedCount = 0;
    hideWaveSummary();       // ← the other player advanced; dismiss our popup
    updateWaveProgress();
    // No one can afford to deploy this wave → the siege is lost.
    checkGoldStarvation();
  }

  // Server has just committed the prep → battle transition. Spawn the
  // queues NOW so both clients spawn off the same event instead of off
  // their own lock-in moments (which previously raced the RPC commit
  // and let a refresher re-spawn fresh while the other client's sim was
  // already mid-flight).
  if (siege.phase === 'battle' && prevPhase === 'prep' && !battleStarted && !observingMode && !matchEnded) {
    beginWaveSpawn();
  }
  render();

  // End-of-match overlay if the host wrote outcome from the other client.
  if (siege.outcome && !matchEnded) {
    showEndOverlay(siege.outcome);
    return;
  }
  // Every participating side is ready — start (or re-start) the current wave.
  // A broke side that can't deploy is skipped, so one solvent player can begin.
  if (canStartWave() && !battleStarted && !matchEnded) startWave();
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
  // startWave() has the refresh-recovery guard inside it — if we land
  // here with phase='battle' (mid-wave reconnect), it'll suppress the
  // spawn and show the AWAITING ALLY banner instead. Safe to call
  // whenever every participating side is ready.
  if (siege && canStartWave()) startWave();
};

// Switch the battlefield to map `index`: new background art + road path, and
// a fresh set of towers. Setting backgroundImage.src re-fires the onload
// above, which re-runs initialiseTowers() against the now-current map (so
// towers / totalTowers reset). Called when advance_map bumps map_index.
const loadMap = (index) => {
  mapIndex = index;
  currentMap = getMapByIndex(index);
  activePath = currentMap.path;
  towersDestroyedCount = 0;
  totalTowers = 0;
  selectedTower = null;
  mapLoaded = false;          // animate() pauses until the new art loads
  backgroundImage.src = currentMap.background;
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

  // Which map of the run are we on? Both clients read map_index off the
  // siege row and derive the same map (background + road path + tower pool).
  mapIndex = siege.map_index ?? 0;
  currentMap = getMapByIndex(mapIndex);
  activePath = currentMap.path;

  // Roll this match's stone-tower weaknesses/resistances. Seeded from the
  // siege id so both clients derive the identical table with no DB write.
  initTowerMatchups(siege.id, UNITS.map(u => u.id));

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
  mySelf  = { profile: meProfile || { points: 0 } };
  myOther = { profile: themProfile || { points: 0 } };
  if (meProfile?.username) siege[isHost ? 'host_username' : 'ally_username'] = meProfile.username;
  if (themProfile?.username) siege[isHost ? 'ally_username' : 'host_username'] = themProfile.username;

  // Seed the battle leaderboard from each side's PERSISTED tower-kill score so
  // it survives a refresh (rather than resetting to 0). Map me/other → host/ally.
  setLeaderboardPoints({
    hostPoints: (isHost ? meProfile : themProfile)?.tower_points ?? 0,
    allyPoints: (isHost ? themProfile : meProfile)?.tower_points ?? 0,
  });
  renderLeaderboard();

  // ── REFRESH-INTO-COMPLETED-MATCH GUARD ─────────────────
  // The match is already terminal on the row (the other player resolved
  // it while we were refreshing). Show the overlay immediately and skip
  // enter_prep_phase / realtime sub / wave spawn — those paths can blow
  // away siege.outcome or kick a fresh wave that the user never sees.
  // This is the fix for "victory screen doesn't show up for the player
  // who was refreshing during".
  if (siege.outcome === 'victory' || siege.outcome === 'defeat') {
    // Pull final totals from the persisted contribution columns so the
    // overlay shows real numbers instead of "0 / N". Contribution accumulates
    // across the whole run, so it doubles as the run-wide towers-destroyed
    // total for a player who refreshed straight into the end screen.
    towersDestroyedCount =
      (siege.host_contribution?.towers_destroyed ?? 0) +
      (siege.ally_contribution?.towers_destroyed ?? 0);
    runTowersDestroyed = towersDestroyedCount;
    // Paint the map background once so the canvas behind the overlay
    // isn't blank. Doesn't matter that towers aren't drawn — the
    // overlay covers them.
    backgroundImage.onload = () => {
      gameCanvas.drawImage(backgroundImage, 0, 0);
    };
    backgroundImage.src = currentMap.background;
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

  renderWaveTrack(siege.current_wave || 1, siege.total_waves || 15);
  render();

  // Map + tower init kicks off via backgroundImage.onload below.
  backgroundImage.src = currentMap.background;

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
  battleBroadcast = supabase.channel(`battle-broadcast-${siege.id}`, {
    config: { broadcast: { self: false } },  // don't echo our own sends
  });

  // Track the last broadcast payload so the periodic DB-persist tick can
  // forward it without re-building. Persistence happens at half the
  // broadcast rate (~2Hz) to keep DB writes modest while still giving a
  // cold-reconnecting client recent state.
  let lastBroadcastPayload = null;

  battleBroadcast
    .on('broadcast', { event: 'snapshot' }, (msg) => {
      // Only apply if we're actually observing — non-observing
      // clients have their own authoritative local sim.
      if (observingMode && msg?.payload) {
        latestSnapshot = msg.payload;
        latestSnapshotIsSeed = false;  // live data — promotion may use it
      }
    })
    .on('broadcast', { event: 'speed' }, (msg) => {
      // The other player changed the gameplay speed — match it so both
      // sims fast-forward in lockstep. broadcast:false so we don't echo
      // it straight back to them.
      const s = msg?.payload?.speed;
      if (s) setGameSpeed(s, { broadcast: false });
    })
    .on('broadcast', { event: 'buff' }, (msg) => {
      // The other player picked a reward buff for their side. Apply it here
      // too so this client's sim of their units matches theirs.
      const p = msg?.payload;
      if (p && p.side && p.buff) addBuff(p.side, p.buff);
    })
    .on('broadcast', { event: 'reward-picked' }, (msg) => {
      // The ally finished choosing this reward round — release the lockstep
      // freeze once we've also chosen (see resolveFrontRound).
      const round = msg?.payload?.round;
      if (typeof round === 'number') onAllyRewardPick(round);
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // 5Hz snapshot. Payload keys are 1-char to keep packet small:
      //   ts: send timestamp,
      //   units: [{x, y, t (team), u (unit type id), h (hp), m (maxHp)}],
      //   towers: [{i (original index), h, m}],
      //   td: towersDestroyedCount (so observer can catch up shifts).
      //
      // The broadcast guard intentionally does NOT include matchEnded —
      // we keep broadcasting after the local sim ends so an observer
      // who refreshes in the brief window before set_match_outcome
      // echoes through realtime still sees the final battlefield
      // state (all towers gone, no units) instead of staring at full
      // towers. Once siege.outcome is set on the row (RPC landed),
      // observers get the news via postgres_changes and we stop.
      setInterval(() => {
        if (!battleStarted || observingMode) return;
        if (siege?.outcome) return;
        const payload = {
          ts: Date.now(),
          units: attackUnits
            .filter(u => !u.isDead)
            .map(u => ({
              x: Math.round(u.position?.x ?? 0),
              y: Math.round(u.position?.y ?? 0),
              t: u.team,
              u: u.unitId || u.constructor?.name || 'Soldier',  // sprite key
              h: Math.max(0, Math.round(u.health ?? 0)),
              m: Math.max(1, Math.round(u.maxHealth ?? 1)),
              // a = 1 when the unit has a live attack target. Observed
              // clients use this to swap to the Attack sprite sheet so
              // refreshed players see units actually attacking towers
              // instead of just standing in idle.
              a: (u.target && (u.target.health ?? 1) > 0) ? 1 : 0,
            })),
          towers: towers.map((t, i) => ({
            i: towersDestroyedCount + i,  // original (pre-destruction) index
            h: Math.max(0, Math.round(t.health ?? 0)),
            m: Math.max(1, Math.round(t.maxHealth ?? 1)),
          })),
          td: towersDestroyedCount,
        };
        lastBroadcastPayload = payload;
        battleBroadcast.send({ type: 'broadcast', event: 'snapshot', payload });
      }, 200);

      // ── DB SNAPSHOT PERSIST ──────────────────────────────────
      // Upsert the latest payload into public.siege_snapshots every
      // 500ms while we're simming. This is what lets a client that
      // refreshes mid-wave (or both peers disconnecting briefly) pick
      // back up from real battlefield state instead of staring at an
      // empty canvas. The watchdog (migration 012) terminates matches
      // whose row goes stale for >60s.
      setInterval(() => {
        if (!battleStarted || observingMode) return;
        if (siege?.outcome) return;
        if (!lastBroadcastPayload) return;
        supabase
          .rpc('upsert_siege_snapshot', { p_siege: siege.id, p_state: lastBroadcastPayload })
          .then(({ error }) => { if (error) console.warn('snapshot persist failed', error); });
      }, 500);
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
            latestSnapshot = state;
            // A CDC push of a row that the OTHER peer just wrote IS
            // fresh in the only sense that matters here (the peer is
            // alive and persisting). Treat the same as a live broadcast.
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
    try { presenceChannel.untrack(); } catch { /* socket already gone */ }
  });
  } // end refresh-into-completed-match else
}
