-- ═══════════════════════════════════════════════
-- MAP-CLEAR SURVIVOR REFUND
--
-- Clearing a map carries the team's surviving units' worth onto the next map
-- so a run can't dead-end in a gold-starvation defeat. When a map is cleared
-- while BOTH sides are too broke to deploy on the next map, the client tallies
-- the deploy-gold value of each side's still-living units and hands it back as
-- battle gold for the next map (see computeMapClearRefund in battle.js).
--
-- The refund rides on advance_map rather than a separate RPC so it lands in the
-- SAME row update that flips phase → 'prep' (the next map's gold is correct the
-- instant the prep echo arrives, before checkGoldStarvation runs) AND inherits
-- advance_map's phase idempotency — both clients call it, but only the first
-- (phase still 'battle') applies the refund, so it can never double-credit.
--
-- p_host_refund / p_ally_refund default to 0, so callers that don't refund
-- (and the no-starvation case) behave exactly as before. Amounts are floored
-- at 0 server-side; the value itself is trusted from the simming client, the
-- same posture the rest of the client-side sim already takes (contribution,
-- outcome). Run once in the Supabase SQL editor, after 018.
-- ═══════════════════════════════════════════════

-- advance_map's signature changes (extra params), so drop the old 1-arg form
-- before recreating — CREATE OR REPLACE can't alter a function's arg list.
drop function if exists public.advance_map(uuid);

create or replace function public.advance_map(
  p_siege       uuid,
  p_host_refund int default 0,
  p_ally_refund int default 0
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

  if auth.uid() <> s.host_id
     and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;

  -- Idempotent: once the first caller flips us into prep, the racing second
  -- caller silently no-ops instead of double-advancing (and double-refunding).
  if s.phase <> 'battle' then return; end if;

  update public.sieges set
    map_index        = map_index + 1,
    current_wave     = 1,
    host_gold        = coalesce(host_gold, 0) + greatest(0, coalesce(p_host_refund, 0)),
    ally_gold        = coalesce(ally_gold, 0) + greatest(0, coalesce(p_ally_refund, 0)),
    host_queue       = '{}'::text[],
    ally_queue       = '{}'::text[],
    host_queue_ready = false,
    ally_queue_ready = false,
    phase            = 'prep',
    wave_started_at  = null
  where id = p_siege;
end $$;

revoke all on function public.advance_map(uuid, int, int) from public;
grant execute on function public.advance_map(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
