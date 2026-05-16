/* ═══════════════════════════════════════════════
   WAR ROOM (LOBBY) — list user-created sieges
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── DOM REFS ──
const backBtn = document.getElementById('backBtn');
const createSiegeBtn = document.getElementById('createSiegeBtn');
const roomListEl = document.getElementById('roomList');
const tabs = document.querySelectorAll('.difficulty-tab');
const mapImage = document.getElementById('mapImage');
const mapName = document.getElementById('mapName');
const roomDifficulty = document.getElementById('roomDifficulty');
const occupancyText = document.getElementById('occupancyText');
const joinBtn = document.getElementById('joinBtn');
const disbandBtn = document.getElementById('disbandBtn');
const leaveBtn = document.getElementById('leaveBtn');
const startBtn = document.getElementById('startBtn');
const disbandOverlay = document.getElementById('disbandOverlay');
const disbandTargetName = document.getElementById('disbandTargetName');
const disbandCancelBtn = document.getElementById('disbandCancelBtn');
const disbandConfirmBtn = document.getElementById('disbandConfirmBtn');
const disbandConfirmText = document.getElementById('disbandConfirmText');
const disbandConfirmLoading = document.getElementById('disbandConfirmLoading');
const alertEl = document.getElementById('alertBanner');
const treasuryAmount = document.getElementById('treasuryAmount');
const selfSlot = document.getElementById('playerSlotSelf');
const allySlot = document.getElementById('playerSlotAlly');

// ── STATE ──
let currentDiff = 'recruit';
let selectedSiege = null;
let currentProfile = null;
let sieges = [];

// ── HELPERS ──
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

const returnToStartScreen = () => {
  sessionStorage.setItem('skipDoorAnimation', '1');
  smoothNavigate('/start-screen/start-screen.html');
};

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

const loadProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, points, unlocked_units')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
  currentProfile = data || { username: 'KNIGHT', points: 0, unlocked_units: [] };
  treasuryAmount.textContent = (currentProfile.points ?? 0).toLocaleString();
};

// ── SIEGES FETCH ──
// Direct SELECT from public.sieges, ordered newest-first by Postgres so we
// don't have to re-sort on the client. RLS policy `sieges_select_all` lets
// any signed-in user browse the whole list — every player sees the same
// shared lobby state.
const loadSieges = async () => {
  const { data, error } = await supabase
    .from('sieges')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('sieges load failed', error);
    sieges = [];
    return;
  }
  sieges = data || [];
};

// ── OTHER-PLAYER PROFILES ──
// Cache other players' (username, unlocked_units) keyed by user_id so the
// host/ally slots can show a real UNITS count instead of "?". Filled by a
// single batched fetch after loadSieges, with incremental refills when
// realtime brings in a new participant. Misses are stored as null so we
// don't re-query for accounts that legitimately have no profile row.
const profileCache = new Map();

const prefetchSiegeProfiles = async () => {
  const wanted = new Set();
  for (const s of sieges) {
    if (s.host_id && s.host_id !== user.id) wanted.add(s.host_id);
    if (s.ally_id && s.ally_id !== user.id) wanted.add(s.ally_id);
  }
  const missing = [...wanted].filter(id => !profileCache.has(id));
  if (!missing.length) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, unlocked_units')
    .in('user_id', missing);
  if (error) { console.error('profile prefetch failed', error); return false; }
  for (const row of data || []) profileCache.set(row.user_id, row);
  for (const id of missing) if (!profileCache.has(id)) profileCache.set(id, null);
  return true;
};

const unitCountFor = (userId) => {
  if (!userId) return null;
  if (userId === user.id) return 3 + (currentProfile?.unlocked_units?.length ?? 0);
  const p = profileCache.get(userId);
  if (!p) return null;
  return 3 + (p.unlocked_units?.length ?? 0);
};

// Returns the siege the current user is engaged with, host OR ally, or
// null. "One lobby at a time" gating reads from this — JOIN is disabled
// for bystanders who already have an active siege elsewhere.
const findOwnEngagement = () => sieges.find(
  s => s.host_id === user.id || s.ally_id === user.id
) || null;

// ── ROOM LIST ──
const renderRoomList = () => {
  const filtered = sieges.filter(s => s.difficulty === currentDiff);
  roomListEl.innerHTML = '';
  if (!filtered.length) {
    roomListEl.innerHTML = `
      <div class="room-list-empty">
        NO SIEGES<br/>AT THIS RANK<br/><br/>
        ✦ FORGE ONE ✦
      </div>
    `;
    return;
  }
  for (const siege of filtered) {
    const occupancy = siege.ally_id ? 2 : 1;
    const isFull = occupancy >= 2;
    const card = document.createElement('div');
    card.className =
      `room-card${selectedSiege?.id === siege.id ? ' is-selected' : ''}${isFull ? ' is-full' : ''}`;
    card.setAttribute('role', 'listitem');
    card.dataset.siegeId = siege.id;
    card.innerHTML = `
      <div>
        <div class="room-name">${escapeHtml(siege.name)}</div>
        <div class="room-meta">
          <span class="room-occupancy-chip">${occupancy}/2</span>
          <span>${escapeHtml(siege.map)}</span>
        </div>
      </div>
      <span class="diff-badge diff-${siege.difficulty}">${siege.difficulty.toUpperCase()}</span>
    `;
    card.addEventListener('click', () => selectSiege(siege));
    roomListEl.appendChild(card);
  }
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ── PREVIEW PANE ──
// Three viewer roles for any selected siege:
//   • HOST    — you forged it. You get DISBAND. START lights up once an ally
//               has joined.
//   • ALLY    — you joined someone else's siege. You get LEAVE. START stays
//               disabled because only the host fires the cannon.
//   • BYSTANDER — neither. You get JOIN, gated on (slot empty AND you have
//               no other engagement).
const renderPreview = () => {
  if (!selectedSiege) {
    mapImage.style.opacity = '0.25';
    mapName.textContent = '—';
    roomDifficulty.className = 'diff-badge diff-recruit';
    roomDifficulty.textContent = '—';
    occupancyText.textContent = '— / 2 KNIGHTS';
    joinBtn.disabled = true;
    joinBtn.textContent = '⚔ JOIN SIEGE ⚔';
    joinBtn.hidden = false;
    disbandBtn.hidden = true;
    leaveBtn.hidden = true;
    startBtn.hidden = true;
    renderSlot(selfSlot, { empty: true, label: 'SELECT A SIEGE…' });
    renderSlot(allySlot, { empty: true, label: 'SELECT A SIEGE…' });
    return;
  }

  const s = selectedSiege;
  mapImage.style.opacity = '0';
  setTimeout(() => {
    mapImage.src = s.map_src;
    mapImage.style.opacity = '1';
  }, 90);
  mapName.textContent = s.map;
  roomDifficulty.className = `diff-badge diff-${s.difficulty}`;
  roomDifficulty.textContent = s.difficulty.toUpperCase();

  const occupancy = s.ally_id ? 2 : 1;
  occupancyText.textContent = `${occupancy} / 2 KNIGHTS`;

  const isHost  = s.host_id === user.id;
  const isAlly  = s.ally_id === user.id;
  const slotFull = Boolean(s.ally_id);
  const ownEngagement = findOwnEngagement();
  const userBusyElsewhere = ownEngagement && ownEngagement.id !== s.id;

  // Reset all action buttons; specific branch below shows the right pair.
  joinBtn.hidden    = true;
  disbandBtn.hidden = true;
  leaveBtn.hidden   = true;
  startBtn.hidden   = false;

  // Slots are POSITIONAL: left = host, right = ally. Your own card just
  // happens to land in whichever slot matches your role; bystanders see
  // both occupants when the siege is full, neither slot filled with self.
  if (isHost) {
    renderSlot(selfSlot, { me: true });
    renderSlot(allySlot, slotFull ? { other: s.ally_username, userId: s.ally_id } : { empty: true, label: 'AWAITING ALLY…' });
    disbandBtn.hidden = false;
    disbandBtn.disabled = false;
  } else if (isAlly) {
    renderSlot(selfSlot, { other: s.host_username, userId: s.host_id });
    renderSlot(allySlot, { me: true });
    leaveBtn.hidden = false;
    leaveBtn.disabled = false;
  } else {
    renderSlot(selfSlot, { other: s.host_username, userId: s.host_id });
    renderSlot(allySlot, slotFull ? { other: s.ally_username, userId: s.ally_id } : { empty: true, label: 'AWAITING ALLY…' });
    joinBtn.hidden = false;
    if (slotFull) {
      joinBtn.disabled = true;
      joinBtn.textContent = '⊘ SIEGE FULL';
    } else if (userBusyElsewhere) {
      joinBtn.disabled = true;
      joinBtn.textContent = '⊘ ALREADY IN A SIEGE';
    } else {
      joinBtn.disabled = false;
      joinBtn.textContent = '⚔ JOIN SIEGE ⚔';
    }
  }

  // START SIEGE — only the host can actually fire it, and only once an
  // ally has joined. Joiners and bystanders see the button but it stays
  // disabled with a context-aware label.
  if (isHost) {
    startBtn.disabled = !slotFull;
    startBtn.textContent = slotFull ? '✦ START SIEGE ✦' : '✦ AWAITING ALLY ✦';
  } else if (isAlly) {
    startBtn.disabled = true;
    startBtn.textContent = '✦ AWAITING HOST ✦';
  } else {
    startBtn.disabled = true;
    startBtn.textContent = slotFull ? '✦ SIEGE IS FULL ✦' : '✦ AWAITING ALLY ✦';
  }
};

// Paint one of the two player-slot panels. `content` is one of:
//   { me: true }            — current user's profile card (knight sprite + stats)
//   { other: name }         — another player (soldier sprite + name); falls
//                             back to "???" if name is missing, so legacy
//                             rows without a denormalized username still draw
//   { empty: true, label }  — dashed-border placeholder with the given label
const renderSlot = (slotEl, content) => {
  if (content.empty) {
    slotEl.classList.add('player-slot-empty');
    slotEl.innerHTML = `
      <div class="player-icon"><div class="player-avatar player-avatar-empty">?</div></div>
      <div class="player-meta">
        <div class="player-name muted">${escapeHtml(content.label || 'AWAITING…')}</div>
        <div class="player-stats muted">
          <div class="player-stat"><span class="player-stat-label">UNITS</span><span class="player-stat-val">—</span></div>
          <div class="player-stat"><span class="player-stat-label">TOWERS FELLED</span><span class="player-stat-val">—</span></div>
        </div>
      </div>
      <div class="player-status player-status-waiting">WAITING</div>
    `;
    return;
  }
  slotEl.classList.remove('player-slot-empty');
  if (content.me) {
    const username = (currentProfile?.username || 'KNIGHT').toUpperCase();
    const totalUnits = 3 + (currentProfile?.unlocked_units?.length ?? 0);
    slotEl.innerHTML = `
      <div class="player-icon"><div class="player-avatar player-avatar-self"></div></div>
      <div class="player-meta">
        <div class="player-name">${escapeHtml(username)}</div>
        <div class="player-stats">
          <div class="player-stat"><span class="player-stat-label">UNITS</span><span class="player-stat-val">${totalUnits}</span></div>
          <div class="player-stat"><span class="player-stat-label">TOWERS FELLED</span><span class="player-stat-val">0</span></div>
        </div>
      </div>
      <div class="player-status player-status-ready">READY</div>
    `;
    return;
  }
  const name = String(content.other || '???').toUpperCase();
  const units = unitCountFor(content.userId);
  const unitsDisplay = units != null ? units : '?';
  slotEl.innerHTML = `
    <div class="player-icon">
      <div class="player-avatar player-avatar-self" style="background-image:url('/assets/Soldier/Soldier/Soldier-Idle.png');"></div>
    </div>
    <div class="player-meta">
      <div class="player-name">${escapeHtml(name)}</div>
      <div class="player-stats">
        <div class="player-stat"><span class="player-stat-label">UNITS</span><span class="player-stat-val">${unitsDisplay}</span></div>
        <div class="player-stat"><span class="player-stat-label">TOWERS FELLED</span><span class="player-stat-val">0</span></div>
      </div>
    </div>
    <div class="player-status player-status-ready">READY</div>
  `;
};

const selectSiege = (siege) => {
  selectedSiege = siege;
  renderRoomList();
  renderPreview();
};

// ── TABS ──
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('is-active')) return;
    tabs.forEach(t => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    currentDiff = tab.dataset.diff;
    // Auto-select first siege of the new difficulty (if any).
    selectedSiege = sieges.find(s => s.difficulty === currentDiff) || null;
    renderRoomList();
    renderPreview();
  });
});

// ── ACTIONS ──
// ── JOIN ──
// Claim the ally slot on a vacant siege. The `.is('ally_id', null)` filter
// makes the UPDATE race-safe — if two users click JOIN at the same instant,
// Postgres sees one of the writes hit a row where ally_id IS NULL and the
// other hit a row where ally_id is already set; only the first wins.
// The `sieges_one_ally_idx` unique index is the belt to this suspenders —
// it would also reject the second writer if they were trying to ally a
// different siege while already in one.
joinBtn.addEventListener('click', async () => {
  if (!selectedSiege || joinBtn.disabled) return;
  if (selectedSiege.host_id === user.id) return; // can't ally yourself
  if (findOwnEngagement()) {
    showAlert('⊘ ABANDON THY CURRENT SIEGE FIRST', 'error');
    return;
  }

  joinBtn.disabled = true;
  const { data, error } = await supabase
    .from('sieges')
    .update({
      ally_id:       user.id,
      ally_username: (currentProfile?.username || 'KNIGHT'),
    })
    .eq('id', selectedSiege.id)
    .is('ally_id', null)
    .select()
    .maybeSingle();

  if (error) {
    console.error('join failed', error);
    const raw = (error.message || '').toUpperCase();
    const hint = raw.includes('SIEGES_ONE_ALLY')
      ? ' — ALREADY IN A SIEGE'
      : raw.includes('ROW-LEVEL') ? ' — RLS DENIED' : '';
    showAlert(`✗ COULD NOT JOIN${hint}`, 'error');
    renderPreview();
    return;
  }
  if (!data) {
    showAlert('⊘ SOMEONE WAS QUICKER — THE SLOT IS TAKEN', 'error');
    renderPreview();
    return;
  }

  // Optimistic local update; the realtime echo will arrive shortly and
  // reconcile (idempotent overwrite).
  applySiegeUpdate(data);
  showAlert(`⚔ THOU HAST JOINED ${data.name}`, 'success');
});

// ── LEAVE ──
// Vacate your own ally slot. Filtered on `ally_id = user.id` so the
// statement is a no-op if the row already changed under us (e.g. host
// disbanded mid-click).
leaveBtn.addEventListener('click', async () => {
  if (!selectedSiege || leaveBtn.disabled) return;
  if (selectedSiege.ally_id !== user.id) return;

  leaveBtn.disabled = true;
  const { data, error } = await supabase
    .from('sieges')
    .update({ ally_id: null, ally_username: null })
    .eq('id', selectedSiege.id)
    .eq('ally_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('leave failed', error);
    showAlert(`✗ COULD NOT LEAVE: ${(error.message || '').toUpperCase()}`, 'error');
    renderPreview();
    return;
  }
  if (data) applySiegeUpdate(data);
  showAlert('↶ YE HAVE WITHDRAWN FROM THE SIEGE', 'success');
});

// Kicks the actual battle off once both sides are seated. Host-only.
// Joiners get auto-navigated by the realtime layer once `started_at` is
// added in a future migration; for now the host's click is what fires it.
startBtn.addEventListener('click', () => {
  if (!selectedSiege || startBtn.disabled) return;
  showAlert(`⚔ THE SIEGE OF ${selectedSiege.name} BEGINS…`, 'success');
  setTimeout(() => smoothNavigate('/game/game.html'), 900);
});

// Reconcile a single siege row into local state — used for optimistic
// updates after a JOIN/LEAVE and also from the realtime UPDATE handler.
const applySiegeUpdate = (fresh) => {
  const idx = sieges.findIndex(s => s.id === fresh.id);
  if (idx >= 0) sieges[idx] = fresh;
  else sieges = [fresh, ...sieges];
  if (selectedSiege?.id === fresh.id) selectedSiege = fresh;
  renderRoomList();
  renderPreview();
  // If realtime brought a participant we haven't fetched yet (e.g. some
  // stranger just joined a siege we're watching), warm the cache and
  // repaint so the slot's UNITS count flips from "?" to the real value.
  prefetchSiegeProfiles().then(changed => { if (changed) renderPreview(); });
};

// ── DISBAND CONFIRMATION MODAL ──
// Themed replacement for window.confirm — surfaces the consequences (ally
// gets kicked) and lets the user back out before issuing the DELETE.
let pendingDisband = null;

const openDisbandModal = (siege) => {
  pendingDisband = siege;
  disbandTargetName.textContent = `"${siege.name}"`;
  disbandOverlay.classList.remove('hidden');
  disbandOverlay.setAttribute('aria-hidden', 'false');
  disbandConfirmBtn.disabled = false;
  disbandConfirmText.style.display = 'inline';
  disbandConfirmLoading.style.display = 'none';
  // Focus the cancel button by default — fewer accidental deletes.
  setTimeout(() => disbandCancelBtn.focus(), 30);
};

const closeDisbandModal = () => {
  pendingDisband = null;
  disbandOverlay.classList.add('hidden');
  disbandOverlay.setAttribute('aria-hidden', 'true');
};

// Host-only: tear down the siege you forged. RLS enforces ownership so a
// non-host clicking this (e.g. via devtools) would just get a 0-row delete.
disbandBtn.addEventListener('click', () => {
  if (!selectedSiege || disbandBtn.disabled) return;
  if (selectedSiege.host_id !== user.id) return;
  openDisbandModal(selectedSiege);
});

disbandCancelBtn.addEventListener('click', closeDisbandModal);

// Clicking the backdrop or pressing Escape also cancels — standard modal UX.
disbandOverlay.addEventListener('click', (e) => {
  if (e.target === disbandOverlay) closeDisbandModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !disbandOverlay.classList.contains('hidden')) {
    e.stopImmediatePropagation(); // don't let the back-to-start handler fire
    closeDisbandModal();
  }
}, true);

disbandConfirmBtn.addEventListener('click', async () => {
  if (!pendingDisband) return;
  const doomed = pendingDisband;

  disbandConfirmBtn.disabled = true;
  disbandConfirmText.style.display = 'none';
  disbandConfirmLoading.style.display = 'inline';

  const { error } = await supabase
    .from('sieges')
    .delete()
    .eq('id', doomed.id);

  if (error) {
    console.error('siege disband failed', error);
    closeDisbandModal();
    showAlert(`✗ COULD NOT DISBAND: ${(error.message || '').toUpperCase()}`, 'error');
    return;
  }

  // Local reconciliation. The realtime channel will also fire DELETE for
  // every other connected viewer of this siege — that's the "kick them
  // out" path.
  removeSiegeLocally(doomed.id);
  closeDisbandModal();
  showAlert(`☠ ${doomed.name} HAS BEEN DISBANDED`, 'success');
});

// Shared cleanup for both local deletes and realtime DELETE pushes from
// other clients. If the user is currently viewing the doomed siege, they
// get bumped to the next siege in the active tab (or to "no selection").
const removeSiegeLocally = (siegeId) => {
  const wasSelected = selectedSiege?.id === siegeId;
  sieges = sieges.filter(s => s.id !== siegeId);
  if (wasSelected) {
    selectedSiege = sieges.find(s => s.difficulty === currentDiff) || null;
  }
  renderRoomList();
  renderPreview();
};

createSiegeBtn.addEventListener('click', () => {
  smoothNavigate('/lobby/create-siege.html');
});

backBtn.addEventListener('click', returnToStartScreen);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') returnToStartScreen();
});

// ── INIT ──
// If create-siege handed us a difficulty + new-siege id, switch to that
// tab and preselect that siege so the user lands on what they just made.
const handoffDiff = sessionStorage.getItem('lobbyInitialDiff');
const handoffId   = sessionStorage.getItem('lobbySelectedId');
if (handoffDiff) {
  sessionStorage.removeItem('lobbyInitialDiff');
  currentDiff = handoffDiff;
  tabs.forEach(t => {
    t.classList.toggle('is-active', t.dataset.diff === currentDiff);
    t.setAttribute('aria-selected', t.dataset.diff === currentDiff ? 'true' : 'false');
  });
}

await Promise.all([loadSieges(), loadProfile()]);
await prefetchSiegeProfiles();

if (handoffId) {
  sessionStorage.removeItem('lobbySelectedId');
  selectedSiege = sieges.find(s => s.id === handoffId) || null;
}
if (!selectedSiege) {
  selectedSiege = sieges.find(s => s.difficulty === currentDiff) || null;
}

renderRoomList();
renderPreview();

// ── REALTIME ──
// Supabase Realtime broadcasts INSERT/DELETE events on the sieges table so
// other lobbies update without a refresh. The "kick out when host disbands"
// behavior rides on this — if a viewer is staring at a siege the host just
// nuked, their renderPreview re-runs with selectedSiege cleared.
// Requires: `alter publication supabase_realtime add table public.sieges;`
// (see supabase-setup.sql).
supabase
  .channel('sieges-lobby')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sieges' }, (payload) => {
    const fresh = payload.new;
    if (!fresh || sieges.some(s => s.id === fresh.id)) return;
    sieges = [fresh, ...sieges];
    renderRoomList();
    // The new siege's host may not be in the profile cache yet — fetch so
    // their UNITS count appears the moment a viewer clicks the room.
    prefetchSiegeProfiles().then(changed => { if (changed) renderPreview(); });
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sieges' }, (payload) => {
    const fresh = payload.new;
    if (!fresh) return;

    // Detect ally transitions specifically so we can show a friendly
    // alert to the host when their lobby just filled / emptied.
    const prev = sieges.find(s => s.id === fresh.id);
    const allyArrived = prev && !prev.ally_id && fresh.ally_id;
    const allyDeparted = prev && prev.ally_id && !fresh.ally_id;

    applySiegeUpdate(fresh);

    if (fresh.host_id === user.id) {
      if (allyArrived) {
        showAlert(`⚔ ${fresh.ally_username} HATH JOINED THY SIEGE`, 'success');
      } else if (allyDeparted) {
        showAlert('↶ THINE ALLY HATH WITHDRAWN', 'error');
      }
    }
  })
  .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sieges' }, (payload) => {
    const goneId = payload.old?.id;
    if (!goneId) return;
    const wasSelected = selectedSiege?.id === goneId;
    removeSiegeLocally(goneId);
    if (wasSelected && selectedSiege?.id !== goneId) {
      // We were viewing the disbanded siege — let the user know why the
      // preview pane just changed under them.
      showAlert('☠ THE HOST HATH DISBANDED THIS SIEGE', 'error');
    }
  })
  .subscribe();
