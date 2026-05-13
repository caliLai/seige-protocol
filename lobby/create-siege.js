/* ═══════════════════════════════════════════════
   CREATE SIEGE — pick map + difficulty + name, insert
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── DOM REFS ──
const backBtn = document.getElementById('backBtn');
const mapOptionsEl = document.getElementById('mapOptions');
const diffOptionsEl = document.getElementById('diffOptions');
const siegeNameInput = document.getElementById('siegeNameInput');
const forgeBtn = document.getElementById('forgeBtn');
const forgeText = document.getElementById('forgeText');
const forgeLoading = document.getElementById('forgeLoading');
const errorEl = document.getElementById('createError');
const alertEl = document.getElementById('alertBanner');
const treasuryAmount = document.getElementById('treasuryAmount');

// ── STATE ──
let selectedMap = {
  name: 'CALISTA HIGHLANDS',
  src:  '/assets/maps/calista-map.png',
};
let selectedDifficulty = 'recruit';
let currentProfile = null;

// ── HELPERS ──
const showError = (msg) => {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
};
const clearError = () => {
  errorEl.style.display = 'none';
  errorEl.textContent = '';
};
const showAlert = (msg, type = 'info') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  alertEl.style.color = '#f0d9a0';
  alertEl.style.boxShadow = '3px 3px 0 #000';
  clearTimeout(alertEl._t);
  alertEl._t = setTimeout(() => { alertEl.style.display = 'none'; }, 2600);
};

const setLoading = (on) => {
  forgeBtn.disabled = on;
  forgeText.style.display = on ? 'none' : 'inline';
  forgeLoading.style.display = on ? 'inline' : 'none';
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

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

const loadProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, points')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
  currentProfile = data || { username: 'KNIGHT', points: 0 };
  treasuryAmount.textContent = (currentProfile.points ?? 0).toLocaleString();
};

// ── MAP SELECTION ──
mapOptionsEl.querySelectorAll('.map-option').forEach((opt) => {
  opt.addEventListener('click', () => {
    mapOptionsEl.querySelectorAll('.map-option').forEach(o => o.classList.toggle('is-selected', o === opt));
    selectedMap = {
      name: opt.dataset.mapName,
      src:  opt.dataset.mapSrc,
    };
  });
});

// ── DIFFICULTY SELECTION ──
diffOptionsEl.querySelectorAll('.diff-option').forEach((opt) => {
  opt.addEventListener('click', () => {
    diffOptionsEl.querySelectorAll('.diff-option').forEach(o => o.classList.toggle('is-selected', o === opt));
    selectedDifficulty = opt.dataset.diff;
  });
});

// ── FORGE ──
const defaultName = () => {
  const banner = (currentProfile?.username || 'KNIGHT').toUpperCase();
  // Quick flavor pool so auto-generated names aren't all identical.
  const flavors = ["KEEP", "BASTION", "STRONGHOLD", "BULWARK", "BANNER", "REDOUBT", "WATCH"];
  const flavor = flavors[Math.floor(Math.random() * flavors.length)];
  return `${banner}'S ${flavor}`;
};

forgeBtn.addEventListener('click', async () => {
  clearError();
  let name = siegeNameInput.value.trim();
  if (!name) name = defaultName();
  if (name.length < 3 || name.length > 40) {
    showError('✗ NAME MUST BE 3-40 CHARS');
    return;
  }

  setLoading(true);
  const { data, error } = await supabase
    .from('sieges')
    .insert({
      host_id:       user.id,
      host_username: currentProfile?.username || 'KNIGHT',
      name,
      map:           selectedMap.name,
      map_src:       selectedMap.src,
      difficulty:    selectedDifficulty,
    })
    .select('id, difficulty')
    .maybeSingle();

  if (error) {
    console.error('siege create failed', error);
    showError('✗ THE FORGE FAILED. TRY AGAIN.');
    setLoading(false);
    return;
  }

  showAlert('✓ SIEGE FORGED — TO THE WAR ROOM!', 'success');
  // Hand back to the lobby with our chosen difficulty + freshly created
  // siege selected, so the user sees their lobby immediately.
  sessionStorage.setItem('lobbyInitialDiff', data.difficulty);
  sessionStorage.setItem('lobbySelectedId', data.id);
  setTimeout(() => smoothNavigate('/lobby/lobby.html'), 700);
});

// ── BACK ──
backBtn.addEventListener('click', () => smoothNavigate('/lobby/lobby.html'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') smoothNavigate('/lobby/lobby.html');
});

// ── INIT ──
loadProfile();
