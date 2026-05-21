/* ═══════════════════════════════════════════════
   SIEGE SETUP — both players pick 3 units, ready up
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { UNITS_BY_ID, availableUnits, idleSpriteUrl } from '/lib/units.js';

// ── DOM REFS ──
const leaveBtn = document.getElementById('leaveBtn');
const mapImage = document.getElementById('mapImage');
const mapName = document.getElementById('mapName');
const roomDifficulty = document.getElementById('roomDifficulty');
const siegeNameSub = document.getElementById('siegeNameSub');

const selfNameEl = document.getElementById('selfName');
const selfRoleEl = document.getElementById('selfRole');
const selfHintEl = document.getElementById('selfHint');
const selfSlotsEl = document.getElementById('selfSlots');
const selfPoolEl = document.getElementById('selfPool');
const readyBtn = document.getElementById('readyBtn');

const otherNameEl = document.getElementById('otherName');
const otherRoleEl = document.getElementById('otherRole');
const otherHintEl = document.getElementById('otherHint');
const otherSlotsEl = document.getElementById('otherSlots');
const otherPoolEl = document.getElementById('otherPool');
const otherReadyEl = document.getElementById('otherReady');

const bothReadyBanner = document.getElementById('bothReadyBanner');
const alertEl = document.getElementById('alertBanner');

const leaveOverlay = document.getElementById('leaveOverlay');
const leaveCancelBtn = document.getElementById('leaveCancelBtn');
const leaveConfirmBtn = document.getElementById('leaveConfirmBtn');
const leaveConfirmText = document.getElementById('leaveConfirmText');
const leaveConfirmLoading = document.getElementById('leaveConfirmLoading');

// ── STATE ──
const MAX_PICKS = 3;
let siege = null;           // current row from public.sieges
let isHost = false;         // user.id === siege.host_id
let mySelf = { profile: null,   userId: null, username: 'KNIGHT' };
let myOther = { profile: null,  userId: null, username: 'KNIGHT' };
let navigated = false;      // guard so the both-ready handler doesn't fire twice

// ── HELPERS ──
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

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

// ── SPRITE ANIMATION ──
// Same horizontal-strip pattern roster.js uses, but Idle-only since this
// screen is about choosing — not previewing attacks.
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
      // Sensible fallback — assume 600×100 / 6 frames like the originals.
      const meta = { sheetWidth: 600, frameWidth: 100, frameHeight: 100, frameCount: 6, src };
      spriteMetaCache.set(unitId, meta);
      resolve(meta);
    };
    img.src = src;
  });
};

// Drive an animated idle on a sprite element. Stops any prior animation
// on the same element so re-rendering doesn't leak timers.
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
    .select('user_id, username, unlocked_units')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
  return data || { user_id: userId, username: 'KNIGHT', unlocked_units: [] };
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

// ── RENDER: PICK SLOTS ──
// Renders the three slot panels for a given side. `interactive` controls
// whether clicking a filled slot removes the pick (only the self side).
const renderSlots = (containerEl, picks, interactive) => {
  containerEl.innerHTML = '';
  for (let i = 0; i < MAX_PICKS; i++) {
    const id = picks[i] || null;
    const slot = document.createElement('div');
    slot.className = `setup-slot${id ? ' is-filled' : ''}`;
    slot.setAttribute('role', 'listitem');
    slot.dataset.idx = String(i);
    if (id) {
      slot.dataset.unitId = id;
      slot.innerHTML = `
        <div class="setup-slot-sprite-stage">
          <div class="setup-slot-sprite" data-unit="${escapeHtml(id)}"></div>
        </div>
        <div class="setup-slot-name">${escapeHtml(id.toUpperCase())}</div>
        ${interactive ? `<div class="setup-slot-remove">✕</div>` : ''}
      `;
      const spriteEl = slot.querySelector('.setup-slot-sprite');
      animateSprite(spriteEl, id, 72);
      if (interactive) {
        slot.addEventListener('click', () => removePick(i));
      }
    } else {
      slot.innerHTML = `
        <div class="setup-slot-empty-mark">+</div>
        <div class="setup-slot-empty-label">SLOT ${i + 1}</div>
      `;
    }
    containerEl.appendChild(slot);
  }
};

// ── RENDER: POOL ──
// Builds the "your unlocked units" grid. For the self side, clicking a
// card adds it to the next empty slot (unless already picked — distinct
// rule means each unit can only be in one slot at a time).
const renderPool = (containerEl, units, picks, interactive) => {
  containerEl.innerHTML = '';
  if (!units.length) {
    containerEl.innerHTML = `
      <div class="setup-pool-empty">
        NO UNITS UNLOCKED YET<br/>
        ${interactive ? '— VISIT THE ROSTER —' : '— THEIR ARMORY IS EMPTY —'}
      </div>
    `;
    return;
  }
  const picked = new Set(picks);
  for (const unit of units) {
    const isPicked = picked.has(unit.id);
    const card = document.createElement('div');
    card.className = `setup-pool-card${isPicked ? ' is-picked' : ''}`;
    card.setAttribute('role', 'listitem');
    card.dataset.unitId = unit.id;
    card.title = `${unit.id} — HP ${unit.hp}, DMG ${unit.damage}, SPD ${unit.speed}`;
    card.innerHTML = `
      <div class="setup-pool-sprite-stage">
        <div class="setup-pool-sprite" data-unit="${escapeHtml(unit.id)}"></div>
      </div>
      <div class="setup-pool-name">${escapeHtml(unit.id.toUpperCase())}</div>
    `;
    const spriteEl = card.querySelector('.setup-pool-sprite');
    animateSprite(spriteEl, unit.id, 48);
    if (interactive && !isPicked) {
      card.addEventListener('click', () => addPick(unit.id));
    }
    containerEl.appendChild(card);
  }
};

// ── RENDER: HEADER + READY STATES ──
const renderHeader = () => {
  mapImage.src = siege.map_src || '/assets/maps/calista-map.png';
  mapName.textContent = siege.map || '—';
  roomDifficulty.className = `diff-badge diff-${siege.difficulty || 'recruit'}`;
  roomDifficulty.textContent = (siege.difficulty || 'recruit').toUpperCase();
  siegeNameSub.textContent = siege.name ? `— ${siege.name.toUpperCase()} —` : '— CHOOSE THY THREE —';

  selfNameEl.textContent = (mySelf.username || 'KNIGHT').toUpperCase();
  selfRoleEl.textContent = isHost ? 'HOST' : 'ALLY';
  otherNameEl.textContent = (myOther.username || 'KNIGHT').toUpperCase();
  otherRoleEl.textContent = isHost ? 'ALLY' : 'HOST';
};

const renderReadyControls = () => {
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myPicks = siege[`${mySide}_units`] || [];
  const myReady = !!siege[`${mySide}_ready`];
  const otherReady = !!siege[`${otherSide}_ready`];

  // Self hint
  if (myPicks.length >= MAX_PICKS) {
    selfHintEl.textContent = myReady ? 'STANDING READY — AWAITING ALLY' : 'READY UP WHEN PREPARED';
    selfHintEl.classList.add('is-complete');
  } else {
    const remaining = MAX_PICKS - myPicks.length;
    selfHintEl.textContent = `CHOOSE ${remaining} MORE UNIT${remaining === 1 ? '' : 'S'}`;
    selfHintEl.classList.remove('is-complete');
  }

  // Ready button
  const canReady = myPicks.length >= MAX_PICKS;
  readyBtn.disabled = !canReady;
  readyBtn.classList.toggle('is-ready', myReady);
  readyBtn.textContent = myReady ? '⊘ STAND DOWN' : '⚔ READY THY HOST ⚔';

  // Other-side indicator + hint
  const otherPicks = siege[`${otherSide}_units`] || [];
  otherReadyEl.classList.toggle('is-ready', otherReady);
  otherReadyEl.querySelector('.setup-ready-text').textContent = otherReady ? 'READY' : 'NOT READY';
  if (otherReady) {
    otherHintEl.textContent = 'THEY STAND READY';
    otherHintEl.classList.add('is-complete');
  } else if (otherPicks.length >= MAX_PICKS) {
    otherHintEl.textContent = 'AWAITING THEIR READY…';
    otherHintEl.classList.remove('is-complete');
  } else {
    otherHintEl.textContent = `STILL CHOOSING — ${otherPicks.length}/${MAX_PICKS} PICKED`;
    otherHintEl.classList.remove('is-complete');
  }
};

// ── RENDER: FULL PASS ──
const render = () => {
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const otherSide = isHost ? 'ally' : 'host';
  const myPicks = siege[`${mySide}_units`] || [];
  const otherPicks = siege[`${otherSide}_units`] || [];

  renderHeader();
  renderSlots(selfSlotsEl, myPicks, true);
  renderSlots(otherSlotsEl, otherPicks, false);
  renderPool(selfPoolEl, availableUnits(mySelf.profile?.unlocked_units), myPicks, true);
  renderPool(otherPoolEl, availableUnits(myOther.profile?.unlocked_units), otherPicks, false);
  renderReadyControls();
};

// ── ACTIONS ──
// All mutations go through Supabase; the realtime echo re-renders both
// sides. We keep the optimistic local update so the user gets snappy
// feedback even before the round-trip completes.
const updateSiege = async (patch) => {
  const mySide = isHost ? 'host_id' : 'ally_id';
  const { data, error } = await supabase
    .from('sieges')
    .update(patch)
    .eq('id', siege.id)
    .eq(mySide, user.id)  // RLS belt; the policy already gates this.
    .select()
    .maybeSingle();
  if (error) {
    console.error('siege update failed', error);
    showAlert(`✗ UPDATE FAILED: ${(error.message || '').toUpperCase()}`, 'error');
    return null;
  }
  if (data) {
    applySiegeUpdate(data);
  }
  return data;
};

const addPick = (unitId) => {
  if (!siege) return;
  const mySide = isHost ? 'host_units' : 'ally_units';
  const picks = [...(siege[mySide] || [])];
  if (picks.includes(unitId)) return;        // distinct rule
  if (picks.length >= MAX_PICKS) return;
  if (!UNITS_BY_ID.has(unitId)) return;
  // If user adds a unit while already ready, knock them back to not-ready
  // so they can't sneak a swap past the opponent.
  const readyKey = isHost ? 'host_ready' : 'ally_ready';
  picks.push(unitId);
  const patch = { [mySide]: picks };
  if (siege[readyKey]) patch[readyKey] = false;
  // Optimistic local apply so the click feels instant.
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const removePick = (idx) => {
  if (!siege) return;
  const mySide = isHost ? 'host_units' : 'ally_units';
  const picks = [...(siege[mySide] || [])];
  if (idx < 0 || idx >= picks.length) return;
  picks.splice(idx, 1);
  const readyKey = isHost ? 'host_ready' : 'ally_ready';
  const patch = { [mySide]: picks };
  if (siege[readyKey]) patch[readyKey] = false;
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const toggleReady = async () => {
  if (!siege) return;
  const mySide = isHost ? 'host' : 'ally';
  const picks = siege[`${mySide}_units`] || [];
  if (picks.length < MAX_PICKS) return;
  const readyKey = `${mySide}_ready`;
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

  // Either party can delete during setup (per the updated DELETE policy in
  // 002_siege_setup.sql). The realtime DELETE event will navigate both
  // clients back to the lobby — but if the delete failed for the ally
  // because the policy isn't updated yet, we fall back to clearing our
  // own ally_id which lets the host see we left.
  const { error } = await supabase
    .from('sieges')
    .delete()
    .eq('id', siege.id);

  if (error) {
    console.error('disband failed', error);
    if (!isHost) {
      // RLS likely blocked the ally from deleting — fall back to UPDATE
      // so the host at least sees the abandonment.
      await supabase
        .from('sieges')
        .update({ ally_id: null, ally_username: null, ally_units: [], ally_ready: false, started_at: null })
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

  // Both sides ready → both clients race to game.html. Use a small banner
  // so the transition isn't jarring.
  const bothReady = !!siege.host_ready && !!siege.ally_ready;
  if (bothReady && !navigated) {
    navigated = true;
    bothReadyBanner.classList.remove('hidden');
    bothReadyBanner.setAttribute('aria-hidden', 'false');
    sessionStorage.setItem('gameSiegeId', siege.id);
    setTimeout(() => smoothNavigate('/game/game.html'), 1100);
    return;
  }

  // If the host cleared started_at (e.g. some other client bailed in a
  // way that doesn't delete), bounce back to the lobby.
  if (prev?.started_at && !siege.started_at) {
    showAlert('↶ THE SIEGE WAS ABANDONED', 'error');
    returnToLobby();
  }
};

// ── INIT ──
const handoffId = sessionStorage.getItem('setupSiegeId');
sessionStorage.removeItem('setupSiegeId');

// Right after the SQL migration, PostgREST's schema cache can briefly lag
// behind. A single retry on a null load papers over that one race without
// turning a real "no siege" into a spinner.
siege = await loadSiege(handoffId);
if (!siege && handoffId) {
  await new Promise(r => setTimeout(r, 400));
  siege = await loadSiege(handoffId);
}

const bounce = (reason, alertMsg) => {
  console.error('[siege-setup] bouncing to lobby:', reason, {
    handoffId, userId: user?.id, siege,
  });
  showAlert(alertMsg, 'error');
  setTimeout(returnToLobby, 1200);
};

if (!siege) {
  bounce('siege row not found', `⊘ SIEGE NOT FOUND${handoffId ? '' : ' (NO HANDOFF ID)'} — RETURNING TO WAR ROOM`);
} else if (siege.host_id !== user.id && siege.ally_id !== user.id) {
  bounce('user is neither host nor ally', '⊘ THOU ART NOT IN THIS SIEGE — RETURNING TO WAR ROOM');
} else if (!siege.started_at) {
  bounce('siege.started_at is null', '⊘ SIEGE NOT YET STARTED — RETURNING TO WAR ROOM');
} else {
  isHost = siege.host_id === user.id;
  const myUid    = user.id;
  const otherUid = isHost ? siege.ally_id : siege.host_id;
  const [meProfile, themProfile] = await Promise.all([
    loadProfile(myUid),
    otherUid ? loadProfile(otherUid) : Promise.resolve(null),
  ]);
  mySelf  = { profile: meProfile,   userId: myUid,    username: meProfile?.username || (isHost ? siege.host_username : siege.ally_username) || 'KNIGHT' };
  myOther = { profile: themProfile, userId: otherUid, username: themProfile?.username || (isHost ? siege.ally_username : siege.host_username) || 'KNIGHT' };

  render();

  // ── REALTIME ──
  // Listen for opponent picks/ready as well as DELETE (disband) and any
  // UPDATE that strips started_at.
  supabase
    .channel(`siege-setup-${siege.id}`)
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
