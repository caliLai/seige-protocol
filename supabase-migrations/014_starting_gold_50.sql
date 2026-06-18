-- 014_starting_gold_50.sql
-- Every player now starts each match with a flat 50 gold, regardless of
-- difficulty. difficulty_settings is the server-authoritative source the
-- start_wave RPC seeds first-wave gold from (see 008_server_authoritative_battle.sql),
-- so this is the change that actually takes effect; the STARTING_GOLD knob in
-- battle.js is only the client-side display/affordance mirror.
update public.difficulty_settings set starting_gold = 50;
