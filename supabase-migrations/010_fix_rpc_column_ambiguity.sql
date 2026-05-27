-- ═══════════════════════════════════════════════
-- FIX RPC COLUMN AMBIGUITY  (migration 008 follow-up)
--
-- queue_unit, dequeue_unit, and award_tower_kill all declare a
-- `RETURNS TABLE (host_queue text[], host_gold int, ...)` whose
-- column names collide with the same-named columns on public.sieges.
-- Inside the function body, an UPDATE like
--   set host_queue = array_append(host_queue, p_unit)
-- has an unqualified `host_queue` on the RHS that Postgres can't
-- disambiguate between the OUT parameter and the table column,
-- raising:
--   ERROR: column reference "host_queue" is ambiguous
--
-- The fix is to compute every new value into a local PL/pgSQL
-- variable up front, then reference only the variables inside SET.
-- No client-visible behaviour changes — the RPCs still return the
-- same shape, still take the same arguments, still raise the same
-- exception codes. Only the body is refactored to avoid the
-- name collision.
--
-- Run this once in the Supabase SQL editor, AFTER migration 008.
-- (Order with 009 doesn't matter; 010 only touches the three RPCs.)
-- ═══════════════════════════════════════════════

-- ─── queue_unit (fixed) ────────────────────────────────────────
create or replace function public.queue_unit(p_siege uuid, p_unit text)
returns table (
  host_gold int, ally_gold int,
  host_queue text[], ally_queue text[],
  host_queue_ready boolean, ally_queue_ready boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.sieges%rowtype;
  side      text;
  cost      int;
  cap       int;
  my_q      text[];
  my_g      int;
  my_t      text[];
  new_q     text[];   -- pre-computed new queue, used in SET to dodge
                      -- the OUT-parameter-vs-column ambiguity
  new_g     int;      -- same trick for gold
begin
  perform set_config('app.battle_rpc', 'on', true);

  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if s.phase not in ('prep','battle') then
    raise exception 'wrong_phase: %', s.phase;
  end if;

  if auth.uid() = s.host_id then
    side := 'host'; my_q := s.host_queue; my_g := s.host_gold; my_t := s.host_units;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    side := 'ally'; my_q := s.ally_queue; my_g := s.ally_gold; my_t := s.ally_units;
  else
    raise exception 'not_a_player';
  end if;

  if not (p_unit = any(my_t)) then
    raise exception 'unit_not_owned: %', p_unit;
  end if;

  select uc.deploy_cost into cost from public.unit_catalog uc where uc.id = p_unit;
  if cost is null then raise exception 'unknown_unit: %', p_unit; end if;

  select ds.queue_cap into cap from public.difficulty_settings ds
    where ds.difficulty = s.difficulty;
  if cap is null then cap := 8; end if;

  if coalesce(array_length(my_q, 1), 0) >= cap then
    raise exception 'queue_full: cap=%', cap;
  end if;
  if my_g < cost then
    raise exception 'insufficient_gold: have=% need=%', my_g, cost;
  end if;

  -- All RHS values come from local variables now — no column refs.
  new_q := array_append(my_q, p_unit);
  new_g := my_g - cost;

  if side = 'host' then
    update public.sieges set
      host_queue       = new_q,
      host_gold        = new_g,
      host_queue_ready = false
    where id = p_siege;
  else
    update public.sieges set
      ally_queue       = new_q,
      ally_gold        = new_g,
      ally_queue_ready = false
    where id = p_siege;
  end if;

  -- Alias columns to their parameter names so the OUT-vs-column
  -- mapping is unambiguous on the RETURN side too.
  return query
    select s2.host_gold, s2.ally_gold,
           s2.host_queue, s2.ally_queue,
           s2.host_queue_ready, s2.ally_queue_ready
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.queue_unit(uuid, text) from public;
grant execute on function public.queue_unit(uuid, text) to authenticated;

-- ─── dequeue_unit (fixed) ──────────────────────────────────────
create or replace function public.dequeue_unit(p_siege uuid, p_idx int)
returns table (
  host_gold int, ally_gold int,
  host_queue text[], ally_queue text[],
  host_queue_ready boolean, ally_queue_ready boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.sieges%rowtype;
  side      text;
  my_q      text[];
  my_g      int;
  unit_id   text;
  refund    int;
  new_q     text[];
  new_g     int;
begin
  perform set_config('app.battle_rpc', 'on', true);

  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if s.phase not in ('prep','battle') then
    raise exception 'wrong_phase: %', s.phase;
  end if;

  if auth.uid() = s.host_id then
    side := 'host'; my_q := s.host_queue; my_g := s.host_gold;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    side := 'ally'; my_q := s.ally_queue; my_g := s.ally_gold;
  else
    raise exception 'not_a_player';
  end if;

  if p_idx < 0 or p_idx >= coalesce(array_length(my_q, 1), 0) then
    raise exception 'index_out_of_range: idx=% len=%', p_idx, coalesce(array_length(my_q, 1), 0);
  end if;
  unit_id := my_q[p_idx + 1];

  select uc.deploy_cost into refund from public.unit_catalog uc where uc.id = unit_id;
  if refund is null then refund := 0; end if;

  new_q := my_q[1:p_idx] || my_q[p_idx + 2:array_length(my_q, 1)];
  new_g := my_g + refund;

  if side = 'host' then
    update public.sieges set
      host_queue       = new_q,
      host_gold        = new_g,
      host_queue_ready = false
    where id = p_siege;
  else
    update public.sieges set
      ally_queue       = new_q,
      ally_gold        = new_g,
      ally_queue_ready = false
    where id = p_siege;
  end if;

  return query
    select s2.host_gold, s2.ally_gold,
           s2.host_queue, s2.ally_queue,
           s2.host_queue_ready, s2.ally_queue_ready
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.dequeue_unit(uuid, int) from public;
grant execute on function public.dequeue_unit(uuid, int) to authenticated;

-- ─── award_tower_kill (fixed) ──────────────────────────────────
create or replace function public.award_tower_kill(p_siege uuid)
returns table (host_gold int, ally_gold int)
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.sieges%rowtype;
  reward     int;
  new_host_g int;
  new_ally_g int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase <> 'battle' then raise exception 'wrong_phase: %', s.phase; end if;

  select ds.tower_kill_reward into reward from public.difficulty_settings ds
    where ds.difficulty = s.difficulty;
  if reward is null then reward := 80; end if;

  new_host_g := greatest(0, coalesce(s.host_gold, 0) + reward);
  new_ally_g := greatest(0, coalesce(s.ally_gold, 0) + reward);

  update public.sieges set
    host_gold = new_host_g,
    ally_gold = new_ally_g
  where id = p_siege;

  return query select s2.host_gold, s2.ally_gold
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.award_tower_kill(uuid) from public;
grant execute on function public.award_tower_kill(uuid) to authenticated;
