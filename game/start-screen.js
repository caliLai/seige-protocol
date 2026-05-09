/* ═══════════════════════════════════════════════
   START SCREEN — auth gate, menu navigation, brick loader
   ═══════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5tDBtVHfSp_exIEletebyCO69n0sVHKA",
  authDomain: "siege-protocol-8be3b.firebaseapp.com",
  projectId: "siege-protocol-8be3b",
  storageBucket: "siege-protocol-8be3b.firebasestorage.app",
  messagingSenderId: "1095998279472",
  appId: "1:1095998279472:web:0fd57acfad6bfe0aacc2f5",
  measurementId: "G-FDTG8L5YBE"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ── DOM REFS ──
const brickLoader = document.getElementById('brickLoader');
const userNameEl = document.getElementById('userName');
const alertEl = document.getElementById('alertBanner');

// ── BRICK LOADER ANIMATION ──
// The grey wall starts fully covering the page (initial state from CSS).
// Each brick gets a staggered delay, then falls away individually. Top rows
// fall first, with a slight column jitter so it feels organic, not a
// mechanical sweep.
const buildBrickLoader = () => {
  const cols = 24, rows = 14;
  const total = cols * rows;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const brick = document.createElement('div');
    brick.className = 'brick';
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Top rows fall earliest; columns add a small wave; jitter scatters it.
    const baseDelay = (row * 0.045) + (col * 0.012);
    const jitter = Math.random() * 0.12;
    brick.style.animationDelay = (baseDelay + jitter) + 's';
    frag.appendChild(brick);
  }
  brickLoader.appendChild(frag);
};

buildBrickLoader();
// Bricks now fully tile the loader area, so the solid covering background
// from CSS is no longer needed — clear it so the menu shows through as
// bricks fall away.
brickLoader.style.background = 'transparent';
// Last brick finishes ~ rows*0.045 + cols*0.012 + 0.12 + 0.5s animation ≈ 1.5s.
// Hide the loader element entirely once everything has fallen.
setTimeout(() => { brickLoader.style.display = 'none'; }, 1500);

// ── AUTH GATE ──
// If user is not signed in, kick them back to login.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = '/login/login.html';
    return;
  }
  const display = user.displayName || user.email || 'NAMELESS KNIGHT';
  userNameEl.textContent = display.toUpperCase();
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
// The most recently hovered button keeps the gold highlight.
const menuButtons = Array.from(document.querySelectorAll('.menu-btn'));
const selectButton = (btn) => {
  menuButtons.forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
};
menuButtons.forEach(btn => {
  btn.addEventListener('mouseenter', () => selectButton(btn));
});

// Arrow-key navigation also moves selection, for keyboard users.
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

// Enter triggers the currently selected button (if any).
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
  try {
    await signOut(auth);
    smoothNavigate('/login/login.html');
  } catch (err) {
    showAlert('✗ THE GATES WOULD NOT CLOSE: ' + err.code, 'error');
  }
});
