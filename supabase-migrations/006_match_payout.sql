-- ═══════════════════════════════════════════════
-- MATCH PAYOUT
-- End-of-match award. Server-validated so clients can't forge rewards.
-- Idempotent via sieges.ended_at — a second call from the other client
-- (or a retry) raises 'already_paid'.
--
-- Reward formula (tunable here, not in client code):
--   base   = victory ? 100 : 25
--   mult   = difficulty (recruit 1.0 / veteran 1.25 / elite 1.75)
--   pool   = base * mult * 2  (two players)
--   split  = 60/40 favouring the higher contribution.damage_dealt,
--            or 50/50 if neither side contributed
--
-- Run this once in the Supabase SQL editor, AFTER migration 005.
-- ═══════════════════════════════════════════════

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

  -- Caller must be one of the players. Anyone else trying to call this
  -- with a random siege id is rejected.
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

  -- Bypasses the profiles_block_currency trigger because this function
  -- runs as the table owner (security definer).
  update public.profiles set points = points + host_pts where user_id = s.host_id;
  if s.ally_id is not null then
    update public.profiles set points = points + ally_pts where user_id = s.ally_id;
  end if;

  update public.sieges set ended_at = now() where id = p_siege;

  return query select host_pts, ally_pts;
end $$;

revoke all on function public.award_match_points(uuid) from public;
grant execute on function public.award_match_points(uuid) to authenticated;
