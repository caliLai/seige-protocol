-- ═══════════════════════════════════════════════
-- WAVE-IN-PROGRESS MARKER  (refresh-resilient combat)
--
-- Bug this fixes: when a player refreshes battle.html while a wave is
-- actively running, their client has no way to know "a wave is in
-- progress on the other client" so its local sim re-spawns the queue
-- from scratch. The other client sees the original wave running
-- normally; the refreshed client sees a fresh wave start over. Two
-- diverging sims, same siege.
--
-- Fix: add a server-side `wave_started_at` timestamp. The host's
-- start_wave_battle RPC sets it; advance_wave and set_match_outcome
-- clear it. On battle.html mount the client checks the row — if
-- wave_started_at is non-null, the wave is already in progress on
-- the other client and we MUST NOT re-spawn. We wait silently for
-- the realtime echo of the wave's resolution (gold updates, phase
-- flip back to 'prep', or outcome set) to catch us up.
--
-- Also: advance_wave is relaxed from host-only to either-player. If
-- the HOST refreshes mid-wave, the ally's sim is the only one that
-- finishes the wave, so the ally needs to be able to bump the wave
-- counter. Idempotent on phase — if both players' sims race to call
-- it, the second sees phase != 'battle' and no-ops instead of
-- double-bumping current_wave.
--
-- set_match_outcome stays host-only on purpose: relaxing it would mean
-- contribution.host / contribution.ally come from whichever client
-- called first, and their views of the OTHER side's contribution
-- could diverge slightly (different deltaTime between clients).
-- Keeping it host-only keeps the payout deterministic. Trade-off: if
-- the host refreshes on the FINAL wave, the match hangs until they
-- abandon. Acceptable for now.
--
-- Run this once in the Supabase SQL editor, AFTER migration 010.
-- ═══════════════════════════════════════════════

-- ─── COLUMN ─────────────────────────────────────────────────
alter table public.sieges
  add column if not exists wave_started_at timestamptz;

-- ─── TRIGGER (replaced — adds wave_started_at to locked list) ───
-- Without this update, the new column would be client-writable —
-- a tampered client could just clear or set the timestamp from
-- devtools, bypassing the whole refresh-recovery path.
create or replace function public.sieges_block_battle_writes()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.battle_rpc', true) = 'on' then
    return NEW;
  end if;

  if NEW.host_gold          is distinct from OLD.host_gold          or
     NEW.ally_gold          is distinct from OLD.ally_gold          or
     NEW.host_queue         is distinct from OLD.host_queue         or
     NEW.ally_queue         is distinct from OLD.ally_queue         or
     NEW.host_queue_ready   is distinct from OLD.host_queue_ready   or
     NEW.ally_queue_ready   is distinct from OLD.ally_queue_ready   or
     NEW.current_wave       is distinct from OLD.current_wave       or
     NEW.phase              is distinct from OLD.phase               or
     NEW.outcome            is distinct from OLD.outcome             or
     NEW.host_contribution  is distinct from OLD.host_contribution   or
     NEW.ally_contribution  is distinct from OLD.ally_contribution  or
     NEW.wave_started_at    is distinct from OLD.wave_started_at then
    raise exception 'battle_columns_locked: use the battle RPCs '
      '(queue_unit, dequeue_unit, lock_in_wave, unlock_wave, '
      'enter_setup_phase, enter_prep_phase, start_wave_battle, '
      'award_tower_kill, advance_wave, set_match_outcome)';
  end if;
  return NEW;
end $$;

-- ─── start_wave_battle (replaced — sets wave_started_at) ────
create or replace function public.start_wave_battle(p_siege uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.sieges%rowtype;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase = 'battle' then return; end if;          -- idempotent
  if s.phase <> 'prep' then
    raise exception 'wrong_phase: %', s.phase;
  end if;
  if not (s.host_queue_ready and s.ally_queue_ready) then
    raise exception 'not_both_ready';
  end if;
  update public.sieges set
    phase           = 'battle',
    wave_started_at = now()      -- ← refresh-recovery marker
  where id = p_siege;
end $$;

revoke all on function public.start_wave_battle(uuid) from public;
grant execute on function public.start_wave_battle(uuid) to authenticated;

-- ─── advance_wave (replaced — either player, clears marker) ─
-- Relaxed from host-only because if the host refreshes mid-wave,
-- only the ally's sim is left to call this when the wave resolves.
-- The phase check below makes it idempotent: if both clients race
-- to call after their local sim hits wave-failed, the second sees
-- phase != 'battle' and silently no-ops instead of double-bumping.
create or replace function public.advance_wave(p_siege uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.sieges%rowtype;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;

  -- Caller must be a player on this siege (not host-only any more).
  if auth.uid() <> s.host_id
     and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;

  -- Idempotent: silently no-op if the wave already advanced (the
  -- other client beat us to it). Was a raise before — now a return
  -- so racing clients don't show spurious error alerts.
  if s.phase <> 'battle' then return; end if;

  if s.current_wave >= s.total_waves then
    raise exception 'final_wave_no_advance';
  end if;

  update public.sieges set
    current_wave     = current_wave + 1,
    host_queue       = '{}'::text[],
    ally_queue       = '{}'::text[],
    host_queue_ready = false,
    ally_queue_ready = false,
    phase            = 'prep',
    wave_started_at  = null     -- ← clear marker; next wave fresh
  where id = p_siege;
end $$;

revoke all on function public.advance_wave(uuid) from public;
grant execute on function public.advance_wave(uuid) to authenticated;

-- ─── set_match_outcome (replaced — clears marker) ──────────
-- Stays host-only (see migration header for rationale). Only change
-- vs migration 008 is the wave_started_at = null in the UPDATE.
create or replace function public.set_match_outcome(
  p_siege             uuid,
  p_outcome           text,
  p_host_contribution jsonb,
  p_ally_contribution jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.sieges%rowtype;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if p_outcome not in ('victory','defeat') then raise exception 'invalid_outcome'; end if;
  if s.phase = 'complete' then return; end if;

  update public.sieges set
    outcome           = p_outcome,
    host_contribution = coalesce(p_host_contribution, '{}'::jsonb),
    ally_contribution = coalesce(p_ally_contribution, '{}'::jsonb),
    phase             = 'complete',
    wave_started_at   = null
  where id = p_siege;
end $$;

revoke all on function public.set_match_outcome(uuid, text, jsonb, jsonb) from public;
grant execute on function public.set_match_outcome(uuid, text, jsonb, jsonb) to authenticated;
