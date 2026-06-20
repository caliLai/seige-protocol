-- ═══════════════════════════════════════════════
-- TOWER-KILL SCORE — persistent, global
--
-- Adds a lifetime "tower points" score, separate from the roster-unlock
-- currency (profiles.points). A player earns 10 tower_points for every tower
-- their unit lands the killing blow on. The score persists across matches and
-- feeds the global all-time leaderboard (see global_leaderboard() below).
--
-- Like points / unlocked_units, tower_points is server-authoritative: clients
-- cannot write it directly (the currency-lock trigger blocks it); the only way
-- it changes is through the security-definer award_tower_points() RPC.
--
-- Run once in the Supabase SQL editor, after 014.
-- ═══════════════════════════════════════════════

-- 1. The score column.
alter table public.profiles
  add column if not exists tower_points int not null default 0
    check (tower_points >= 0);

-- 2. Extend the currency-lock trigger to also guard tower_points. Mirrors the
--    bypass-flag pattern from migration 007 so the award RPC can still write it.
create or replace function public.profiles_block_currency_writes()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_currency_write', true) = 'on' then
    return NEW;
  end if;

  if NEW.points is distinct from OLD.points
     or NEW.tower_points is distinct from OLD.tower_points
     or NEW.unlocked_units is distinct from OLD.unlocked_units then
    raise exception 'currency_columns_locked: use an award/purchase rpc';
  end if;
  return NEW;
end $$;

-- 3. Award 10 tower_points to the killing side's player. Host-only and
--    phase-guarded, matching award_tower_kill — the gold-award RPC fired from
--    the same 'tower-destroyed' event. p_team is the side ('host' | 'ally')
--    whose unit landed the killing blow; we map it to that siege's player.
create or replace function public.award_tower_points(p_siege uuid, p_team text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.sieges%rowtype;
  target_uid uuid;
  new_total  int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase <> 'battle' then raise exception 'wrong_phase: %', s.phase; end if;

  if p_team = 'host' then
    target_uid := s.host_id;
  elsif p_team = 'ally' then
    target_uid := s.ally_id;
  else
    raise exception 'invalid_team: %', p_team;
  end if;

  -- Ally seat may be empty on a solo siege; nothing to award then.
  if target_uid is null then
    return null;
  end if;

  perform set_config('app.allow_currency_write', 'on', true);

  update public.profiles
    set tower_points = tower_points + 10
  where user_id = target_uid
  returning tower_points into new_total;

  return new_total;
end $$;

revoke all on function public.award_tower_points(uuid, text) from public;
grant execute on function public.award_tower_points(uuid, text) to authenticated;

-- 4. Global all-time leaderboard read. Security-definer so it can rank ALL
--    players (bypassing per-row RLS) while exposing only username + score —
--    no need to widen the profiles SELECT policy. Ordered best-first.
create or replace function public.global_leaderboard(p_limit int default 50)
returns table (username text, tower_points int)
language sql
security definer
set search_path = public
stable
as $$
  select p.username, p.tower_points
  from public.profiles p
  where p.username is not null
  order by p.tower_points desc, p.username asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.global_leaderboard(int) from public;
grant execute on function public.global_leaderboard(int) to authenticated;
