# Siege Protocol

A two-player co-op tower-assault game played in the browser. You and an ally each muster a host of units, lock in your wave, and send them marching down the road to bring down a line of stone towers — wave after wave, map after map — splitting the spoils based on who did the work.

**Live:** <https://seige-protocol-five.vercel.app/>

> A COMP 7082 project.

## Gameplay

1. **Log in** and land in the **lobby** (war room), where you can create a siege or join an open one.
2. In **siege setup**, each player picks the unit types they'll field and locks in.
3. In the **battle**, both players spend battle gold to queue units from their chosen types, then hit **Lock In Wave**. Once both sides are ready, the wave spawns and marches.
4. Units auto-engage the nearest tower they can reach. Each tower that falls offers each player a **reward** — gold or a run-long stat buff for one of their unit types.
5. **Clear every tower on a map** to advance to the next; clear the final map to win. If a wave's units all die with towers still standing, you're repulsed and lose a wave attempt — run out of attempts and the siege is lost.
6. A live **leaderboard** tracks each side's tower-kill points, and the match payout is split 60/40 by contribution.

The game is **refresh- and disconnect-resilient**: if a player reloads or drops mid-wave, their client reconstructs the in-flight battlefield from a live state snapshot (units, towers, projectiles, overlays) and resumes — or hands authority back to the surviving peer — without restarting the wave.

## Architecture

This is a **vanilla ES-module browser app** — no bundler, no framework, no build step. Each top-level directory is a page with sibling `.html` / `.js` / `.css` files:

| Page | Purpose |
| --- | --- |
| `start-screen/` | Landing screen |
| `login/` | Auth (Supabase) |
| `lobby/` | War room — create / join sieges |
| `siege-setup/` | Pick unit types and lock in |
| `battle/` | The real multiplayer match (canvas) |
| `game/` | Older solo-style sandbox (reads `sessionStorage`) |
| `roster/` | Unlock unit types with lifetime points |
| `leaderboard/` | Global leaderboard |

Pages navigate via plain `window.location.href` and import shared modules using **browser-absolute paths** (e.g. `/lib/supabase.js`) so they resolve under `serve`/Vercel without a build.

### Backend: Supabase (no custom server)

`lib/supabase.js` exports a single shared client. All multiplayer state lives in Postgres and is mutated through **server-side RPCs**, not direct table writes:

- **`public.profiles`** — currency (`points`) and `unlocked_units` are trigger-locked; they change only via RPCs (`purchase_unit`, `award_match_points`).
- **`public.sieges`** — the room/match row: host & ally identity, chosen units, ready flags, `phase` (`lobby` → `setup` → `prep` → `battle` → `complete`), wave state, and outcome. Battle-runtime columns (gold, queue, current wave, phase, outcome, contribution) are locked and mutated only through security-definer RPCs (`queue_unit`, `lock_in_wave`, `start_wave_battle`, `advance_wave`, `advance_map`, `set_match_outcome`, …).
- **`public.siege_snapshots`** — the ~5 Hz battlefield state used to recover a client that refreshed mid-wave; a `pg_cron` watchdog ends sieges whose snapshot goes stale (both peers abandoned).

Numbered files in `supabase-migrations/` are authoritative (run them in order). `schema.sql` is a context dump and is **not** runnable.

### Realtime multiplayer

There is **no game server** — both clients run the simulation locally and stay in sync via Supabase Realtime:

- **Snapshot broadcast** (`battle-broadcast-<siege>`) — the actively-simming client broadcasts a small battlefield snapshot (~5 Hz) and persists it (~2 Hz). A refreshed client enters *observing mode* and renders from these snapshots — units, towers, projectiles, and overlays — until it resolves the wave or is promoted back to simmer.
- **Presence** (`presence-<siege>`) — drives the "reconnecting…" indicator and the abandon-the-wait fallback for reward selection.
- **Postgres changes** — phase/outcome/queue updates reconcile both clients via CDC.

Determinism matters: anything affecting gameplay outcome is seeded from siege state (e.g. tower placement and the per-match tower matchup table are seeded from `siege.id`), so both clients derive identical results without a DB round-trip.

### Battle simulation (`src/`)

- `src/classes/` — plain-JS entity classes (`Unit` and concrete units, `Tower`, `Sprite`, projectiles).
- `src/data/` — static map / path / tower-placement data.
- `src/runtime/` — per-frame logic shared between the canvas renderer and tests:
  - `sim.js` — global `{ dt, speed }` written each frame and read by entity `updateFrame` methods.
  - `towerMatchups.js` — deterministic per-tower weakness/resistance table seeded from the siege.
  - `contribution.js`, `buffs.js`, `towerPlacement.js`, `leaderboard.js`.

> `src/classes/` and `src/runtime/` must stay free of browser-absolute imports and DOM/`window` references at module top level, since the tests import them directly in Node.

New gameplay work targets `battle/` (`game/` is the older solo sandbox).

## Running locally

No build step is required.

```bash
npm install
npx serve .
```

Then open `/login/login.html`. (`vercel.json` rewrites `/` → `/login/login` and enables `cleanUrls` in production.)

### Debug HUD

Append `?debug=1` (or `#debug`) to the battle URL on either client to overlay live sync state — phase, observing/simming, snapshot age, tower/unit counts, and reward-round state — useful for diagnosing refresh/disconnect behavior on each side.

## Tests

[Jest](https://jestjs.io/) (run with `--experimental-vm-modules` because the repo is `"type": "module"`). Tests import directly from `src/classes/` and `src/runtime/`.

```bash
npm test                          # run the whole suite
npm test -- tests/Unit.test.js    # a single file
npm test -- -t "matchup"          # by name pattern
```

CI (`.github/workflows/jest.yml`) runs `npm i && npm test` on PRs to `main` (Node 22.12.0).

## Deployment

Deployed on **Vercel** (live URL above). Static files only — `serve` is the single runtime dependency.

## Repo layout

```text
battle/  game/  lobby/  login/  roster/        page bundles (.html/.js/.css)
siege-setup/  leaderboard/  start-screen/
lib/                 shared browser modules (supabase client, units, session)
src/classes/         entity classes (Unit, Tower, Sprite, …)
src/data/            static map / path / tower data
src/runtime/         per-frame sim logic shared with tests
supabase-migrations/ numbered, authoritative SQL migrations
tests/               Jest suite
assets/              sprites, tilesets, effects
```
