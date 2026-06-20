-- ═══════════════════════════════════════════════
-- MAP PROGRESSION
--
-- A siege run now spans multiple maps (calista → arshdeep → eric). Clearing
-- every tower on a map within the wave/lives limit advances to the next map;
-- clearing the last map is the run victory (handled by set_match_outcome as
-- before). map_index is the 0-based position in that sequence.
--
-- advance_map mirrors advance_wave: any player may call it, it's idempotent on
-- phase (the racing client's call no-ops once phase flips to 'prep'), it bumps
-- map_index, resets the wave counter, and clears both queues so the next map
-- starts fresh in prep. Gold carries over between maps on purpose.
--
-- Run once in the Supabase SQL editor, after 015.
-- ═══════════════════════════════════════════════

alter table public.sieges
  add column if not exists map_index int not null default 0
    check (map_index >= 0);

create or replace function public.advance_map(p_siege uuid)
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

  -- Idempotent: once the first caller flips us into prep, the racing
  -- second caller silently no-ops instead of double-advancing.
  if s.phase <> 'battle' then return; end if;

  update public.sieges set
    map_index        = map_index + 1,
    current_wave     = 1,
    host_queue       = '{}'::text[],
    ally_queue       = '{}'::text[],
    host_queue_ready = false,
    ally_queue_ready = false,
    phase            = 'prep',
    wave_started_at  = null
  where id = p_siege;
end $$;

revoke all on function public.advance_map(uuid) from public;
grant execute on function public.advance_map(uuid) to authenticated;
