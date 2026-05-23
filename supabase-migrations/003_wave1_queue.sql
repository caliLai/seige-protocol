-- ═══════════════════════════════════════════════
-- WAVE 1 QUEUE PHASE
-- After siege-setup locks in unit types, both players build an ordered
-- spawn queue for wave 1 (duplicates allowed, bounded by starting gold).
-- These columns are written from /wave-1/wave-1.js and consumed by
-- /game/game.js on entry.
--
-- Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════

alter table public.sieges
  add column if not exists host_wave1       text[]  not null default '{}',
  add column if not exists ally_wave1       text[]  not null default '{}',
  add column if not exists host_wave1_ready boolean not null default false,
  add column if not exists ally_wave1_ready boolean not null default false;

-- No new RLS policies needed — the existing UPDATE policy on public.sieges
-- already gates host/ally writes, and the DELETE policy from
-- 002_siege_setup.sql still applies for disband during this phase.
