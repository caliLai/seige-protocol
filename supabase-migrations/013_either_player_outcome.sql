-- ═══════════════════════════════════════════════
-- 013_either_player_outcome
-- Relaxes set_match_outcome from host-only to either-player. The
-- host_only rule was originally there so contribution.host /
-- contribution.ally are written from a single deterministic client.
-- That guarantee breaks anyway in the refresh-recovery case: both
-- peers refresh, both promote off the last DB snapshot, both run
-- independent local sims, and the host's reconstructed sim may not
-- happen to reach victory even when the ally's does. With host-only
-- the ally then sees a local overlay but the DB outcome never
-- updates — match hangs.
--
-- Acceptable trade-off: contribution.* comes from whichever client
-- wins the race (idempotent on phase='complete' so the second call
-- no-ops). Payout is still server-validated by award_match_points;
-- both clients receive the same total points either way.
-- ═══════════════════════════════════════════════

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

  -- Was: host_only. Now: any player on this siege.
  if auth.uid() <> s.host_id
     and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;

  if p_outcome not in ('victory','defeat') then raise exception 'invalid_outcome'; end if;
  if s.phase = 'complete' then return; end if;  -- idempotent

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

notify pgrst, 'reload schema';
