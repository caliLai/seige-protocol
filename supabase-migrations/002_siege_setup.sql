-- ═══════════════════════════════════════════════
-- SIEGE SETUP PHASE
-- Adds the "lobby → setup → game" handoff state to public.sieges and
-- relaxes the DELETE policy so either party can disband during setup.
--
-- Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════

alter table public.sieges
  add column if not exists started_at  timestamptz,
  add column if not exists host_units  text[]  not null default '{}',
  add column if not exists ally_units  text[]  not null default '{}',
  add column if not exists host_ready  boolean not null default false,
  add column if not exists ally_ready  boolean not null default false;

-- Either party can disband the siege (during lobby OR setup). The DELETE
-- still has to pass row ownership; bystanders cannot drop a row they're
-- not part of.
drop policy if exists sieges_delete_own on public.sieges;
create policy sieges_delete_own on public.sieges
  for delete
  using (auth.uid() = host_id or auth.uid() = ally_id);

-- The UPDATE policy already permits host + ally to mutate their own row
-- (used by JOIN/LEAVE today). If your project uses a stricter policy,
-- relax it to:
--   using (auth.uid() = host_id or auth.uid() = ally_id)
--   with check (auth.uid() = host_id or auth.uid() = ally_id);
-- so writes to host_units/ally_units/host_ready/ally_ready/started_at
-- from the correct side go through.
