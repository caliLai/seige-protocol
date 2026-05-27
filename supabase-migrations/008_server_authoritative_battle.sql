-- ═══════════════════════════════════════════════
-- SERVER-AUTHORITATIVE BATTLE STATE
--
-- Before this migration, the battle-state columns on public.sieges were
-- client-writable. RLS gated *who* could write a row (host writes the
-- host_* columns, ally writes the ally_* columns) but never validated the
-- *values*, so a tampered client could:
--   • mint gold        — write host_gold = 999999
--   • queue for free   — append units without debiting gold
--   • queue unowned    — queue a unit not in host_units
--   • exceed the cap   — push past queue_cap
--   • forge victory    — write outcome = 'victory' on a loss
--   • inflate payout   — write a huge damage_dealt into host_contribution
--   • skip waves       — set current_wave = total_waves
--
-- This migration locks every battle-runtime column from direct client
-- writes and exposes the legitimate mutations as security-definer RPCs
-- that re-derive every cost / cap / wave delta from server-side state.
--
-- LIMITATION: combat simulation (tower damage, unit deaths) still runs
-- on the client. Server-side simulation would need a complete rewrite
-- (deterministic tick loop, broadcast state, lag compensation). What
-- this migration *does* prevent: clients freely editing the persisted
-- match state. What it *does not* prevent: the host's simulation lying
-- about how much damage they dealt (host_contribution.damage_dealt).
-- Mitigating that requires either server simulation or
-- cross-validation between the two clients' contribution streams —
-- both out of scope here.
--
-- Run this once in the Supabase SQL editor, AFTER migration 007.
-- ═══════════════════════════════════════════════

-- ─────────────────────────────────────────────────
-- 1) SERVER-SIDE UNIT CATALOG
-- ─────────────────────────────────────────────────
-- The deploy cost lives in lib/units.js as a derived formula:
--   deployCost = max(10, round((hp + damage*5)/10 / 5) * 5)
-- We materialise it into a table so the server can validate without
-- trusting the client's price tag. If lib/units.js changes, re-run the
-- seed block at the bottom of this file (or maintain a sync job).

create table if not exists public.unit_catalog (
  id           text    primary key,
  deploy_cost  int     not null check (deploy_cost > 0),
  hp           int     not null check (hp > 0),
  damage       int     not null check (damage > 0),
  speed        int     not null check (speed > 0)
);

-- Read-only for clients (the JS catalog is still the UI source of truth;
-- this table only exists so the RPCs can validate purchases).
alter table public.unit_catalog enable row level security;
drop policy if exists unit_catalog_select_all on public.unit_catalog;
create policy unit_catalog_select_all on public.unit_catalog
  for select using (true);

-- ─────────────────────────────────────────────────
-- 2) DIFFICULTY SETTINGS
-- ─────────────────────────────────────────────────
-- Mirrors STARTING_GOLD / QUEUE_CAP / per-tower reward from battle.js.
-- Pulling these from a table lets balance tweaks happen in SQL without
-- a redeploy and removes "trust the client's starting gold" entirely.

create table if not exists public.difficulty_settings (
  difficulty       text    primary key
    check (difficulty in ('recruit','veteran','elite')),
  starting_gold    int     not null check (starting_gold > 0),
  queue_cap        int     not null check (queue_cap > 0),
  tower_kill_reward int    not null check (tower_kill_reward > 0)
);

insert into public.difficulty_settings (difficulty, starting_gold, queue_cap, tower_kill_reward) values
  ('recruit', 300, 10, 80),
  ('veteran', 250, 8,  80),
  ('elite',   200, 6,  80)
on conflict (difficulty) do update set
  starting_gold     = excluded.starting_gold,
  queue_cap         = excluded.queue_cap,
  tower_kill_reward = excluded.tower_kill_reward;

alter table public.difficulty_settings enable row level security;
drop policy if exists difficulty_settings_select_all on public.difficulty_settings;
create policy difficulty_settings_select_all on public.difficulty_settings
  for select using (true);

-- ─────────────────────────────────────────────────
-- 3) BLOCK DIRECT WRITES TO BATTLE-RUNTIME COLUMNS
-- ─────────────────────────────────────────────────
-- The trigger fires on every UPDATE and raises if any of the locked
-- columns changed. RPCs in section 4 set the session-local flag
-- `app.battle_rpc` to bypass the trigger for their own writes; clients
-- never get a chance to set that flag because it's only set inside the
-- security-definer functions, which run as the table owner.

create or replace function public.sieges_block_battle_writes()
returns trigger
language plpgsql
as $$
begin
  -- Escape hatch for RPCs (set inside the function, scoped to the
  -- transaction via the `true` third arg to set_config).
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
     NEW.ally_contribution  is distinct from OLD.ally_contribution then
    raise exception 'battle_columns_locked: use the battle RPCs '
      '(queue_unit, dequeue_unit, lock_in_wave, unlock_wave, '
      'start_wave_battle, award_tower_kill, advance_wave, '
      'set_match_outcome)';
  end if;
  return NEW;
end $$;

drop trigger if exists sieges_block_battle on public.sieges;
create trigger sieges_block_battle
  before update on public.sieges
  for each row
  -- Only fires for authenticated client writes. Internal jobs running as
  -- the service role bypass via the same `app.battle_rpc` flag.
  when (auth.uid() is not null)
  execute function public.sieges_block_battle_writes();

-- ─────────────────────────────────────────────────
-- 4) RPCs — the only legitimate way to mutate battle state
-- ─────────────────────────────────────────────────

-- Shared helper to resolve the caller's side on a siege. Raises if the
-- caller is neither host nor ally. Inlined into each RPC below to keep
-- this migration self-contained.
--
-- (Implemented inline as a CASE; PL/pgSQL function call overhead is real
-- and these RPCs run on every queue click.)

-- ─── queue_unit ────────────────────────────────────────────────
-- Atomically: validate the unit is one of the caller's three picks,
-- check the queue isn't capped, check the caller has enough gold,
-- debit the gold, append the unit, and clear the ready flag so the
-- partner sees that the queue changed.
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
  s      public.sieges%rowtype;
  side   text;
  cost   int;
  cap    int;
  my_q   text[];
  my_g   int;
  my_t   text[];
begin
  perform set_config('app.battle_rpc', 'on', true);

  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;

  -- Queueing is only valid in the prep (between-waves) and battle phases.
  -- During 'lobby' and 'setup' the queue doesn't even exist yet.
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

  -- Ownership: must be one of the three unit types this side picked
  -- during siege-setup. Pre-this check, a tampered client could queue
  -- any unit in the global catalog regardless of their roster.
  if not (p_unit = any(my_t)) then
    raise exception 'unit_not_owned: %', p_unit;
  end if;

  -- Server-side cost lookup. The client's deployCost() formula is
  -- mirrored as a column in unit_catalog so we never have to trust the
  -- price the client claims to be paying.
  select deploy_cost into cost from public.unit_catalog where id = p_unit;
  if cost is null then raise exception 'unknown_unit: %', p_unit; end if;

  select queue_cap into cap from public.difficulty_settings
    where difficulty = s.difficulty;
  if cap is null then cap := 8; end if;

  if coalesce(array_length(my_q, 1), 0) >= cap then
    raise exception 'queue_full: cap=%', cap;
  end if;
  if my_g < cost then
    raise exception 'insufficient_gold: have=% need=%', my_g, cost;
  end if;

  if side = 'host' then
    update public.sieges set
      host_queue = array_append(host_queue, p_unit),
      host_gold  = host_gold - cost,
      host_queue_ready = false
    where id = p_siege;
  else
    update public.sieges set
      ally_queue = array_append(ally_queue, p_unit),
      ally_gold  = ally_gold - cost,
      ally_queue_ready = false
    where id = p_siege;
  end if;

  return query
    select s2.host_gold, s2.ally_gold,
           s2.host_queue, s2.ally_queue,
           s2.host_queue_ready, s2.ally_queue_ready
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.queue_unit(uuid, text) from public;
grant execute on function public.queue_unit(uuid, text) to authenticated;

-- ─── dequeue_unit ──────────────────────────────────────────────
-- Remove the unit at index p_idx, refund its server-derived cost,
-- and clear ready. Idempotent in the sense that an out-of-range
-- index just raises (no silent state corruption).
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
  s      public.sieges%rowtype;
  side   text;
  my_q   text[];
  unit_id text;
  refund int;
  new_q  text[];
begin
  perform set_config('app.battle_rpc', 'on', true);

  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if s.phase not in ('prep','battle') then
    raise exception 'wrong_phase: %', s.phase;
  end if;

  if auth.uid() = s.host_id then
    side := 'host'; my_q := s.host_queue;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    side := 'ally'; my_q := s.ally_queue;
  else
    raise exception 'not_a_player';
  end if;

  -- PostgreSQL arrays are 1-indexed; the JS client passes 0-indexed.
  -- p_idx comes in as 0-indexed and we map here so the client doesn't
  -- have to care about the impedance mismatch.
  if p_idx < 0 or p_idx >= coalesce(array_length(my_q, 1), 0) then
    raise exception 'index_out_of_range: idx=% len=%', p_idx, coalesce(array_length(my_q, 1), 0);
  end if;
  unit_id := my_q[p_idx + 1];

  select deploy_cost into refund from public.unit_catalog where id = unit_id;
  if refund is null then refund := 0; end if;

  -- array_remove drops every occurrence — we want to drop *only the one
  -- at this index*, so rebuild via slice concatenation.
  new_q := my_q[1:p_idx] || my_q[p_idx + 2:array_length(my_q, 1)];

  if side = 'host' then
    update public.sieges set
      host_queue = new_q,
      host_gold  = host_gold + refund,
      host_queue_ready = false
    where id = p_siege;
  else
    update public.sieges set
      ally_queue = new_q,
      ally_gold  = ally_gold + refund,
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

-- ─── lock_in_wave / unlock_wave ────────────────────────────────
-- Setting ready also requires a non-empty queue (otherwise a player
-- could lock in with no units, letting the wave start on a "free" side).
create or replace function public.lock_in_wave(p_siege uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sieges%rowtype;
  my_q text[];
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if s.phase not in ('prep','battle') then raise exception 'wrong_phase: %', s.phase; end if;

  if auth.uid() = s.host_id then
    my_q := s.host_queue;
    if coalesce(array_length(my_q, 1), 0) = 0 then raise exception 'empty_queue'; end if;
    update public.sieges set host_queue_ready = true where id = p_siege;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    my_q := s.ally_queue;
    if coalesce(array_length(my_q, 1), 0) = 0 then raise exception 'empty_queue'; end if;
    update public.sieges set ally_queue_ready = true where id = p_siege;
  else
    raise exception 'not_a_player';
  end if;
end $$;

revoke all on function public.lock_in_wave(uuid) from public;
grant execute on function public.lock_in_wave(uuid) to authenticated;

create or replace function public.unlock_wave(p_siege uuid)
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
  if auth.uid() = s.host_id then
    update public.sieges set host_queue_ready = false where id = p_siege;
  elsif s.ally_id is not null and auth.uid() = s.ally_id then
    update public.sieges set ally_queue_ready = false where id = p_siege;
  else
    raise exception 'not_a_player';
  end if;
end $$;

revoke all on function public.unlock_wave(uuid) from public;
grant execute on function public.unlock_wave(uuid) to authenticated;

-- ─── start_wave_battle ─────────────────────────────────────────
-- Host-only. Flips phase from 'prep' (or 'setup' on the very first
-- wave) into 'battle'. On the first wave it also seeds each side's
-- starting gold from difficulty_settings — clients can no longer claim
-- "I started with 999999 gold". Idempotent: calling on an
-- already-'battle' siege is a no-op rather than an error so a slow
-- realtime echo doesn't break either client.
create or replace function public.start_wave_battle(p_siege uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s   public.sieges%rowtype;
  gold int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase = 'battle' then return; end if;  -- idempotent
  if s.phase not in ('setup','prep') then
    raise exception 'wrong_phase: %', s.phase;
  end if;

  -- Both sides must be ready. Lobby-level RLS already prevents non-players
  -- from getting this far; this is the contract check.
  if not (s.host_queue_ready and s.ally_queue_ready) then
    raise exception 'not_both_ready';
  end if;

  -- First-wave gold seed. Subsequent waves keep whatever gold survived
  -- the previous one (carry-over is the whole point of having a gold
  -- column on the row).
  if s.current_wave = 1 and (coalesce(s.host_gold, 0) = 0 and coalesce(s.ally_gold, 0) = 0) then
    select starting_gold into gold from public.difficulty_settings
      where difficulty = s.difficulty;
    if gold is null then gold := 250; end if;
    update public.sieges set
      phase     = 'battle',
      host_gold = gold,
      ally_gold = gold
    where id = p_siege;
  else
    update public.sieges set phase = 'battle' where id = p_siege;
  end if;
end $$;

revoke all on function public.start_wave_battle(uuid) from public;
grant execute on function public.start_wave_battle(uuid) to authenticated;

-- ─── award_tower_kill ──────────────────────────────────────────
-- Host-only. Adds the per-difficulty tower-kill reward to BOTH sides
-- (game-flow §10: both players bank tower-kill gold). The reward
-- amount comes from difficulty_settings — clients no longer get to
-- write any value they like.
create or replace function public.award_tower_kill(p_siege uuid)
returns table (host_gold int, ally_gold int)
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.sieges%rowtype;
  reward int;
begin
  perform set_config('app.battle_rpc', 'on', true);
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase <> 'battle' then raise exception 'wrong_phase: %', s.phase; end if;

  select tower_kill_reward into reward from public.difficulty_settings
    where difficulty = s.difficulty;
  if reward is null then reward := 80; end if;

  update public.sieges set
    host_gold = greatest(0, host_gold + reward),
    ally_gold = greatest(0, ally_gold + reward)
  where id = p_siege;

  return query select s2.host_gold, s2.ally_gold
    from public.sieges s2 where s2.id = p_siege;
end $$;

revoke all on function public.award_tower_kill(uuid) from public;
grant execute on function public.award_tower_kill(uuid) to authenticated;

-- ─── advance_wave ──────────────────────────────────────────────
-- Host-only. Called when a wave failed but the match isn't lost yet
-- (current_wave < total_waves). Bumps the wave counter by exactly 1,
-- clears both queues and ready flags, and flips phase back to 'prep'.
-- The +1 constraint prevents a tampered host from skipping ahead to
-- the easy waves or jumping straight to the final wave.
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
  if auth.uid() <> s.host_id then raise exception 'host_only'; end if;
  if s.phase <> 'battle' then raise exception 'wrong_phase: %', s.phase; end if;
  if s.current_wave >= s.total_waves then raise exception 'final_wave_no_advance'; end if;

  update public.sieges set
    current_wave     = current_wave + 1,
    host_queue       = '{}'::text[],
    ally_queue       = '{}'::text[],
    host_queue_ready = false,
    ally_queue_ready = false,
    phase            = 'prep'
  where id = p_siege;
end $$;

revoke all on function public.advance_wave(uuid) from public;
grant execute on function public.advance_wave(uuid) to authenticated;

-- ─── set_match_outcome ─────────────────────────────────────────
-- Host-only. Writes the terminal state: outcome ('victory' | 'defeat'),
-- both contribution JSONBs, and phase = 'complete'. The contribution
-- values are still trusted from the host (combat sim is client-side —
-- see top-of-file LIMITATION note); future work could cross-validate
-- against the ally's local sim before accepting them.
--
-- Idempotent: a second call on an already-'complete' siege is a no-op
-- so a slow realtime echo on the ally side doesn't blow up.
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
  if s.phase = 'complete' then return; end if;  -- idempotent

  update public.sieges set
    outcome           = p_outcome,
    host_contribution = coalesce(p_host_contribution, '{}'::jsonb),
    ally_contribution = coalesce(p_ally_contribution, '{}'::jsonb),
    phase             = 'complete'
  where id = p_siege;
end $$;

revoke all on function public.set_match_outcome(uuid, text, jsonb, jsonb) from public;
grant execute on function public.set_match_outcome(uuid, text, jsonb, jsonb) to authenticated;

-- ─────────────────────────────────────────────────
-- 5) UNIT CATALOG SEED
-- ─────────────────────────────────────────────────
-- Mirrors lib/units.js. Re-run this block if the JS catalog changes.
-- Deploy cost formula: max(10, round((hp + damage*5)/10 / 5) * 5)
insert into public.unit_catalog (id, deploy_cost, hp, damage, speed) values
  ('Soldier',             20,  100, 15, 5),
  ('Archer',              15,  75,  18, 6),
  ('Slime',               10,  50,  8,  3),
  ('Swordsman',           20,  110, 20, 5),
  ('Orc',                 25,  130, 22, 4),
  ('Skeleton',            15,  80,  14, 5),
  ('Skeleton Archer',     15,  70,  20, 6),
  ('Armored Axeman',      25,  140, 25, 4),
  ('Knight',              25,  150, 22, 5),
  ('Lancer',              25,  120, 26, 6),
  ('Priest',              15,  80,  12, 4),
  ('Wizard',              25,  70,  32, 4),
  ('Armored Skeleton',    25,  130, 20, 4),
  ('Greatsword Skeleton', 30,  140, 30, 3),
  ('Armored Orc',         30,  180, 28, 3),
  ('Knight Templar',      30,  170, 28, 5),
  ('Elite Orc',           35,  200, 32, 4),
  ('Orc rider',           35,  180, 30, 8),
  ('Werebear',            40,  240, 36, 5),
  ('Werewolf',            40,  200, 38, 8)
on conflict (id) do update set
  deploy_cost = excluded.deploy_cost,
  hp          = excluded.hp,
  damage      = excluded.damage,
  speed       = excluded.speed;
