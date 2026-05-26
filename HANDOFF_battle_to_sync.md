# Battle → Sync Handoff

For the teammate adding multiplayer sync. Covers what's currently built,
where the sync seams are, and what's deliberately left broken because
it's your problem to solve.

## What's in place now

### Database

Three migrations beyond the lobby/setup baseline:

- **`supabase-migrations/004_battle_state.sql`** — added per-match runtime
  state to `sieges`: `phase` (lobby/setup/prep/battle/complete),
  `current_wave`, `total_waves`, `team_lives` (now unused, see below),
  `host_gold`/`ally_gold`, `host_queue`/`ally_queue` (+ `*_queue_ready`),
  `host_contribution`/`ally_contribution` JSONB, `outcome`
  (victory/defeat), `ended_at`. Partial index on `phase = 'lobby'` for
  the room browser.
- **`supabase-migrations/005_lock_profile_writes.sql` +
  `007_fix_payout_trigger.sql`** — locked direct writes to
  `profiles.points` / `profiles.unlocked_units` behind a trigger.
  Clients must go through `rpc('purchase_unit', ...)` to unlock units.
  Currency writes use a session-local bypass flag
  (`app.allow_currency_write`) set by the security-definer RPCs so
  they can update `points` despite the trigger.
- **`supabase-migrations/006_match_payout.sql`** — `award_match_points(p_siege)`
  RPC reads `host_contribution->>'damage_dealt'` and ally equivalent,
  splits a pool 60/40 favouring the higher contributor, adds to both
  `profiles.points`, stamps `ended_at` for idempotency.

### Battle runtime ([battle/battle.js](battle/battle.js))

- Single shared canvas in [battle/battle.html](battle/battle.html), 1120×640.
- Wave flow: `siege-setup → battle` → host writes `phase: 'battle'` →
  spawn timeline runs → wave-completed / wave-failed event → host
  either advances `current_wave` (failure with waves left) or writes
  `outcome: 'victory'|'defeat'` (last tower fell, or last wave failed).
- Both players hit "LOCK IN WAVE" (writes `host_queue_ready` /
  `ally_queue_ready`). When both are true, both clients independently
  call `startWave()`.
- Wave 1 only: host seeds `host_gold` / `ally_gold` from
  `STARTING_GOLD[difficulty]`. After that gold persists across waves
  (tower kills bank into both `*_gold` columns; queue adds/removes
  debit/refund through the row).
- Towers persist across waves — wave 2 fights whatever's left standing
  from wave 1. Tower death credits `contribution[lastAttackerTeam]`
  via [src/runtime/contribution.js](src/runtime/contribution.js).
- Heart counter in the HUD shows wave attempts remaining
  (`total_waves - current_wave + 1`). `team_lives` column is no longer
  read or written — derived from waves. Safe to leave on the schema
  or drop later.
- End-of-match overlay (victory or defeat). Host writes
  `host_contribution` / `ally_contribution` JSONB before the outcome
  flip so `award_match_points` sees the values. Lobby button on the
  overlay deletes the siege row; DELETE handler ignores the event if
  `matchEnded` so the other player can finish reading their reward.

### Sync hygiene already done

These are the things I built specifically to make your job easier.
Don't undo them, lean on them.

1. **Fixed timestep.** `animate()` computes
   `sim.dt = Math.min(100, now - lastFrameTime)` and writes it to the
   shared module [src/runtime/sim.js](src/runtime/sim.js).
   `Unit.calculateAndUpdatePathMovement` reads `sim.dt` instead of
   the old `/60` frame-rate assumption. Two monitors at different
   refresh rates now play at the same wall-clock speed. If you want
   lockstep, pin `sim.dt = 1000/60`.
2. **`battleEvents` EventTarget.** Discrete combat events flow through
   one bus in [battle/battle.js](battle/battle.js). Hook them with
   `addEventListener` and broadcast — zero edits to simulation code:
   ```js
   import { battleEvents } from '/battle/battle.js';
   battleEvents.addEventListener('tower-destroyed', (e) => { /* broadcast e.detail */ });
   ```
   Events and payloads:
   - `tower-destroyed`: `{ towerIndex, lastAttackerTeam, reward }` —
     fires when `towers.shift()` runs in `animate()`.
   - `wave-completed`: `{ wave, towersRemaining: 0 }` — all towers
     destroyed.
   - `wave-failed`: `{ wave, towersRemaining }` — all spawned friendly
     units dead, towers still standing.
   - `battle-ended`: `{ outcome: 'victory' | 'defeat' }` — fires from
     inside `showEndOverlay`, after the host has written the outcome.
3. **Stale-write guard in `applySiegeUpdate`.** Optimistic local
   updates can race with realtime echoes of older writes. There's a
   `phaseOrder` + `current_wave` check that drops any incoming row
   strictly behind the current one. The intent: never regress
   `phase`, `current_wave`, or `outcome` from a late echo.
4. **Wave-attempt ID.** `waveAttemptId` is bumped on every
   `startWave()`. The spawn-timeline `setTimeout`s capture it and
   drop themselves if it's changed by the time they fire, so leftover
   spawns from a failed wave can't leak into the next wave.

### Schema patterns to know

- **Host writes team-level columns** (`current_wave`, `phase`,
  `outcome`, `host_contribution`, `ally_contribution`,
  `host_gold` *and* `ally_gold`). Either side could update them per
  RLS, but only the host does to avoid two-writer races.
- **Each side writes its own mirrored columns** (`host_queue` vs
  `ally_queue`, `host_queue_ready` vs `ally_queue_ready`,
  `host_units` vs `ally_units`). RLS gates this naturally:
  `auth.uid() = host_id` to write `host_*`.
- **`postgres_changes` UPDATE/DELETE on the siege row** is already
  subscribed in `battle.js`. New columns ride the same subscription
  for free.

## What's NOT synced (your work starts here)

Everything inside the canvas simulation. Each client runs an
independent copy of the wave from the same queue. They mostly agree
because inputs are deterministic and combat is non-random, but they
will desync in practice. Things that currently differ between clients:

- **Unit positions and HP.** No broadcast of canvas state. Each
  client steps its own `attackUnits`.
- **Projectile flight + collision.** Local only.
- **Tower HP.** Each client tracks its own `tower.health`. The
  `towers` array on each client is independent. Each client sees its
  own tower-destroyed event at a slightly different wall-clock moment.
- **`towersDestroyedCount`** in the HUD. Local only. The two players
  may briefly see different counts.
- **`unitsDeployedCount`** in the victory/defeat stats. Local only.
- **`contribution` accumulator.** Local-only per client, then the
  host's copy is written to the siege row on match end. The ally's
  local accumulator is discarded — only the host's view is
  authoritative. If you want real cross-client agreement on damage
  dealt, you'll need to feed both into the row before the outcome
  write.
- **Wave outcome judgement.** Each client runs `checkWaveOutcome`
  every frame from `animate()`. Both will fire `wave-failed` /
  `wave-completed` independently. Currently the listeners short-circuit
  on `if (!isHost) return;` so only the host writes — but the *event*
  fires on both sides. Watch for double-fires when you wire broadcast.
- **Page refresh recovery.** A reload re-initialises the local
  `towers` array to the full set from `towerLocations`. The other
  client still has the correct (depleted) state. Until you have
  snapshot sync, a refresh mid-battle is essentially broken.
- **Player disconnect.** No presence detection. If a player closes
  their tab mid-battle, the remaining player has no signal — the
  realtime subscription just stops getting messages from them.

## Recommended sync model

I'd push for **host-authoritative + Supabase broadcast snapshots**
(option A from the original sync discussion). Reasons:

1. The state machine is already host-asymmetric: host writes phase,
   wave, outcome, contribution. Making the host the simulation
   authority is a small additional step, not a redesign.
2. Lockstep deterministic sim would require ripping out `setTimeout`
   spawn timing and clock-driven cooldowns. Big refactor.
3. Server-authoritative requires standing up infrastructure that
   doesn't exist yet (Supabase doesn't host long-running game logic).

What that looks like roughly:

- Host's `animate()` runs the "real" simulation as today.
- Host broadcasts a snapshot every ~100ms over
  `supabase.channel('battle-{siegeId}').send({ type: 'broadcast', ... })`.
- Ally's `animate()` only renders — it interpolates between the last
  two snapshots, doesn't run combat itself.
- Ally's `battleEvents` listeners run as today (HUD updates, etc.)
  but don't write the row — they only react to the host's broadcasts.
- For ally → host inputs (item use, eventually): ally sends a
  broadcast, host applies it to the simulation, snapshot reflects it.

The existing `battleEvents` bus is the natural broadcast hook on the
host side. On the ally side, you'll want to *replace* the local
event dispatches with broadcast-receivers — the simulation that
would otherwise fire them won't be running.

## Specific places you'll need to touch

- **[battle/battle.js](battle/battle.js) `animate()`** — for the
  ally, replace simulation with snapshot interpolation. For the host,
  add the snapshot broadcast.
- **`battleEvents` listeners** — currently both clients run them.
  For ally-side, gate the row-write branches behind a "did this come
  from a host broadcast?" check, or just drop them entirely if the
  ally isn't running its own simulation.
- **`startWave()`** — the host should broadcast a "wave-starting"
  event so the ally can clear local state and prepare to render. The
  ally's `startWave()` should *not* run spawn timeouts of its own.
- **Item use (when items get wired up)** — ally clicks an item card,
  needs to round-trip through host. Add a `broadcast` channel for
  `item-used`.
- **Presence (`supabase.channel.track(...)`)** — track who's connected
  in the channel and surface a disconnect signal in the HUD.
- **`contribution` on the ally side** — either stop tracking it
  locally (host is authoritative) or write both sides' totals to the
  row and let `award_match_points` pick the host's view.

## What you should NOT have to touch

- The siege-setup → battle handoff. Discrete state, already synced
  via postgres_changes.
- The lock-in / queue-ready handshake. Already synced.
- `award_match_points` / `purchase_unit` RPCs and the
  `profiles_block_currency` trigger. Currency-write security is done.
- Stone-bg / lobby / siege-setup UI. None of those depend on the
  battle runtime.
- The schema. Every column you need is already there. If you add
  broadcast events, those are ephemeral and don't go through the row.

## Quick reference: file map

- [battle/battle.js](battle/battle.js) — runtime, event bus, all
  listeners and writes.
- [battle/battle.html](battle/battle.html) — HUD markup, victory and
  defeat overlays.
- [src/runtime/sim.js](src/runtime/sim.js) — `sim.dt`, shared timestep.
- [src/runtime/contribution.js](src/runtime/contribution.js) — damage
  / tower-kill accumulator. Currently host-authoritative-by-convention.
- [src/classes/Unit.js](src/classes/Unit.js) — movement uses `sim.dt`;
  hits pass attacker to `takeDamage`.
- [src/classes/Tower.js](src/classes/Tower.js) — accepts attacker,
  credits contribution, stores `lastAttackerTeam` for the
  tower-destroyed event.
- [supabase-migrations/004_battle_state.sql](supabase-migrations/004_battle_state.sql)
  — battle columns and indexes.
- [supabase-migrations/005_lock_profile_writes.sql](supabase-migrations/005_lock_profile_writes.sql),
  [007_fix_payout_trigger.sql](supabase-migrations/007_fix_payout_trigger.sql)
  — currency trigger + `purchase_unit` RPC.
- [supabase-migrations/006_match_payout.sql](supabase-migrations/006_match_payout.sql)
  — `award_match_points` RPC.
- [game-flow.md](game-flow.md) — design doc for the wave loop and
  currency model.

## One-paragraph TL;DR

The battle loop runs end-to-end on each client independently with
deterministic inputs and per-client canvas simulation. State that
must agree (phase, wave, queues, ready flags, gold, lives, outcome)
goes through the siege row and propagates via postgres_changes.
What you need to add is sync for the *continuous* simulation —
unit positions, tower HP, damage events as they happen — so the two
canvases stay visually aligned. The seams for that are
`battleEvents` (discrete event hooks) and the host's `animate()`
(snapshot source). Everything currently host-only on writes is
already structured for you to layer host-authoritative simulation
sync on top.
