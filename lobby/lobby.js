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
const playerName = document.getElementById('playerName');
const playerUnits = document.getElementById('playerUnits');
const playerTowers = document.getElementById('playerTowers');
const occupancyText = document.getElementById('occupancyText');
const joinBtn = document.getElementById('joinBtn');
const alertEl = document.getElementById('alertBanner');
const treasuryAmount = document.getElementById('treasuryAmount');
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
  const totalUnits = 3 + (currentProfile.unlocked_units?.length ?? 0);
  playerName.textContent = (currentProfile.username || 'KNIGHT').toUpperCase();
  playerUnits.textContent = totalUnits;
  playerTowers.textContent = '0';
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
    const occupancy = 1; // host counts as 1; ally-join TBD
    const card = document.createElement('div');
    card.className = `room-card${selectedSiege?.id === siege.id ? ' is-selected' : ''}`;
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
const renderPreview = () => {
  if (!selectedSiege) {
    // No siege selected → keep map dimmed and disable join.
    mapImage.style.opacity = '0.25';
    mapName.textContent = '—';
    roomDifficulty.className = 'diff-badge diff-recruit';
    roomDifficulty.textContent = '—';
    occupancyText.textContent = '— / 2 KNIGHTS';
    joinBtn.disabled = true;
    joinBtn.textContent = '⚔ JOIN SIEGE ⚔';
    setAllyEmpty();
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

  occupancyText.textContent = '1 / 2 KNIGHTS';

  // The siege host fills the "ally" slot for everyone else; for your own
  // siege we show YOU as host on the left and the ally slot stays empty.
  const isYourSiege = s.host_id === user.id;
  if (isYourSiege) {
    setAllyEmpty();
    joinBtn.disabled = true;
    joinBtn.textContent = '✦ AWAITING ALLY ✦';
  } else {
    setAllyHost(s.host_username);
    joinBtn.disabled = false;
    joinBtn.textContent = '⚔ JOIN SIEGE ⚔';
  }
};

const setAllyEmpty = () => {
  allySlot.classList.add('player-slot-empty');
  allySlot.innerHTML = `
    <div class="player-icon"><div class="player-avatar player-avatar-empty">?</div></div>
    <div class="player-meta">
      <div class="player-name muted">AWAITING ALLY…</div>
      <div class="player-stats muted">
        <div class="player-stat"><span class="player-stat-label">UNITS</span><span class="player-stat-val">—</span></div>
        <div class="player-stat"><span class="player-stat-label">TOWERS FELLED</span><span class="player-stat-val">—</span></div>
      </div>
    </div>
    <div class="player-status player-status-waiting">WAITING</div>
  `;
};

const setAllyHost = (hostName) => {
  allySlot.classList.remove('player-slot-empty');
  allySlot.innerHTML = `
    <div class="player-icon">
      <div class="player-avatar player-avatar-self" style="background-image:url('/assets/Soldier/Soldier/Soldier-Idle.png');"></div>
    </div>
    <div class="player-meta">
      <div class="player-name">${escapeHtml(hostName)}</div>
      <div class="player-stats">
        <div class="player-stat"><span class="player-stat-label">UNITS</span><span class="player-stat-val">?</span></div>
        <div class="player-stat"><span class="player-stat-label">TOWERS FELLED</span><span class="player-stat-val">?</span></div>
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
joinBtn.addEventListener('click', () => {
  if (!selectedSiege || joinBtn.disabled) return;
  showAlert(`⚔ MARCHING ON ${selectedSiege.name}…`, 'success');
  setTimeout(() => smoothNavigate('/game/game.html'), 900);
});

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

await loadSieges();

if (handoffId) {
  sessionStorage.removeItem('lobbySelectedId');
  selectedSiege = sieges.find(s => s.id === handoffId) || null;
}
if (!selectedSiege) {
  selectedSiege = sieges.find(s => s.difficulty === currentDiff) || null;
}

renderRoomList();
renderPreview();
loadProfile();
