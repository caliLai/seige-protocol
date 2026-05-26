-- ═══════════════════════════════════════════════
-- FIX: payout RPC was blocked by the currency-write trigger
--
-- Migration 005's trigger guards profiles.points / unlocked_units writes
-- with `when (auth.uid() = NEW.user_id)`. The intent was for the
-- security-definer RPCs (purchase_unit, award_match_points) to bypass
-- it — but `auth.uid()` reads the JWT subject, which doesn't change
-- under `security definer`. So when the RPC updates the caller's own
-- profile, the trigger fires and aborts the transaction.
--
-- Fix: have the RPCs set a session-local flag before their UPDATE; the
-- trigger checks the flag and skips its check when set. The flag is
-- scoped to the transaction via `set_config(..., true)` so it can't
-- leak to a subsequent client-driven UPDATE in the same connection.
--
-- Run this once in the Supabase SQL editor (after 005 and 006).
-- ═══════════════════════════════════════════════

-- Rewrite the trigger function to respect the session bypass flag.
create or replace function public.profiles_block_currency_writes()
returns trigger
language plpgsql
as $$
begin
  -- Bypass when an RPC has set the in-transaction flag. current_setting
  -- with missing_ok=true returns NULL if the flag was never set, which
  -- is the normal client-driven path — trigger keeps blocking.
  if current_setting('app.allow_currency_write', true) = 'on' then
    return NEW;
  end if;

  if NEW.points is distinct from OLD.points
     or NEW.unlocked_units is distinct from OLD.unlocked_units then
    raise exception 'currency_columns_locked: use rpc purchase_unit() or award_match_points()';
  end if;
  return NEW;
end $$;

-- Drop the `when (auth.uid() = NEW.user_id)` filter so the trigger runs
-- for every UPDATE (including writes from security-definer RPCs). The
-- bypass flag is what decides whether to block.
drop trigger if exists profiles_block_currency on public.profiles;
create trigger profiles_block_currency
  before update on public.profiles
  for each row
  execute function public.profiles_block_currency_writes();

-- Re-deploy purchase_unit() to set the bypass flag inside its UPDATE.
create or replace function public.purchase_unit(p_unit text, p_cost int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cost is null or p_cost < 0 then
    raise exception 'invalid_cost';
  end if;
  if p_unit is null or length(p_unit) = 0 then
    raise exception 'invalid_unit';
  end if;

  perform set_config('app.allow_currency_write', 'on', true);

  update public.profiles
    set points = points - p_cost,
        unlocked_units = array_append(unlocked_units, p_unit)
  where user_id = auth.uid()
    and points >= p_cost
    and not (p_unit = any(unlocked_units));

  if not found then
    raise exception 'purchase_failed';
  end if;
end $$;

revoke all on function public.purchase_unit(text, int) from public;
grant execute on function public.purchase_unit(text, int) to authenticated;

-- Re-deploy award_match_points() with the same bypass flag.
create or replace function public.award_match_points(p_siege uuid)
returns table (host_award int, ally_award int)
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sieges%rowtype;
  host_pts int := 0;
  ally_pts int := 0;
  base int;
  mult numeric;
  h_score numeric;
  a_score numeric;
  pool int;
begin
  select * into s from public.sieges where id = p_siege for update;
  if not found then raise exception 'siege_not_found'; end if;
  if s.outcome is null then raise exception 'siege_not_ended'; end if;
  if s.ended_at is not null then raise exception 'already_paid'; end if;

  if auth.uid() <> s.host_id and (s.ally_id is null or auth.uid() <> s.ally_id) then
    raise exception 'not_a_player';
  end if;

  base := case s.outcome when 'victory' then 100 else 25 end;
  mult := case s.difficulty
            when 'recruit' then 1.0
            when 'veteran' then 1.25
            when 'elite'   then 1.75
            else 1.0
          end;
  pool := floor(base * mult * 2);

  h_score := coalesce((s.host_contribution->>'damage_dealt')::numeric, 0);
  a_score := coalesce((s.ally_contribution->>'damage_dealt')::numeric, 0);

  if h_score + a_score = 0 then
    host_pts := pool / 2;
    ally_pts := pool - host_pts;
  elsif h_score >= a_score then
    host_pts := floor(pool * 0.6);
    ally_pts := pool - host_pts;
  else
    ally_pts := floor(pool * 0.6);
    host_pts := pool - ally_pts;
  end if;

  perform set_config('app.allow_currency_write', 'on', true);

  update public.profiles set points = points + host_pts where user_id = s.host_id;
  if s.ally_id is not null then
    update public.profiles set points = points + ally_pts where user_id = s.ally_id;
  end if;

  update public.sieges set ended_at = now() where id = p_siege;

  return query select host_pts, ally_pts;
end $$;

revoke all on function public.award_match_points(uuid) from public;
grant execute on function public.award_match_points(uuid) to authenticated;
