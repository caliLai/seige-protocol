/* ═══════════════════════════════════════════════
   WAVE 1 — both players build an ordered spawn queue from the 3 unit
   types they locked in during siege-setup. Gold-gated by difficulty.
   Mirrors siege-setup.js (siege row + realtime + ready handshake).
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { UNITS_BY_ID, idleSpriteUrl, deployCost, deployCostById } from '/lib/units.js';

// Starting gold by difficulty. Numbers from game-flow.md (easy/normal/hard
// map to recruit/veteran/elite). Tune here if economy needs rebalancing.
const STARTING_GOLD = { recruit: 300, veteran: 250, elite: 200 };
const goldForDifficulty = (d) => STARTING_GOLD[d] ?? 250;

// ── DOM REFS ──
const leaveBtn = document.getElementById('leaveBtn');
const mapImage = document.getElementById('mapImage');
const mapName = document.getElementById('mapName');
const roomDifficulty = document.getElementById('roomDifficulty');
const siegeNameSub = document.getElementById('siegeNameSub');

const selfNameEl = document.getElementById('selfName');
const selfRoleEl = document.getElementById('selfRole');
const selfHintEl = document.getElementById('selfHint');
const selfQueueEl = document.getElementById('selfQueue');
const selfTypesEl = document.getElementById('selfTypes');
const selfGoldValueEl = document.getElementById('selfGoldValue');
const selfGoldCapEl = document.getElementById('selfGoldCap');
const readyBtn = document.getElementById('readyBtn');

const otherNameEl = document.getElementById('otherName');
const otherRoleEl = document.getElementById('otherRole');
const otherHintEl = document.getElementById('otherHint');
const otherQueueEl = document.getElementById('otherQueue');
const otherTypesEl = document.getElementById('otherTypes');
const otherGoldValueEl = document.getElementById('otherGoldValue');
const otherGoldCapEl = document.getElementById('otherGoldCap');
const otherReadyEl = document.getElementById('otherReady');

const bothReadyBanner = document.getElementById('bothReadyBanner');
const alertEl = document.getElementById('alertBanner');

const leaveOverlay = document.getElementById('leaveOverlay');
const leaveCancelBtn = document.getElementById('leaveCancelBtn');
const leaveConfirmBtn = document.getElementById('leaveConfirmBtn');
const leaveConfirmText = document.getElementById('leaveConfirmText');
const leaveConfirmLoading = document.getElementById('leaveConfirmLoading');

// ── STATE ──
let siege = null;
let isHost = false;
let mySelf = { profile: null, userId: null, username: 'KNIGHT' };
let myOther = { profile: null, userId: null, username: 'KNIGHT' };
let navigated = false;
let startingGold = 250;

// ── HELPERS ──
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Running total of deploy gold for the queue. Unknown ids contribute 0 so
// a renamed unit can't NaN the counter.
const queueCost = (queue) => queue.reduce((sum, id) => sum + deployCostById(id), 0);

const showAlert = (msg, type = 'info') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  alertEl.style.color = '#f0d9a0';
  alertEl.style.boxShadow = '3px 3px 0 #000';
  clearTimeout(alertEl._t);
  alertEl._t = setTimeout(() => { alertEl.style.display = 'none'; }, 2600);
};

const smoothNavigate = (url) => {
  if ('startViewTransition' in document) {
    setTimeout(() => { window.location.href = url; }, 200);
    return;
  }
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};

const returnToLobby = () => smoothNavigate('/lobby/lobby.html');

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

// ── SPRITE ANIMATION (idle strips — same approach as siege-setup) ──
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

const animateSprite = async (spriteEl, unitId, stageSize) => {
  const prev = spriteTimers.get(spriteEl);
  if (prev) clearInterval(prev);
  const meta = await loadIdleMeta(unitId);
  if (!spriteEl.isConnected) return;
  const scale = (stageSize - 6) / Math.max(meta.frameWidth, meta.frameHeight);
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
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
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

// ── RENDER ──
const renderHeader = () => {
  mapImage.src = siege.map_src || '/assets/maps/calista-map.png';
  mapName.textContent = siege.map || '—';
  roomDifficulty.className = `diff-badge diff-${siege.difficulty || 'recruit'}`;
  roomDifficulty.textContent = (siege.difficulty || 'recruit').toUpperCase();
  siegeNameSub.textContent = siege.name ? `— ${siege.name.toUpperCase()} —` : '— ORDER THY SPAWN —';

  selfNameEl.textContent = (mySelf.username || 'KNIGHT').toUpperCase();
  selfRoleEl.textContent = isHost ? 'HOST' : 'ALLY';
  otherNameEl.textContent = (myOther.username || 'KNIGHT').toUpperCase();
  otherRoleEl.textContent = isHost ? 'ALLY' : 'HOST';
};

// Renders the ordered queue strip. Clicking a tile (own side only) removes
// that entry — the queue is order-preserving, so we splice by index.
const renderQueue = (containerEl, queue, interactive) => {
  containerEl.innerHTML = '';
  containerEl.classList.toggle('has-items', queue.length > 0);
  if (!queue.length) {
    containerEl.innerHTML = `
      <div class="wave1-queue-empty">
        ${interactive ? 'CLICK THY TYPES BELOW TO QUEUE UNITS' : 'AWAITING THEIR ORDERS…'}
      </div>
    `;
    return;
  }
  queue.forEach((id, idx) => {
    if (idx > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'wave1-queue-arrow';
      arrow.textContent = '→';
      containerEl.appendChild(arrow);
    }
    const tile = document.createElement('div');
    tile.className = 'wave1-queue-item';
    tile.setAttribute('role', 'listitem');
    tile.dataset.idx = String(idx);
    tile.title = `${idx + 1}. ${id}`;
    tile.innerHTML = `
      <div class="wave1-queue-idx">${idx + 1}</div>
      ${interactive ? '<div class="wave1-queue-remove">✕</div>' : ''}
      <div class="wave1-queue-stage">
        <div class="wave1-queue-sprite" data-unit="${escapeHtml(id)}"></div>
      </div>
    `;
    const spriteEl = tile.querySelector('.wave1-queue-sprite');
    animateSprite(spriteEl, id, 40);
    if (interactive) tile.addEventListener('click', () => removeFromQueue(idx));
    containerEl.appendChild(tile);
  });
};

// Renders the 3 unit-type cards picked in siege-setup. On the self side,
// clicking adds the type to the queue if the player can afford it.
// Starter units in the catalog have cost 0 — those are always addable.
const renderTypes = (containerEl, types, interactive, remainingGold) => {
  containerEl.innerHTML = '';
  if (!types.length) {
    containerEl.innerHTML = `<div class="setup-pool-empty">NO TYPES SELECTED</div>`;
    return;
  }
  for (const id of types) {
    const unit = UNITS_BY_ID.get(id);
    if (!unit) continue;
    const cost = deployCost(unit);
    const canAfford = interactive ? cost <= remainingGold : true;
    const card = document.createElement('div');
    card.className = `wave1-type-card${canAfford ? '' : ' is-disabled'}`;
    card.setAttribute('role', 'listitem');
    card.dataset.unitId = id;
    card.title = `${id} — COST ${cost}, HP ${unit.hp}, DMG ${unit.damage}`;
    card.innerHTML = `
      <div class="wave1-type-cost">${cost}g</div>
      <div class="wave1-type-stage">
        <div class="wave1-type-sprite" data-unit="${escapeHtml(id)}"></div>
      </div>
      <div class="wave1-type-name">${escapeHtml(id.toUpperCase())}</div>
    `;
    const spriteEl = card.querySelector('.wave1-type-sprite');
    animateSprite(spriteEl, id, 56);
    if (interactive && canAfford) {
      card.addEventListener('click', () => addToQueue(id));
    }
    containerEl.appendChild(card);
  }
};

const renderGold = (valueEl, capEl, rowEl, spent, cap) => {
  const remaining = Math.max(0, cap - spent);
  valueEl.textContent = String(remaining);
  capEl.textContent = String(cap);
  rowEl.classList.toggle('is-empty', remaining === 0);
};

const renderReadyControls = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myQueue = siege[`${mySide}_wave1`] || [];
  const myReady = !!siege[`${mySide}_wave1_ready`];
  const otherQueue = siege[`${otherSide}_wave1`] || [];
  const otherReady = !!siege[`${otherSide}_wave1_ready`];

  if (myQueue.length === 0) {
    selfHintEl.textContent = 'QUEUE AT LEAST ONE UNIT';
    selfHintEl.classList.remove('is-complete');
  } else if (myReady) {
    selfHintEl.textContent = 'STANDING READY — AWAITING ALLY';
    selfHintEl.classList.add('is-complete');
  } else {
    selfHintEl.textContent = `${myQueue.length} UNIT${myQueue.length === 1 ? '' : 'S'} QUEUED — LOCK IN WHEN READY`;
    selfHintEl.classList.add('is-complete');
  }

  const canReady = myQueue.length > 0;
  readyBtn.disabled = !canReady;
  readyBtn.classList.toggle('is-ready', myReady);
  readyBtn.textContent = myReady ? '⊘ STAND DOWN' : '⚔ LOCK IN WAVE I ⚔';

  otherReadyEl.classList.toggle('is-ready', otherReady);
  otherReadyEl.querySelector('.setup-ready-text').textContent = otherReady ? 'READY' : 'NOT READY';
  if (otherReady) {
    otherHintEl.textContent = 'THEY STAND READY';
    otherHintEl.classList.add('is-complete');
  } else if (otherQueue.length > 0) {
    otherHintEl.textContent = `${otherQueue.length} QUEUED — STILL CHOOSING…`;
    otherHintEl.classList.remove('is-complete');
  } else {
    otherHintEl.textContent = 'AWAITING THEIR QUEUE…';
    otherHintEl.classList.remove('is-complete');
  }
};

const render = () => {
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myTypes = siege[`${mySide}_units`] || [];
  const otherTypes = siege[`${otherSide}_units`] || [];
  const myQueue = siege[`${mySide}_wave1`] || [];
  const otherQueue = siege[`${otherSide}_wave1`] || [];

  const mySpent = queueCost(myQueue);
  const otherSpent = queueCost(otherQueue);
  const myRemaining = Math.max(0, startingGold - mySpent);

  renderHeader();
  renderGold(selfGoldValueEl, selfGoldCapEl, selfGoldValueEl.parentElement, mySpent, startingGold);
  renderGold(otherGoldValueEl, otherGoldCapEl, otherGoldValueEl.parentElement, otherSpent, startingGold);
  renderQueue(selfQueueEl, myQueue, true);
  renderQueue(otherQueueEl, otherQueue, false);
  renderTypes(selfTypesEl, myTypes, true, myRemaining);
  renderTypes(otherTypesEl, otherTypes, false, 0);
  renderReadyControls();
};

// ── ACTIONS ──
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
  if (!siege) return;
  const mySide = isHost ? 'host_wave1' : 'ally_wave1';
  const readyKey = isHost ? 'host_wave1_ready' : 'ally_wave1_ready';
  const queue = [...(siege[mySide] || [])];
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) return;

  // Only allow units that are part of this player's siege-setup picks —
  // belt against a stale UI click after the picks were renegotiated.
  const myTypes = siege[isHost ? 'host_units' : 'ally_units'] || [];
  if (!myTypes.includes(unitId)) return;

  const spent = queueCost(queue);
  if (spent + deployCost(unit) > startingGold) {
    showAlert('✗ NOT ENOUGH GOLD', 'error');
    return;
  }
  queue.push(unitId);
  const patch = { [mySide]: queue };
  // Auto-unready on edit so a sneaky last-second change can't beat the
  // opponent's ready check.
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const removeFromQueue = (idx) => {
  if (!siege) return;
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
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const queue = siege[`${mySide}_wave1`] || [];
  if (queue.length === 0) return;
  const readyKey = `${mySide}_wave1_ready`;
  const next = !siege[readyKey];
  applySiegeUpdate({ ...siege, [readyKey]: next });
  await updateSiege({ [readyKey]: next });
};

// ── LEAVE / DISBAND ──
const openLeaveModal = () => {
  leaveOverlay.classList.remove('hidden');
  leaveOverlay.setAttribute('aria-hidden', 'false');
  leaveConfirmBtn.disabled = false;
  leaveConfirmText.style.display = 'inline';
  leaveConfirmLoading.style.display = 'none';
  setTimeout(() => leaveCancelBtn.focus(), 30);
};
const closeLeaveModal = () => {
  leaveOverlay.classList.add('hidden');
  leaveOverlay.setAttribute('aria-hidden', 'true');
};

leaveBtn.addEventListener('click', openLeaveModal);
leaveCancelBtn.addEventListener('click', closeLeaveModal);
leaveOverlay.addEventListener('click', (e) => { if (e.target === leaveOverlay) closeLeaveModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !leaveOverlay.classList.contains('hidden')) {
    e.stopImmediatePropagation();
    closeLeaveModal();
  }
});

leaveConfirmBtn.addEventListener('click', async () => {
  if (!siege) return;
  leaveConfirmBtn.disabled = true;
  leaveConfirmText.style.display = 'none';
  leaveConfirmLoading.style.display = 'inline';

  const { error } = await supabase.from('sieges').delete().eq('id', siege.id);
  if (error) {
    console.error('disband failed', error);
    if (!isHost) {
      await supabase
        .from('sieges')
        .update({ ally_id: null, ally_username: null, ally_units: [], ally_ready: false, ally_wave1: [], ally_wave1_ready: false, started_at: null })
        .eq('id', siege.id)
        .eq('ally_id', user.id);
      showAlert('↶ THOU HAST WITHDRAWN', 'success');
      returnToLobby();
      return;
    }
    showAlert(`✗ COULD NOT DISBAND: ${(error.message || '').toUpperCase()}`, 'error');
    leaveConfirmBtn.disabled = false;
    leaveConfirmText.style.display = 'inline';
    leaveConfirmLoading.style.display = 'none';
    return;
  }

  showAlert('☠ THE SIEGE IS DISBANDED', 'success');
  returnToLobby();
});

readyBtn.addEventListener('click', toggleReady);

// ── REALTIME RECONCILIATION ──
const applySiegeUpdate = (fresh) => {
  if (!fresh || fresh.id !== siege?.id) return;
  const prev = siege;
  siege = fresh;
  render();

  const bothReady = !!siege.host_wave1_ready && !!siege.ally_wave1_ready;
  if (bothReady && !navigated) {
    // Hand the wave queues off to the game page via sessionStorage so the
    // canvas runtime doesn't need to re-query Supabase before the first
    // spawn. The siege row remains the source of truth.
    navigated = true;
    sessionStorage.setItem('wave1Siege', JSON.stringify({
      id: siege.id,
      host_wave1: siege.host_wave1 || [],
      ally_wave1: siege.ally_wave1 || [],
      difficulty: siege.difficulty,
      map: siege.map,
    }));
    bothReadyBanner.classList.remove('hidden');
    bothReadyBanner.setAttribute('aria-hidden', 'false');
    setTimeout(() => smoothNavigate('/game/game.html'), 1100);
    return;
  }

  if (prev?.started_at && !siege.started_at) {
    showAlert('↶ THE SIEGE WAS ABANDONED', 'error');
    returnToLobby();
  }
};

// ── INIT ──
const handoffId = sessionStorage.getItem('wave1SiegeId');

siege = await loadSiege(handoffId);
if (!siege && handoffId) {
  await new Promise(r => setTimeout(r, 400));
  siege = await loadSiege(handoffId);
}

const bounce = (reason, alertMsg) => {
  console.error('[wave-1] bouncing to lobby:', reason, { handoffId, userId: user?.id, siege });
  showAlert(alertMsg, 'error');
  setTimeout(returnToLobby, 1200);
};

if (!siege) {
  bounce('siege row not found', `⊘ SIEGE NOT FOUND${handoffId ? '' : ' (NO HANDOFF ID)'} — RETURNING TO WAR ROOM`);
} else if (siege.host_id !== user.id && siege.ally_id !== user.id) {
  bounce('user is neither host nor ally', '⊘ THOU ART NOT IN THIS SIEGE — RETURNING TO WAR ROOM');
} else if (!siege.started_at) {
  bounce('siege.started_at is null', '⊘ SIEGE NOT YET STARTED — RETURNING TO WAR ROOM');
} else if (!(siege.host_ready && siege.ally_ready)) {
  // Wave 1 should only be reachable after both sides locked in their
  // siege-setup picks; bounce back if a client arrived early.
  bounce('siege-setup not yet locked in', '⊘ HOST NOT YET MUSTERED — RETURN TO MARSHALLING');
  setTimeout(() => { sessionStorage.setItem('setupSiegeId', siege.id); smoothNavigate('/siege-setup/siege-setup.html'); }, 1200);
} else {
  isHost = siege.host_id === user.id;
  startingGold = goldForDifficulty(siege.difficulty);

  const myUid = user.id;
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meProfile, themProfile] = await Promise.all([
    loadProfile(myUid),
    otherUid ? loadProfile(otherUid) : Promise.resolve(null),
  ]);
  mySelf = { profile: meProfile, userId: myUid, username: meProfile?.username || (isHost ? siege.host_username : siege.ally_username) || 'KNIGHT' };
  myOther = { profile: themProfile, userId: otherUid, username: themProfile?.username || (isHost ? siege.ally_username : siege.host_username) || 'KNIGHT' };

  render();

  supabase
    .channel(`wave1-${siege.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      (payload) => applySiegeUpdate(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
      () => {
        if (navigated) return;
        navigated = true;
        showAlert('☠ THE SIEGE WAS DISBANDED', 'error');
        setTimeout(returnToLobby, 900);
      })
    .subscribe();
}
