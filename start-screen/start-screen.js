/* ═══════════════════════════════════════════════
   START SCREEN — Supabase auth gate, menu nav, door loader
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── DOM REFS ──
const doorLoader = document.getElementById('doorLoader');
const userNameEl = document.getElementById('userName');
const alertEl = document.getElementById('alertBanner');
const usernamePrompt = document.getElementById('usernamePrompt');
const usernameForm = document.getElementById('usernameForm');
const usernameInput = document.getElementById('usernameInput');
const usernameError = document.getElementById('usernameError');
const usernameSubmit = document.getElementById('usernameSubmit');
const usernameSubmitText = document.getElementById('usernameSubmitText');
const usernameSubmitLoading = document.getElementById('usernameSubmitLoading');
const userNameBtn = document.getElementById('userNameBtn');
const treasuryAmount = document.getElementById('treasuryAmount');

// Tracks whether the current open prompt is a first-time claim (insert)
// or a rename (update). Set when the prompt is shown.
let usernameMode = 'create';
let currentUsername = null;

const DOOR_ANIMATION_MS = 2000;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
// Inline head script flags returns from in-app screens so we skip the doors.
const doorsSkipped = document.documentElement.classList.contains('no-door-animation');

// ── CASTLE DOOR LOADER ──
// Doors live in HTML and animate themselves open via CSS. Hide the loader
// element after the swing finishes so the menu becomes interactive. When
// returning from another screen the loader is already hidden via CSS — no
// timer needed.
if (!doorsSkipped) {
  setTimeout(() => { doorLoader.classList.add('gone'); }, DOOR_ANIMATION_MS);
}

// ── AUTH GATE + USERNAME ──
// Redirect to login if not signed in. Supabase auto-detects OAuth tokens
// in the URL on arrival (detectSessionInUrl) so Google login lands here
// fully authenticated.
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  window.location.href = '/login/login.html';
}

const setHailedAs = (name) => {
  userNameEl.textContent = (name || 'NAMELESS KNIGHT').toUpperCase();
};

const setTreasury = (points) => {
  treasuryAmount.textContent = (points ?? 0).toLocaleString();
};

// Look up the player's profile row. Returns it or null when no profile
// exists yet (new user).
const fetchProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, points')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('profile fetch failed', error);
  }
  return data;
};

const showUsernameError = (msg) => {
  usernameError.textContent = msg;
  usernameError.style.display = 'block';
};
const clearUsernameError = () => {
  usernameError.style.display = 'none';
  usernameError.textContent = '';
};

const setUsernameLoading = (on) => {
  usernameSubmit.disabled = on;
  usernameSubmitText.style.display = on ? 'none' : 'inline';
  usernameSubmitLoading.style.display = on ? 'inline' : 'none';
};

// Open the prompt. `delayMs` lets the initial show wait for the door
// animation; renames open immediately.
const openUsernamePrompt = ({ mode, delayMs = 0, prefill = '' }) => {
  usernameMode = mode;
  const reveal = () => {
    clearUsernameError();
    usernameInput.value = prefill;
    usernamePrompt.classList.remove('hidden');
    usernamePrompt.setAttribute('aria-hidden', 'false');
    usernameInput.focus();
    usernameInput.select();
  };
  if (delayMs > 0) setTimeout(reveal, delayMs);
  else reveal();
};

const closeUsernamePrompt = () => {
  usernamePrompt.classList.add('hidden');
  usernamePrompt.setAttribute('aria-hidden', 'true');
};

usernameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearUsernameError();

  const raw = usernameInput.value.trim();
  if (!USERNAME_RE.test(raw)) {
    showUsernameError('✗ 3-20 CHARS — LETTERS, NUMBERS, _ OR -');
    return;
  }
  if (usernameMode === 'rename' && raw === currentUsername) {
    closeUsernamePrompt();
    return;
  }

  setUsernameLoading(true);
  // First claim → insert (unique constraint enforces uniqueness atomically).
  // Rename     → update; if the new name is taken Postgres still returns
  //              the same unique-violation, which we surface identically.
  const { error } = usernameMode === 'rename'
    ? await supabase.from('profiles').update({ username: raw }).eq('user_id', user.id)
    : await supabase.from('profiles').insert({ user_id: user.id, username: raw });

  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (error.code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      showUsernameError('✗ THIS NAME IS ALREADY CLAIMED');
    } else {
      showUsernameError('✗ THE SCRIBES FAILED. TRY AGAIN.');
      console.error('username save failed', error);
    }
    setUsernameLoading(false);
    return;
  }

  currentUsername = raw;
  setHailedAs(raw);
  closeUsernamePrompt();
  setUsernameLoading(false);
});

// Esc closes a rename prompt; the initial create prompt has no name yet
// so we leave it open until they pick one.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (usernamePrompt.classList.contains('hidden')) return;
  if (usernameMode === 'rename') closeUsernamePrompt();
});

// Click the username (or its pencil) to rename.
userNameBtn.addEventListener('click', () => {
  if (!currentUsername) return;
  openUsernamePrompt({ mode: 'rename', prefill: currentUsername });
});

// Decide whether to prompt: existing user → show their name; new user → prompt.
const profile = await fetchProfile();
if (profile?.username) {
  currentUsername = profile.username;
  setHailedAs(profile.username);
  setTreasury(profile.points);
} else {
  setHailedAs('…');
  setTreasury(0);
  openUsernamePrompt({ mode: 'create', delayMs: doorsSkipped ? 200 : DOOR_ANIMATION_MS + 200 });
}

// Listen for sign-out from any tab.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = '/login/login.html';
});

// ── HELPERS ──
const showAlert = (msg, type = 'info') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  alertEl.style.color = '#f0d9a0';
  alertEl.style.boxShadow = '3px 3px 0 #000';
  setTimeout(() => { alertEl.style.display = 'none'; }, 2500);
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

// ── BUTTON SELECTION TRACKING ──
const menuButtons = Array.from(document.querySelectorAll('.menu-btn'));
const selectButton = (btn) => {
  menuButtons.forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
};
menuButtons.forEach(btn => {
  btn.addEventListener('mouseenter', () => selectButton(btn));
});

// Menu keyboard navigation is paused while the username prompt is open or
// while the user is typing in any input/textarea.
const menuKeysActive = () =>
  usernamePrompt.classList.contains('hidden') &&
  !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

// Arrow-key navigation between menu buttons.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (!menuKeysActive()) return;
  e.preventDefault();
  const current = menuButtons.findIndex(b => b.classList.contains('selected'));
  const start = current === -1 ? (e.key === 'ArrowDown' ? -1 : 0) : current;
  const next = e.key === 'ArrowDown'
    ? (start + 1) % menuButtons.length
    : (start - 1 + menuButtons.length) % menuButtons.length;
  selectButton(menuButtons[next]);
});

// Enter triggers the currently selected button.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!menuKeysActive()) return;
  const sel = menuButtons.find(b => b.classList.contains('selected'));
  if (sel) sel.click();
});

// ── ACTION HANDLERS ──
document.getElementById('newGameBtn').addEventListener('click', () => {
  smoothNavigate('/game/game.html');
});

document.getElementById('rosterBtn').addEventListener('click', () => {
  smoothNavigate('/roster/roster.html');
});

document.getElementById('achievementsBtn').addEventListener('click', () => {
  showAlert('★ NO DEEDS RECORDED YET. GO FORTH AND CONQUER!');
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  showAlert('⚙ THE ROYAL DECREES ARE BEING DRAFTED.');
});

document.getElementById('creditsBtn').addEventListener('click', () => {
  showAlert('📜 BUILT BY THE SIEGE PROTOCOL ORDER. v0.1.0 ALPHA.');
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showAlert('✗ THE GATES WOULD NOT CLOSE: ' + error.message, 'error');
  } else {
    smoothNavigate('/login/login.html');
  }
});
