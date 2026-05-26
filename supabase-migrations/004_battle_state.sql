-- ═══════════════════════════════════════════════
-- BATTLE STATE
-- Adds the per-match runtime state the wave loop needs:
-- a phase cursor, wave counter, shared team lives, per-side battle gold,
-- per-wave queues, contribution JSONB per side, outcome, and ended_at.
--
-- The legacy wave-1-specific columns from migration 003 (host_wave1,
-- ally_wave1, host_wave1_ready, ally_wave1_ready) were dropped manually
-- after battle.js was switched to host_queue / ally_queue.
--
-- Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════

alter table public.sieges
  add column if not exists phase            text    not null default 'lobby'
    check (phase in ('lobby','setup','prep','battle','complete')),
  add column if not exists current_wave     int     not null default 1
    check (current_wave >= 1),
  add column if not exists total_waves      int     not null default 15
    check (total_waves >= 1 and total_waves <= 50),
  add column if not exists team_lives       int     not null default 12
    check (team_lives >= 0),
  add column if not exists host_gold        int     not null default 0
    check (host_gold >= 0),
  add column if not exists ally_gold        int     not null default 0
    check (ally_gold >= 0),
  add column if not exists host_queue       text[]  not null default '{}',
  add column if not exists ally_queue       text[]  not null default '{}',
  add column if not exists host_queue_ready boolean not null default false,
  add column if not exists ally_queue_ready boolean not null default false,
  add column if not exists host_contribution jsonb  not null default '{}'::jsonb,
  add column if not exists ally_contribution jsonb  not null default '{}'::jsonb,
  add column if not exists outcome          text
    check (outcome in ('victory','defeat')),
  add column if not exists ended_at         timestamptz;

-- Lobby browser only ever shows sieges in the 'lobby' phase. Partial index
-- keeps the lookup cheap as completed/in-progress sieges accumulate.
create index if not exists sieges_phase_idx on public.sieges (phase)
  where phase = 'lobby';

-- No RLS changes — the existing UPDATE policy
-- (auth.uid() = host_id or auth.uid() = ally_id)
-- already covers the new mirrored columns. Team-level columns
-- (phase, current_wave, team_lives, outcome, ended_at) are writable by
-- either party today; ended_at is overwritten by award_match_points()
-- in migration 006 to enforce single-payout idempotency.
