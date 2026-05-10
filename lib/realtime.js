/* ═══════════════════════════════════════════════
   REALTIME — placeholder for multiplayer / WebSocket
   ═══════════════════════════════════════════════

   Two integration paths to choose from later:

   A) Supabase Realtime (cheapest, simplest, good for lobbies/chat/presence)
      import { supabase } from '/lib/supabase.js';
      const channel = supabase.channel(`lobby:${lobbyId}`)
        .on('broadcast', { event: 'unit-spawn' }, ({ payload }) => { ... })
        .on('presence', { event: 'sync' }, () => { ... })
        .subscribe();

   B) Dedicated game server on Render / Koyeb / PartyKit (authoritative ticks)
      const ws = new WebSocket('wss://your-game-server.example.com');
      ws.addEventListener('message', (e) => { ... });

   Wire either inside connectMultiplayer() and import where you need it. */

export const connectMultiplayer = (/* opts */) => {
  // intentionally empty — implement when the multiplayer feature ships.
  return { disconnect: () => {} };
};
