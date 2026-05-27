-- ═══════════════════════════════════════════════
-- 012_siege_snapshots
-- Persists the in-flight battlefield state every ~500ms so a fresh
-- client landing mid-wave can resume rendering even when the other
-- peer hasn't broadcast yet. A pg_cron watchdog terminates matches
-- whose snapshot has been stale for >60s (both peers abandoned),
-- writing outcome='defeat' through the existing locked-column trigger
-- by setting app.battle_rpc='on' (same bypass set_match_outcome uses).
-- ═══════════════════════════════════════════════

-- ─── 1. SNAPSHOT TABLE ────────────────────────────────────────
create table if not exists public.siege_snapshots (
  siege_id   uuid primary key references public.sieges(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists siege_snapshots_updated_at_idx
  on public.siege_snapshots(updated_at);

alter table public.siege_snapshots enable row level security;

-- Only the host or ally of the siege may read the snapshot.
drop policy if exists siege_snapshots_select_member on public.siege_snapshots;
create policy siege_snapshots_select_member
  on public.siege_snapshots for select using (
    exists (
      select 1 from public.sieges s
      where s.id = siege_id
        and (s.host_id = auth.uid() or s.ally_id = auth.uid())
    )
  );

-- Same membership check on writes; the RPC below is the canonical path
-- but direct upsert also works for either peer.
drop policy if exists siege_snapshots_insert_member on public.siege_snapshots;
create policy siege_snapshots_insert_member
  on public.siege_snapshots for insert with check (
    exists (
      select 1 from public.sieges s
      where s.id = siege_id
        and (s.host_id = auth.uid() or s.ally_id = auth.uid())
    )
  );

drop policy if exists siege_snapshots_update_member on public.siege_snapshots;
create policy siege_snapshots_update_member
  on public.siege_snapshots for update using (
    exists (
      select 1 from public.sieges s
      where s.id = siege_id
        and (s.host_id = auth.uid() or s.ally_id = auth.uid())
    )
  );

-- ─── 2. UPSERT RPC ────────────────────────────────────────────
-- Called by the simming client every ~500ms with the latest payload.
create or replace function public.upsert_siege_snapshot(
  p_siege uuid,
  p_state jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sieges
    where id = p_siege
      and (host_id = auth.uid() or ally_id = auth.uid())
  ) then
    raise exception 'not_in_siege';
  end if;
  insert into public.siege_snapshots(siege_id, state, updated_at)
  values (p_siege, p_state, now())
  on conflict (siege_id) do update set
    state      = excluded.state,
    updated_at = excluded.updated_at;
end $$;

revoke all on function public.upsert_siege_snapshot(uuid, jsonb) from public;
grant execute on function public.upsert_siege_snapshot(uuid, jsonb) to authenticated;

-- ─── 3. READ RPC ──────────────────────────────────────────────
-- Used by a fresh client to seed observed-mode rendering immediately
-- on cold reconnect, without waiting for the other peer's broadcast.
create or replace function public.get_siege_snapshot(p_siege uuid)
returns jsonb
language sql
security invoker
set search_path = public
stable
as $$
  select state from public.siege_snapshots
  where siege_id = p_siege
    and exists (
      select 1 from public.sieges s
      where s.id = p_siege
        and (s.host_id = auth.uid() or s.ally_id = auth.uid())
    );
$$;

revoke all on function public.get_siege_snapshot(uuid) from public;
grant execute on function public.get_siege_snapshot(uuid) to authenticated;

-- ─── 4. WATCHDOG ──────────────────────────────────────────────
-- Marks active sieges whose snapshot has gone stale (no client writing
-- updates) as abandoned. Writes outcome='defeat', phase='complete' for
-- each. Uses the same `app.battle_rpc='on'` flag that set_match_outcome
-- uses to bypass the column-lock trigger from migration 008.
--
-- SECURITY DEFINER so the cron job (running as the postgres role) can
-- write through the trigger. Pure SQL — no user context needed.
create or replace function public.watchdog_abandoned_sieges(
  p_stale_seconds int default 60
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved int := 0;
  rec record;
begin
  perform set_config('app.battle_rpc', 'on', true);

  for rec in
    select s.id
    from public.sieges s
    left join public.siege_snapshots ss on ss.siege_id = s.id
    where s.phase = 'battle'
      and s.outcome is null
      and coalesce(ss.updated_at, s.started_at, s.created_at)
            < now() - make_interval(secs => p_stale_seconds)
  loop
    update public.sieges
    set
      outcome           = 'defeat',
      phase             = 'complete',
      ended_at          = coalesce(ended_at, now()),
      host_contribution = coalesce(host_contribution, '{}'::jsonb),
      ally_contribution = coalesce(ally_contribution, '{}'::jsonb)
    where id = rec.id and outcome is null;
    resolved := resolved + 1;
  end loop;

  return resolved;
end $$;

revoke all on function public.watchdog_abandoned_sieges(int) from public;
-- Only the postgres role / cron should call this. authenticated clients
-- have no business invoking it directly.

-- ─── 5. CRON SCHEDULE ─────────────────────────────────────────
-- Runs every minute. Supabase ships pg_cron; if the extension isn't
-- already enabled this creates it in the `extensions` schema.
create extension if not exists pg_cron with schema extensions;

-- Unschedule a previous version of this job before re-scheduling so the
-- migration is idempotent (re-runs don't accumulate duplicate jobs).
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'watchdog-abandoned-sieges' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'watchdog-abandoned-sieges',
  '* * * * *',
  $$select public.watchdog_abandoned_sieges(60)$$
);

-- ─── 6. PostgREST cache nudge ─────────────────────────────────
notify pgrst, 'reload schema';
