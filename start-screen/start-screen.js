/* ═══════════════════════════════════════════════
   START SCREEN — Supabase auth gate, menu nav, door loader
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── DOM REFS ──
const doorLoader = document.getElementById('doorLoader');
const userNameEl = document.getElementById('userName');
const alertEl = document.getElementById('alertBanner');

// ── CASTLE DOOR LOADER ──
// Doors live in HTML and animate themselves open via CSS. Hide the loader
// element after the swing finishes so the menu becomes interactive.
setTimeout(() => { doorLoader.classList.add('gone'); }, 2000);

// ── AUTH GATE ──
// Redirect to login if not signed in. Supabase auto-detects OAuth tokens
// in the URL on arrival (detectSessionInUrl) so Google login lands here
// fully authenticated.
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  window.location.href = '/login/login.html';
} else {
  const display = user.user_metadata?.full_name
              ||  user.user_metadata?.name
              ||  user.email
              ||  'NAMELESS KNIGHT';
  userNameEl.textContent = display.toUpperCase();
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

// Arrow-key navigation between menu buttons.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
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
  const sel = menuButtons.find(b => b.classList.contains('selected'));
  if (sel) sel.click();
});

// ── ACTION HANDLERS ──
document.getElementById('newGameBtn').addEventListener('click', () => {
  smoothNavigate('/game/game.html');
});

document.getElementById('continueBtn').addEventListener('click', () => {
  showAlert('✗ NO SAVED CAMPAIGN FOUND, KNIGHT.');
});

document.getElementById('rosterBtn').addEventListener('click', () => {
  showAlert('⚜ THY ROSTER SHALL BE REVEALED IN A FUTURE PATCH.');
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
