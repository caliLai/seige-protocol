-- ═══════════════════════════════════════════════
-- PHASE TRANSITIONS  (fix for migration 008 fallout)
--
-- Migration 008 locked the `phase` column behind the
-- `sieges_block_battle` trigger, but two client paths still need to
-- advance the phase between rooms:
--   • siege-setup entry        : lobby  → setup   (so the lobby browser
--                                                  stops showing the row
--                                                  as joinable)
--   • battle entry             : setup  → prep    (so queue_unit's
--                                                  `phase in ('prep','battle')`
--                                                  check passes, and the
--                                                  player has gold to spend)
--
-- Both transitions used to be direct `UPDATE sieges SET phase = …`
-- writes; the trigger now rejects those with `battle_columns_locked`,
-- so we expose them as security-definer RPCs instead.
--
-- This migration also moves the **starting-gold seed** out of
-- start_wave_battle and into enter_prep_phase. That's a real bug fix,
-- not just a refactor: previously the gold was only written when both
-- players were ready and start_wave_battle fired. But the player needs
-- gold to spend BEFORE they're ready (that's the whole reason to queue
-- units). The old client UI papered over this by faking the balance
-- locally from a JS constant; now that the queue_unit RPC validates
-- against the actual row, the seed has to land at battle entry.
--
-- Run this once in the Supabase SQL editor, AFTER migration 008.
-- ═══════════════════════════════════════════════

-- ─── enter_setup_phase ─────────────────────────────────────────
-- Called by siege-setup.js on first entry (host only). Flips the row
-- from 'lobby' to 'setup' so the lobby browser stops listing it.
-- Idempotent: a no-op if the siege is already past 'lobby'.
create or replace function public.enter_setup_phase(p_siege uuid)
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
  if s.phase <> 'lobby' then return; end if;  -- idempotent
  update public.sieges set phase = 'setup' where id = p_siege;
end $$;

revoke all on function public.enter_setup_phase(uuid) from public;
grant execute on function public.enter_setup_phase(uuid) to authenticated;

-- ─── enter_prep_phase ──────────────────────────────────────────
-- Called by battle.js on load (either player — see below). Two jobs:
--   1. Advance phase to 'prep' if it isn't there yet.
--   2. Seed starting gold for both sides from difficulty_settings if
--      both columns are still at 0.
--
-- Seeding gold is the real bug fix: queue_unit needs `host_gold` /
-- `ally_gold` to be non-zero before the user clicks a unit card, but
-- the original gold-seed lived inside start_wave_battle (which fires
-- *after* the queue is built). Moving the seed here makes the gold
-- present from the moment battle.html mounts.
--
-- The seed condition is "both sides at 0", NOT "phase is setup". That
-- distinction matters for two cases:
--   • Legacy sieges that advanced phase before migration 008 was run
--     (so the row is in 'prep' / 'battle' but the seed never happened
--     because the direct write was silently failing).
--   • The host refreshes after the ally has already triggered seeding
--     — the row is 'prep' with gold > 0, so we skip the seed (good:
--     don't trample mid-queue balance).
--
-- Either player can call this. Originally restricted to host_only,
-- but if the host's first RPC races a slow connection the ally would
-- be stuck with 0 gold. Both sides racing is safe: the second caller
-- sees the gold non-zero under `FOR UPDATE` and the seed branch skips.
create or replace function public.enter_prep_phase(p_siege uuid)
returns table (
  phase text,
  host_gold int,
  ally_gold int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s    public.sieges%rowtype;
  gold int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id
     and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;

  -- Don't reach back from 'battle' or 'complete' to 'prep' — that would
  -- be a real regression of game state. From 'lobby' / 'setup' / 'prep'
  -- the seed-or-advance is safe.
  if s.phase in ('lobby', 'setup', 'prep') then
    -- Seed gold only if both sides are still at 0 (i.e. never seeded
    -- before). After someone has spent gold queueing, one side could
    -- legitimately read 0 — but the OTHER side would still be at
    -- starting_gold, so requiring BOTH at 0 distinguishes "never
    -- seeded" from "actively in the middle of a wave queue".
    if coalesce(s.host_gold, 0) = 0 and coalesce(s.ally_gold, 0) = 0 then
      select starting_gold into gold from public.difficulty_settings
        where difficulty = s.difficulty;
      if gold is null then gold := 250; end if;

      if s.phase = 'prep' then
        -- Already in prep, just need the seed
        update public.sieges set
          host_gold = gold,
          ally_gold = gold
        where id = p_siege;
      else
        -- Advance phase and seed in one shot
        update public.sieges set
          phase     = 'prep',
          host_gold = gold,
          ally_gold = gold
        where id = p_siege;
      end if;
    elsif s.phase <> 'prep' then
      -- Gold already seeded (somehow) but phase still behind — just
      -- bump the phase forward without touching the existing balance.
      update public.sieges set phase = 'prep' where id = p_siege;
    end if;
  end if;
  -- phase 'battle' / 'complete' → no-op (never roll back).

  return query
    select s2.phase, s2.host_gold, s2.ally_gold
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.enter_prep_phase(uuid) from public;
grant execute on function public.enter_prep_phase(uuid) to authenticated;

-- ─── start_wave_battle (replaced) ──────────────────────────────
-- Same RPC name as migration 008, but the gold-seeding branch is
-- removed: enter_prep_phase now owns that responsibility. This RPC
-- only flips 'prep' → 'battle' once both sides are ready. The 'setup'
-- → 'battle' path that the old version supported is gone — the host
-- must go through enter_prep_phase first (which battle.js does on
-- mount).
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
  update public.sieges set phase = 'battle' where id = p_siege;
end $$;

revoke all on function public.start_wave_battle(uuid) from public;
grant execute on function public.start_wave_battle(uuid) to authenticated;
