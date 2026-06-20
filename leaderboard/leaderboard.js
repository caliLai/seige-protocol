/* ═══════════════════════════════════════════════
   HALL OF CONQUERORS — global all-time tower-kill leaderboard
   Reads the server-authoritative global_leaderboard() RPC and renders a
   ranked table visible to every signed-in player.
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';
import { enforceSingleSession } from '/lib/single-session.js';

const lbBody = document.getElementById('lbBody');
const backBtn = document.getElementById('backBtn');

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  window.location.href = '/login/login.html';
}
enforceSingleSession(user);

// The signed-in player's own name, so we can highlight their row.
const { data: me } = await supabase
  .from('profiles')
  .select('username')
  .eq('user_id', user.id)
  .maybeSingle();
const myName = me?.username ?? null;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const renderRows = (rows) => {
  if (!rows.length) {
    lbBody.innerHTML = '<div class="lb-empty">— NO TOWERS FELLED YET. BE THE FIRST! —</div>';
    return;
  }

  lbBody.innerHTML = rows.map((row, i) => {
    const rank = i + 1;
    const isMe = myName && row.username === myName;
    const crown = rank === 1 ? '👑 ' : '';
    return `
      <div class="lb-row${isMe ? ' is-me' : ''}${rank <= 3 ? ' is-top' : ''}">
        <span class="lb-rank">#${rank}</span>
        <span class="lb-name">${crown}${escapeHtml(row.username)}</span>
        <span class="lb-points">${row.tower_points ?? 0}</span>
      </div>`;
  }).join('');
};

// ── LOAD ──
const { data, error } = await supabase.rpc('global_leaderboard', { p_limit: 50 });
if (error) {
  console.error('leaderboard fetch failed', error);
  lbBody.innerHTML = '<div class="lb-empty">✗ THE SCRIBES COULD NOT TALLY THE HALL.</div>';
} else {
  renderRows(data || []);
}

// ── NAV ──
backBtn.addEventListener('click', () => {
  // Skip the castle-door animation when landing back on the warroom.
  sessionStorage.setItem('skipDoorAnimation', '1');
  window.location.href = '/start-screen/start-screen.html';
});

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = '/login/login.html';
});
