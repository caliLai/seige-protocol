/* ═══════════════════════════════════════════════
   AUTH — Firebase email/password + Google login + register
   ═══════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── FIREBASE CONFIG ──
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
const provider = new GoogleAuthProvider();

// ── DOM REFS ──
const loginView = document.getElementById('loginView');
const registerView = document.getElementById('registerView');
const subtitle = document.getElementById('subtitle');
const alertEl = document.getElementById('alertBanner');

// Login form
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.getElementById('btnText');
const btnLoading = document.getElementById('btnLoading');

// Register form
const regEmailInput = document.getElementById('regEmail');
const regPassInput = document.getElementById('regPassword');
const confirmInput = document.getElementById('confirmPassword');
const registerBtn = document.getElementById('registerBtn');
const regBtnText = document.getElementById('regBtnText');
const regBtnLoading = document.getElementById('regBtnLoading');

// ── HELPERS ──
const setLoading = (btn, txt, load, on) => {
  btn.disabled = on;
  txt.style.display = on ? 'none' : 'inline';
  load.style.display = on ? 'inline' : 'none';
};

const hideAlert = () => { alertEl.style.display = 'none'; };

const showAlert = (msg, type = 'error') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  alertEl.style.color = '#f0d9a0';
  alertEl.style.boxShadow = '3px 3px 0 #000';
};

const friendlyError = (code) => ({
  'auth/user-not-found':         '✗ NO WARRIOR BY THAT NAME',
  'auth/wrong-password':         '✗ WRONG CIPHER! BEGONE!',
  'auth/invalid-email':          '✗ INVALID SEAL ON THE ADDRESS',
  'auth/too-many-requests':      '✗ TOO MANY ATTEMPTS. REST THY HAND.',
  'auth/invalid-credential':     '✗ CREDENTIALS REJECTED BY THE KEEP',
  'auth/network-request-failed': '✗ THE RAVENS COULD NOT FLY',
  'auth/email-already-in-use':   '✗ THIS NAME IS ALREADY CLAIMED',
  'auth/weak-password':          '✗ THY CIPHER IS TOO FEEBLE',
  'auth/operation-not-allowed':  '✗ THE KEEP REJECTS NEW OATHS',
}[code] || '✗ THE GATES HOLD FIRM. TRY AGAIN.');

// ── VIEW SWITCHER ──
const switchView = (toShow, toHide, newSubtitle) => {
  hideAlert();
  toHide.classList.add('hidden');
  toShow.classList.remove('hidden');
  // restart fadein animation
  toShow.style.animation = 'none';
  void toShow.offsetWidth;
  toShow.style.animation = '';
  subtitle.textContent = newSubtitle;
};

// ── EMAIL/PASSWORD LOGIN ──
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  let valid = true;
  const emailErr = document.getElementById('emailError');
  const passErr = document.getElementById('passwordError');

  if (!emailInput.value || !/\S+@\S+\.\S+/.test(emailInput.value)) {
    emailErr.style.display = 'block';
    valid = false;
  } else {
    emailErr.style.display = 'none';
  }

  if (!passInput.value || passInput.value.length < 6) {
    passErr.style.display = 'block';
    valid = false;
  } else {
    passErr.style.display = 'none';
  }

  if (!valid) return;

  setLoading(loginBtn, btnText, btnLoading, true);
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
    showAlert('✓ WELCOME BACK! THE GATES ARE OPEN!', 'success');
    smoothNavigate('/game/game.html');
  } catch (err) {
    showAlert(friendlyError(err.code));
    setLoading(loginBtn, btnText, btnLoading, false);
  }
});

// ── GOOGLE LOGIN ──
document.getElementById('googleBtn').addEventListener('click', async () => {
  hideAlert();
  try {
    const c = await signInWithPopup(auth, provider);
    showAlert('✓ WELCOME, ' + c.user.displayName.toUpperCase() + '!', 'success');
    smoothNavigate('/game/game.html');
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') showAlert(friendlyError(err.code));
  }
});

// ── SMOOTH NAVIGATION ──
// Modern browsers handle the crossfade via @view-transition CSS rule on both pages.
// Older browsers get a manual fade-out fallback so it doesn't snap.
const smoothNavigate = (url) => {
  if ('startViewTransition' in document) {
    // Browser handles the crossfade automatically — just navigate.
    setTimeout(() => { window.location.href = url; }, 600);
    return;
  }
  // Fallback: fade out body, then navigate.
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};

// ── PASSWORD RESET ──
const forgotLink = document.getElementById('forgotLink');
let forgotInFlight = false;
forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  if (forgotInFlight) return;
  hideAlert();

  if (!emailInput.value || !/\S+@\S+\.\S+/.test(emailInput.value)) {
    showAlert('✗ ENTER THY EMAIL ABOVE FIRST!');
    emailInput.focus();
    return;
  }

  forgotInFlight = true;
  const originalText = forgotLink.textContent;
  forgotLink.textContent = 'DISPATCHING RAVEN…';
  forgotLink.style.pointerEvents = 'none';
  forgotLink.style.opacity = '0.6';

  try {
    await sendPasswordResetEmail(auth, emailInput.value);
    showAlert('✓ RAVEN DISPATCHED! CHECK THY INBOX (AND SPAM SCROLLS).', 'success');
  } catch (err) {
    showAlert(friendlyError(err.code));
  } finally {
    forgotLink.textContent = originalText;
    forgotLink.style.pointerEvents = '';
    forgotLink.style.opacity = '';
    forgotInFlight = false;
  }
});

// ── REGISTER FORM ──
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  const emailErr = document.getElementById('regEmailError');
  const passErr = document.getElementById('regPasswordError');
  const confirmErr = document.getElementById('confirmError');
  let valid = true;

  if (!regEmailInput.value || !/\S+@\S+\.\S+/.test(regEmailInput.value)) {
    emailErr.style.display = 'block';
    valid = false;
  } else {
    emailErr.style.display = 'none';
  }

  if (!regPassInput.value || regPassInput.value.length < 6) {
    passErr.style.display = 'block';
    valid = false;
  } else {
    passErr.style.display = 'none';
  }

  if (regPassInput.value !== confirmInput.value) {
    confirmErr.style.display = 'block';
    valid = false;
  } else {
    confirmErr.style.display = 'none';
  }

  if (!valid) return;

  setLoading(registerBtn, regBtnText, regBtnLoading, true);
  try {
    await createUserWithEmailAndPassword(auth, regEmailInput.value, regPassInput.value);
    showAlert('✓ THY OATH IS RECORDED! WELCOME, KNIGHT!', 'success');
    setTimeout(() => switchView(loginView, registerView, '— ENTER THE KEEP —'), 1200);
  } catch (err) {
    showAlert(friendlyError(err.code));
  } finally {
    setLoading(registerBtn, regBtnText, regBtnLoading, false);
  }
});

// ── VIEW TOGGLES ──
document.getElementById('registerLink').addEventListener('click', (e) => {
  e.preventDefault();
  switchView(registerView, loginView, '— PLEDGE THINE ALLEGIANCE —');
});

document.getElementById('backToLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  switchView(loginView, registerView, '— ENTER THE KEEP —');
});
