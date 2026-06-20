-- ═══════════════════════════════════════════════
-- SOLO WAVE START
--
-- Normally start_wave_battle requires BOTH sides ready. But if one player is
-- broke (no gold, nothing queued) they can't lock in, which would softlock the
-- wave. start_wave_solo lets the solvent, ready player launch the wave alone:
-- the caller must be ready, and the OTHER side must have an empty queue (i.e.
-- it has nothing to deploy this wave). Callable by EITHER player, since the
-- broke one might be the host.
--
-- The client only calls this when it has determined the other side is broke
-- (gold below the cheapest deployable unit); the empty-queue check here is the
-- server-side guard so it can't be used to cut off a teammate who has units.
--
-- Run once after 017.
-- ═══════════════════════════════════════════════

create or replace function public.start_wave_solo(p_siege uuid)
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
  if s.phase = 'battle' then return; end if;            -- idempotent
  if s.phase <> 'prep' then raise exception 'wrong_phase: %', s.phase; end if;

  if auth.uid() = s.host_id then
    if not s.host_queue_ready then raise exception 'not_ready'; end if;
    if coalesce(array_length(s.ally_queue, 1), 0) <> 0 then raise exception 'other_has_units'; end if;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    if not s.ally_queue_ready then raise exception 'not_ready'; end if;
    if coalesce(array_length(s.host_queue, 1), 0) <> 0 then raise exception 'other_has_units'; end if;
  else
    raise exception 'not_a_player';
  end if;

  update public.sieges set
    phase           = 'battle',
    wave_started_at = now()
  where id = p_siege;
end $$;

revoke all on function public.start_wave_solo(uuid) from public;
grant execute on function public.start_wave_solo(uuid) to authenticated;
