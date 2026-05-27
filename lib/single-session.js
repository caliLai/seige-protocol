/* ═══════════════════════════════════════════════
   SINGLE-SESSION ENFORCEMENT
   One active tab/device per account. When a NEW login happens
   anywhere, older sessions for the same user.id sign themselves
   out and bounce to /login with a notice.

   Implementation: Supabase Realtime Presence channel keyed by
   user.id. Every authenticated page subscribes and tracks itself
   with a unique tab id + a `joined_at` timestamp. On every
   presence sync, the page checks whether ANY other tab has a
   later joined_at; if so, the current tab is stale and signs
   itself out. The latest tab always wins.

   This needs zero DB schema changes. The auth-relevant state
   (the JWT in localStorage) is still managed by Supabase Auth;
   we just gate it with a presence check.

   ── SERVER-AUTH NOTE ────────────────────────────────────────
   Presence is intentionally NOT persisted to the database or
   used to gate game state. If a tampered client lied about
   `joined_at`, the worst case is "their own session gets kicked
   slightly differently" — they can't earn gold, win matches,
   or otherwise affect server-validated state through this
   channel. Keep it that way.
   ═══════════════════════════════════════════════ */

import { supabase } from './supabase.js';

// One tab id per page load. crypto.randomUUID is available in every
// browser we target; fall back just in case.
const TAB_ID = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const JOINED_AT = Date.now();

let channel = null;
let bouncing = false; // guards against firing sign-out twice on rapid syncs

// Idempotent — calling more than once per page just returns. Each
// authenticated page should call this exactly once, right after
// `supabase.auth.getUser()` confirms a user exists.
export const enforceSingleSession = async (user) => {
  if (!user?.id || channel) return;

  channel = supabase.channel(`user-session-${user.id}`, {
    config: { presence: { key: TAB_ID } },
  });

  const evaluatePresence = async () => {
    if (bouncing) return;
    const state = channel.presenceState();

    // Find the latest-joined tab across the channel. Tie-break with
    // tab id (lexicographic) so two tabs racing within the same ms
    // still produce a deterministic winner — without this, both
    // could mutually sign each other out.
    let latestAt = JOINED_AT;
    let latestTab = TAB_ID;
    for (const [tabId, presences] of Object.entries(state)) {
      const p = presences[0];
      if (!p) continue;
      const at = typeof p.joined_at === 'number' ? p.joined_at : 0;
      const isNewer = at > latestAt || (at === latestAt && tabId > latestTab);
      if (isNewer) {
        latestAt = at;
        latestTab = tabId;
      }
    }

    if (latestTab !== TAB_ID) {
      // Another tab opened this account more recently. Step aside.
      //
      // CRITICAL: we deliberately do NOT call supabase.auth.signOut()
      // here. The auth session token lives in localStorage, which is
      // shared between every tab in the same browser — so signing out
      // would clear the NEW tab's session too, defeating the whole
      // point. (Even `scope: 'local'` still clears localStorage.) The
      // SIGNED_OUT event from supabase.auth would also fire in the new
      // tab's onAuthStateChange listener and bounce it to /login.
      //
      // Instead: untrack our presence (so the new tab's UI doesn't
      // think we're still here) and navigate THIS tab to /login. The
      // session token stays valid; only this tab walks away.
      //
      // The `kicked_tab` flag is per-tab (sessionStorage, not local-
      // Storage) so it doesn't leak into the new tab. /login reads it
      // to suppress its usual "valid session → auto-redirect to start
      // screen" behaviour, which would otherwise bounce this tab right
      // back into the app shell and trigger another presence kick in
      // an infinite loop.
      bouncing = true;
      sessionStorage.setItem('kicked_tab', '1');
      sessionStorage.setItem('authNotice', 'other_session');
      try { await channel.untrack(); } catch { /* socket already gone */ }
      // replace() so the back button doesn't bounce into the
      // about-to-be-stale app shell.
      window.location.replace('/login/login.html');
    }
  };

  channel
    .on('presence', { event: 'sync' }, evaluatePresence)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ tab_id: TAB_ID, joined_at: JOINED_AT });
      }
    });
};
