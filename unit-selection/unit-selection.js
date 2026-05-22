/* ═════════════════════════════════════════════════════
   UNIT TYPE SELECTION — both players pick up to 6 units
   ═════════════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── UNIT CATALOG (mirrored from roster.js) ──
const UNITS = [
  { id: 'Soldier',             cost: 0,   starter: true, hp: 100, damage: 15, speed: 5, attack: 'Attack01',
    desc: 'A loyal recruit, honed by drills and stale gruel.' },
  { id: 'Archer',              cost: 0,   starter: true, hp: 75,  damage: 18, speed: 6, attack: 'Attack01',
    desc: 'Strikes from afar — never seen, always feared.' },
  { id: 'Slime',               cost: 0,   starter: true, hp: 50,  damage: 8,  speed: 3, attack: 'Attack01',
    desc: 'Squishy. Loyal. Mildly corrosive on the carpet.' },
  { id: 'Swordsman',           cost: 50,  hp: 110, damage: 20, speed: 5, attack: 'Attack01' },
  { id: 'Orc',                 cost: 50,  hp: 130, damage: 22, speed: 4, attack: 'Attack01' },
  { id: 'Skeleton',            cost: 50,  hp: 80,  damage: 14, speed: 5, attack: 'Attack01' },
  { id: 'Skeleton Archer',     cost: 100, hp: 70,  damage: 20, speed: 6, attack: 'Attack' },
  { id: 'Armored Axeman',      cost: 100, hp: 140, damage: 25, speed: 4, attack: 'Attack01' },
  { id: 'Knight',              cost: 100, hp: 150, damage: 22, speed: 5, attack: 'Attack01' },
  { id: 'Lancer',              cost: 100, hp: 120, damage: 26, speed: 6, attack: 'Attack01' },
  { id: 'Priest',              cost: 100, hp: 80,  damage: 12, speed: 4, attack: 'Attack' },
  { id: 'Wizard',              cost: 150, hp: 70,  damage: 32, speed: 4, attack: 'Attack01' },
  { id: 'Armored Skeleton',    cost: 200, hp: 130, damage: 20, speed: 4, attack: 'Attack01' },
  { id: 'Greatsword Skeleton', cost: 200, hp: 140, damage: 30, speed: 3, attack: 'Attack01' },
  { id: 'Armored Orc',         cost: 200, hp: 180, damage: 28, speed: 3, attack: 'Attack01' },
  { id: 'Knight Templar',      cost: 250, hp: 170, damage: 28, speed: 5, attack: 'Attack01' },
  { id: 'Elite Orc',           cost: 300, hp: 200, damage: 32, speed: 4, attack: 'Attack01' },
  { id: 'Orc rider',           cost: 350, hp: 180, damage: 30, speed: 8, attack: 'Attack01' },
  { id: 'Werebear',            cost: 400, hp: 240, damage: 36, speed: 5, attack: 'Attack01' },
  { id: 'Werewolf',            cost: 400, hp: 200, damage: 38, speed: 8, attack: 'Attack01' },
];

const MAX_SELECTION = 6;

const DIFFICULTY_INFO = {
  recruit: {
    label: 'RECRUIT', cls: 'us-diff-recruit',
    desc: 'A gentle introduction to siege warfare.',
    stats: [
      { label: 'Enemy Health',  val: 'Normal',  cls: 'neutral' },
      { label: 'Enemy Damage',  val: 'Normal',  cls: 'neutral' },
      { label: 'Starting Gold', val: '300',     cls: 'neutral' },
      { label: 'Max Unit Types',val: '6',       cls: 'neutral' },
    ],
  },
  veteran: {
    label: 'VETERAN', cls: 'us-diff-medium',
    desc: 'Hardened defenders await your forces.',
    stats: [
      { label: 'Enemy Health',  val: '+30%',    cls: '' },
      { label: 'Enemy Damage',  val: '+20%',    cls: '' },
      { label: 'Starting Gold', val: '250',     cls: 'neutral' },
      { label: 'Max Unit Types',val: '6',       cls: 'neutral' },
    ],
  },
  hard: {
    label: 'HARD', cls: 'us-diff-hard',
    desc: 'A winding path through dense woods. Enemy towers defend the fortress core.',
    stats: [
      { label: 'Enemy Health',  val: '+60%',    cls: '' },
      { label: 'Enemy Damage',  val: '+45%',    cls: '' },
      { label: 'Starting Gold', val: '200',     cls: 'neutral' },
      { label: 'Max Unit Types',val: '6',       cls: 'neutral' },
    ],
  },
};

const MAP_DESCS = {
  'CALISTA HIGHLANDS': 'Rolling highlands split by a deep ravine. Towers occupy the high ground.',
  'FOREST PASS': 'A winding path through dense woods. Enemy towers defend the fortress core.',
};

// ── DOM REFS ──
const roomCodeEl    = document.getElementById('roomCode');
const roomNameEl    = document.getElementById('roomName');
const readyStatusEl = document.getElementById('readyStatus');
const playersCountEl = document.getElementById('playersCount');
const p1NameEl      = document.getElementById('p1Name');
const p1ReadyEl     = document.getElementById('p1Ready');
const p1CountEl     = document.getElementById('p1Count');
const p1SelectedEl  = document.getElementById('p1Selected');
const p1AvailableEl = document.getElementById('p1Available');
const p2NameEl      = document.getElementById('p2Name');
const p2ReadyEl     = document.getElementById('p2Ready');
const p2CountEl     = document.getElementById('p2Count');
const p2SelectedEl  = document.getElementById('p2Selected');
const p2AvailableEl = document.getElementById('p2Available');
const mapPreviewImg = document.getElementById('mapPreviewImg');
const mapInfoName   = document.getElementById('mapInfoName');
const mapInfoDesc   = document.getElementById('mapInfoDesc');
const diffLabel     = document.getElementById('diffLabel');
const diffStats     = document.getElementById('diffStats');
const teamPreview   = document.getElementById('teamPreview');
const backBtn       = document.getElementById('backToLobbyBtn');
const confirmBtn    = document.getElementById('confirmBtn');

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

// ── STATE ──
// All selection / ready state lives on the `sieges` row in Supabase. We
// mirror it locally to avoid an extra fetch on every render but the row
// is the source of truth — every mutation goes through `updateSiege` and
// the realtime channel reconciles back here. `host_units` / `ally_units`
// are arrays of unit IDs; `host_ready` / `ally_ready` are booleans.
let currentProfile = null;
let unlockedSet    = new Set();
let siege          = null;
let isHost         = false;
let navigated      = false; // guard so the both-ready handler doesn't fire twice

// Derived views — keep these as getters so they always read from `siege`.
const mySelection    = () => (isHost ? siege?.host_units : siege?.ally_units) || [];
const otherSelection = () => (isHost ? siege?.ally_units : siege?.host_units) || [];
const myReady        = () => !!(isHost ? siege?.host_ready : siege?.ally_ready);
const otherReady     = () => !!(isHost ? siege?.ally_ready : siege?.host_ready);

// ── HELPERS ──
const isUnlocked = (unit) => unit.starter || unlockedSet.has(unit.id);

const smoothNavigate = (url) => {
  if ('startViewTransition' in document) {
    setTimeout(() => { window.location.href = url; }, 200);
    return;
  }
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};

const lockSvg = `<svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
  <rect x="3" y="1" width="4" height="1" fill="currentColor"/>
  <rect x="2" y="2" width="1" height="2" fill="currentColor"/>
  <rect x="7" y="2" width="1" height="2" fill="currentColor"/>
  <rect x="1" y="4" width="8" height="5" fill="currentColor"/>
  <rect x="4" y="5" width="2" height="3" fill="#2a2218"/>
</svg>`;

// ── LOAD ──
const loadProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, points, unlocked_units')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
  currentProfile = data || { username: 'KNIGHT', points: 0, unlocked_units: [] };
  unlockedSet = new Set(currentProfile.unlocked_units ?? []);
};

const loadSiege = async (siegeId) => {
  // Look up by id (handoff from lobby) or by the current user's active
  // engagement with non-null started_at (direct-reload fallback).
  let q = supabase.from('sieges').select('*');
  q = siegeId
    ? q.eq('id', siegeId)
    : q.or(`host_id.eq.${user.id},ally_id.eq.${user.id}`).not('started_at', 'is', null);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error('siege load failed', error); return null; }
  return data || null;
};

// ── RENDER MAP / DIFFICULTY INFO ──
const renderMapInfo = () => {
  if (!siege) return;
  mapPreviewImg.src = siege.map_src || '';
  mapInfoName.textContent = siege.map || '—';
  mapInfoDesc.textContent = MAP_DESCS[siege.map] || siege.map || '';

  const diff = siege.difficulty || 'recruit';
  const info = DIFFICULTY_INFO[diff] || DIFFICULTY_INFO.recruit;
  diffLabel.textContent  = info.label;
  diffLabel.className    = info.cls;

  diffStats.innerHTML = info.stats.map(s =>
    `<li>${s.label}<span class="us-diff-stat-val ${s.cls || ''}">${s.val}</span></li>`
  ).join('');
};

// ── RENDER PLAYER INFO ──
// P1 (left, blue) is ALWAYS the logged-in user — they own the interactive
// panel. P2 (right, red) is the other player in the siege, regardless of
// whether the user joined as host or ally.
const renderPlayerInfo = () => {
  const myName = (currentProfile?.username || 'KNIGHT').toUpperCase();
  const isAlly = siege?.ally_id === user.id;
  const otherName = (isAlly ? siege?.host_username : siege?.ally_username) || 'AWAITING ALLY';

  p1NameEl.textContent = myName;
  p2NameEl.textContent = String(otherName).toUpperCase();

  const shortId = siege?.id ? siege.id.slice(0, 6).toUpperCase() : '——';
  roomCodeEl.textContent = shortId;
  roomNameEl.textContent = siege?.name || '——';
};

// ── COLOUR BLOCK (placeholder for sprites) ──
// Each unit gets a deterministic hue based on its index in UNITS.
const UNIT_COLOURS = [
  '#4a7fc1','#7abd5c','#c17a4a','#9b59b6','#e67e22',
  '#1abc9c','#e74c3c','#3498db','#f1c40f','#2ecc71',
  '#e91e63','#00bcd4','#ff5722','#8bc34a','#673ab7',
  '#ff9800','#009688','#795548','#607d8b','#f44336',
];
const unitColour = (id) => {
  const idx = UNITS.findIndex(u => u.id === id);
  return UNIT_COLOURS[idx % UNIT_COLOURS.length] ?? '#888';
};

const buildColourBlock = (id) => {
  const block = document.createElement('div');
  block.className = 'us-card-colour';
  block.style.background = unitColour(id);
  return block;
};

// ── RENDER GRIDS ──
const buildUnitCard = (unit, interactive) => {
  const card = document.createElement('div');
  const unlocked = isUnlocked(unit);

  card.className = `us-unit-card${!unlocked ? ' is-locked-card' : ''}`;
  card.dataset.unitId = unit.id;

  card.appendChild(buildColourBlock(unit.id));

  const name = document.createElement('div');
  name.className = 'us-card-name';
  name.textContent = unit.id.toUpperCase();
  card.appendChild(name);

  if (!unlocked) {
    const badge = document.createElement('div');
    badge.className = 'us-lock-badge';
    badge.innerHTML = `${lockSvg} ${unit.cost}`;
    card.appendChild(badge);
  }

  if (interactive && unlocked) {
    card.addEventListener('click', () => addPick(unit.id));
  }

  return card;
};

const buildSelectedCard = (unitId, interactive) => {
  const card = document.createElement('div');
  card.className = 'us-unit-card is-selected-card';
  card.dataset.unitId = unitId;

  card.appendChild(buildColourBlock(unitId));

  const name = document.createElement('div');
  name.className = 'us-card-name';
  name.textContent = unitId.toUpperCase();
  card.appendChild(name);

  if (interactive) {
    const removeBtn = document.createElement('div');
    removeBtn.className = 'us-card-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePick(unitId);
    });
    card.appendChild(removeBtn);
  }

  return card;
};

const buildAddSlot = () => {
  const slot = document.createElement('div');
  slot.className = 'us-unit-card us-add-slot';
  const icon = document.createElement('div');
  icon.className = 'us-add-icon';
  icon.textContent = '+';
  slot.appendChild(icon);
  return slot;
};

const renderPlayerGrid = (picks, selectedEl, availableEl, interactive, countEl) => {
  selectedEl.innerHTML = '';
  availableEl.innerHTML = '';

  picks.forEach(id => {
    selectedEl.appendChild(buildSelectedCard(id, interactive));
  });
  const emptySlots = MAX_SELECTION - picks.length;
  for (let i = 0; i < emptySlots; i++) {
    selectedEl.appendChild(buildAddSlot());
  }

  countEl.textContent = `${picks.length} / ${MAX_SELECTION}`;

  const available = UNITS.filter(u => !picks.includes(u.id));
  available.forEach(unit => {
    availableEl.appendChild(buildUnitCard(unit, interactive));
  });
};

const renderGrids = () => {
  const mine  = mySelection();
  const other = otherSelection();
  // P1 (me) is interactive only while I haven't confirmed yet.
  // P2 (other) is never interactive on my client.
  const meInteractive = !myReady();
  renderPlayerGrid(mine,  p1SelectedEl, p1AvailableEl, meInteractive, p1CountEl);
  renderPlayerGrid(other, p2SelectedEl, p2AvailableEl, false,         p2CountEl);
  // Visually lock the P1 panel once I've readied up (mirrors P2's look).
  p1SelectedEl.closest('.us-player-panel')?.classList.toggle('is-locked', myReady());
};

// ── TEAM PREVIEW ──
const renderTeamPreview = () => {
  teamPreview.innerHTML = '';

  const allSelected = [
    ...mySelection().map(id => ({ id, player: 1 })),
    ...otherSelection().map(id => ({ id, player: 2 })),
  ];

  allSelected.forEach(({ id, player }) => {
    const wrap = document.createElement('div');
    wrap.className = `us-team-unit is-p${player}`;
    wrap.style.background = unitColour(id);
    teamPreview.appendChild(wrap);
  });

  if (allSelected.length === 0) {
    const q = document.createElement('div');
    q.className = 'us-team-unit is-unknown';
    q.textContent = '?';
    teamPreview.appendChild(q);
  }
};

// ── READY STATE ──
const updateReadyState = () => {
  const me  = myReady();
  const them = otherReady();

  p1ReadyEl.textContent = me ? 'Ready' : 'Not Ready';
  p1ReadyEl.className   = `us-player-ready ${me ? 'is-ready' : 'not-ready'}`;

  p2ReadyEl.textContent = them ? 'Ready' : 'Not Ready';
  p2ReadyEl.className   = `us-player-ready ${them ? 'is-ready' : 'not-ready'}`;

  const readyCount = (me ? 1 : 0) + (them ? 1 : 0);
  playersCountEl.textContent = `READY ${readyCount}/2`;

  const p1Name = p1NameEl.textContent || 'PLAYER 1';
  const p2Name = p2NameEl.textContent || 'PLAYER 2';
  if (me && them) {
    readyStatusEl.textContent = 'BOTH PLAYERS READY! PREPARING BATTLE…';
    readyStatusEl.className = 'us-ready-status is-all-ready';
  } else if (me && !them) {
    readyStatusEl.textContent = `${p1Name} READY — WAITING FOR ${p2Name}…`;
    readyStatusEl.className = 'us-ready-status is-one-ready';
  } else if (!me && them) {
    readyStatusEl.textContent = `${p2Name} READY — WAITING FOR ${p1Name}…`;
    readyStatusEl.className = 'us-ready-status is-one-ready';
  } else {
    readyStatusEl.textContent = 'SELECT YOUR UNITS AND CONFIRM WHEN READY.';
    readyStatusEl.className = 'us-ready-status';
  }

  // Enable confirm only while I have at least one pick AND I haven't
  // readied up yet. The realtime UPDATE will disable it after the round
  // trip lands.
  confirmBtn.disabled = mySelection().length === 0 || me;
};

const renderAll = () => {
  renderGrids();
  renderTeamPreview();
  updateReadyState();
};

// ── ACTIONS ──
// All mutations write to Supabase; the realtime echo re-renders both
// sides. Optimistic local apply keeps clicks feeling instant.
const updateSiege = async (patch) => {
  if (!siege) return null;
  const myIdCol = isHost ? 'host_id' : 'ally_id';
  const { data, error } = await supabase
    .from('sieges')
    .update(patch)
    .eq('id', siege.id)
    .eq(myIdCol, user.id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('siege update failed', error);
    return null;
  }
  if (data) applySiegeUpdate(data);
  return data;
};

const addPick = (unitId) => {
  if (!siege || myReady()) return;
  const picks = [...mySelection()];
  if (picks.includes(unitId)) return;
  if (picks.length >= MAX_SELECTION) return;
  picks.push(unitId);
  const patch = { [isHost ? 'host_units' : 'ally_units']: picks };
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

const removePick = (unitId) => {
  if (!siege || myReady()) return;
  const picks = mySelection().filter(id => id !== unitId);
  const patch = { [isHost ? 'host_units' : 'ally_units']: picks };
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
};

// ── NAVIGATION ──
backBtn.addEventListener('click', () => {
  sessionStorage.setItem('skipDoorAnimation', '1');
  smoothNavigate('/lobby/lobby.html');
});

confirmBtn.addEventListener('click', () => {
  if (confirmBtn.disabled || !siege || myReady()) return;
  const readyKey = isHost ? 'host_ready' : 'ally_ready';
  const patch = { [readyKey]: true };
  applySiegeUpdate({ ...siege, ...patch });
  updateSiege(patch);
  sessionStorage.setItem('selectedUnits', JSON.stringify(mySelection()));
});

// ── REALTIME RECONCILIATION ──
const applySiegeUpdate = (fresh) => {
  if (!fresh || (siege && fresh.id !== siege.id)) return;
  siege = fresh;
  renderPlayerInfo();
  renderAll();

  // Both sides ready → both clients race to the game page.
  if (siege.host_ready && siege.ally_ready && !navigated) {
    navigated = true;
    setTimeout(() => smoothNavigate('/game/game.html'), 800);
  }
};

// ── INIT ──
const handoffId = sessionStorage.getItem('setupSiegeId');
sessionStorage.removeItem('setupSiegeId');

await loadProfile();
siege = await loadSiege(handoffId);
// Brief retry to paper over PostgREST schema-cache lag right after a row
// is created or started_at is flipped.
if (!siege && handoffId) {
  await new Promise(r => setTimeout(r, 400));
  siege = await loadSiege(handoffId);
}

const bounceToLobby = (reason) => {
  console.error('[unit-selection] returning to lobby:', reason);
  smoothNavigate('/lobby/lobby.html');
};

if (!siege) {
  bounceToLobby('siege not found');
} else if (siege.host_id !== user.id && siege.ally_id !== user.id) {
  bounceToLobby('user is neither host nor ally');
} else {
  isHost = siege.host_id === user.id;
  renderPlayerInfo();
  renderMapInfo();
  renderAll();

  // Subscribe to UPDATE/DELETE on this siege so opponent picks, ready
  // toggles, and disbands reach this client live.
  supabase
    .channel(`unit-selection-${siege.id}`)
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
        (payload) => applySiegeUpdate(payload.new))
    .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sieges', filter: `id=eq.${siege.id}` },
        () => {
          if (navigated) return;
          navigated = true;
          bounceToLobby('siege deleted');
        })
    .subscribe();
}
