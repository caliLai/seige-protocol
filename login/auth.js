/* ═══════════════════════════════════════════════
   AUTH — Supabase email/password + Google + register
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── EXISTING-SESSION GATE ──
// Sessions are already persisted to localStorage by lib/supabase.js
// (persistSession: true). The login page itself wasn't honouring that —
// it always rendered the form even when a valid session was sitting in
// storage, forcing users to "log in" every time they hit the root URL.
// Bounce them straight to the start screen if a session exists so the
// site behaves like a real signed-in app.
// We do this before any DOM setup so the form never even flashes.
//
// EXCEPT: if single-session.js just kicked this tab out (because a
// newer tab/device claimed the account), `kicked_tab` is set in this
// tab's sessionStorage. Skipping the auto-redirect here breaks the
// otherwise-infinite loop:
//   kicked → /login → valid session → /start-screen → kicked again → ...
// The localStorage session token is still valid — it belongs to the
// new tab too, and we don't want to invalidate it. The user can
// manually sign in again if they want THIS tab back; that submit
// path becomes the new latest session and would kick the other tab
// in turn, which is the expected single-session semantics.
{
  const wasKicked = sessionStorage.getItem('kicked_tab') === '1';
  if (wasKicked) {
    sessionStorage.removeItem('kicked_tab');
    // Fall through to render the form; the showAlert below will
    // explain why they're here.
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // skipDoorAnimation so returning users don't sit through the
      // 2.3s castle-door open every page visit.
      sessionStorage.setItem('skipDoorAnimation', '1');
      window.location.replace('/start-screen/start-screen.html');
      // Throw so module evaluation halts — the page is about to
      // unload anyway, but stopping here keeps the form bindings
      // from running.
      throw new Error('redirecting to start screen — existing session');
    }
  }
}

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

// If we landed here because single-session.js kicked the previous
// tab, surface a clear explanation so the user understands they
// weren't randomly signed out. The flag is cleared on first read so
// it doesn't persist across normal future logins.
{
  const notice = sessionStorage.getItem('authNotice');
  if (notice === 'other_session') {
    sessionStorage.removeItem('authNotice');
    showAlert('⚠ SIGNED OUT — THY NAME WAS CLAIMED ELSEWHERE');
  }
}

// Supabase returns errors with .message strings rather than fixed codes.
// Map common phrases to medieval error text.
const friendlyError = (error) => {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return '✗ WRONG CIPHER! BEGONE!';
  if (msg.includes('user not found'))            return '✗ NO WARRIOR BY THAT NAME';
  if (msg.includes('email not confirmed'))       return '✗ THY EMAIL AWAITS CONFIRMATION';
  if (msg.includes('rate limit'))                return '✗ TOO MANY ATTEMPTS. REST THY HAND.';
  if (msg.includes('already registered'))        return '✗ THIS NAME IS ALREADY CLAIMED';
  if (msg.includes('weak password') || msg.includes('password should be')) return '✗ THY CIPHER IS TOO FEEBLE';
  if (msg.includes('invalid email'))             return '✗ INVALID SEAL ON THE ADDRESS';
  if (msg.includes('network') || msg.includes('fetch')) return '✗ THE RAVENS COULD NOT FLY';
  return '✗ THE GATES HOLD FIRM. TRY AGAIN.';
};

// ── VIEW SWITCHER ──
const switchView = (toShow, toHide, newSubtitle) => {
  hideAlert();
  toHide.classList.add('hidden');
  toShow.classList.remove('hidden');
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
  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passInput.value,
  });
  if (error) {
    showAlert(friendlyError(error));
    setLoading(loginBtn, btnText, btnLoading, false);
  } else {
    showAlert('✓ WELCOME BACK! THE GATES ARE OPEN!', 'success');
    smoothNavigate('/start-screen/start-screen.html');
  }
});

// ── GOOGLE LOGIN ──
// Supabase OAuth redirects the browser to Google then back to redirectTo,
// where the session is detected automatically (detectSessionInUrl: true).
document.getElementById('googleBtn').addEventListener('click', async () => {
  hideAlert();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/start-screen/start-screen.html`,
    },
  });
  if (error) showAlert(friendlyError(error));
});

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

  const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value, {
    redirectTo: `${window.location.origin}/login/login.html`,
  });
  if (error) showAlert(friendlyError(error));
  else showAlert('✓ RAVEN DISPATCHED! CHECK THY INBOX (AND SPAM SCROLLS).', 'success');

  forgotLink.textContent = originalText;
  forgotLink.style.pointerEvents = '';
  forgotLink.style.opacity = '';
  forgotInFlight = false;
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
  const { error } = await supabase.auth.signUp({
    email: regEmailInput.value,
    password: regPassInput.value,
    options: {
      emailRedirectTo: `${window.location.origin}/login/login.html`,
    },
  });
  if (error) {
    showAlert(friendlyError(error));
  } else {
    showAlert('✓ THY OATH IS RECORDED! CONFIRM VIA EMAIL TO ENTER.', 'success');
    setTimeout(() => switchView(loginView, registerView, '— ENTER THE KEEP —'), 1500);
  }
  setLoading(registerBtn, regBtnText, regBtnLoading, false);
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

// ── SMOOTH NAVIGATION ──
const smoothNavigate = (url) => {
  if ('startViewTransition' in document) {
    setTimeout(() => { window.location.href = url; }, 600);
    return;
  }
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};
