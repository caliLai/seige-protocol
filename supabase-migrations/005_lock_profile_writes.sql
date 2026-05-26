-- ═══════════════════════════════════════════════
-- LOCK PROFILE CURRENCY WRITES
-- Today profiles.points and profiles.unlocked_units are client-writable,
-- which means a tampered client can mint points and unlock any unit for
-- free. This migration blocks direct writes to those two columns and
-- exposes purchase_unit() as the only legitimate path for clients to
-- spend points on unlocks. Match payouts go through award_match_points()
-- in migration 006.
--
-- Username stays self-writable.
--
-- Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════

-- The existing self-update policy stays in place (named profiles_update_own
-- in earlier projects); the trigger below blocks currency-column writes
-- regardless of which policy let the row through.

create or replace function public.profiles_block_currency_writes()
returns trigger
language plpgsql
as $$
begin
  if NEW.points is distinct from OLD.points
     or NEW.unlocked_units is distinct from OLD.unlocked_units then
    raise exception 'currency_columns_locked: use rpc purchase_unit() or award_match_points()';
  end if;
  return NEW;
end $$;

drop trigger if exists profiles_block_currency on public.profiles;
create trigger profiles_block_currency
  before update on public.profiles
  for each row
  -- Only fires for self-writes; the security-definer RPC functions in
  -- migrations 005/006 run as the table owner and bypass this trigger.
  when (auth.uid() = NEW.user_id)
  execute function public.profiles_block_currency_writes();

-- Client-callable: spend points to unlock a unit. Atomic check-and-debit
-- so a tampered client can't race two purchases against insufficient
-- balance and slip through.
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
