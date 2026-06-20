-- ═══════════════════════════════════════════════
-- REWARD GOLD (tower-destruction reward popup)
--
-- When a tower falls, each player picks one of three reward cards. If they
-- pick the gold card, the client calls award_reward_gold with the amount shown
-- on the card (a per-tower seeded 50–150). The server clamps to [50,150] and
-- adds it to the CALLER's battle gold only — this is a co-op game, so each
-- player's pick rewards themselves. Buff picks are handled client-side (no
-- gold), so they don't touch this RPC.
--
-- Mirrors award_tower_kill's battle-RPC guard. Run once after 016.
-- ═══════════════════════════════════════════════

create or replace function public.award_reward_gold(p_siege uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.sieges%rowtype;
  amt   int;
  newg  int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;

  if auth.uid() <> s.host_id
     and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;
  if s.phase <> 'battle' then raise exception 'wrong_phase: %', s.phase; end if;

  amt := least(150, greatest(50, coalesce(p_amount, 50)));

  if auth.uid() = s.host_id then
    update public.sieges set host_gold = coalesce(host_gold, 0) + amt
      where id = p_siege returning host_gold into newg;
  else
    update public.sieges set ally_gold = coalesce(ally_gold, 0) + amt
      where id = p_siege returning ally_gold into newg;
  end if;

  return newg;
end $$;

revoke all on function public.award_reward_gold(uuid, int) from public;
grant execute on function public.award_reward_gold(uuid, int) to authenticated;
