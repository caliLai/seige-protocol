-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Authoritative sources are the numbered files under supabase-migrations/.

CREATE TABLE public.profiles (
  user_id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  points integer NOT NULL DEFAULT 0,
  unlocked_units ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Trigger profiles_block_currency (migration 005) raises 'currency_columns_locked'
-- on any client UPDATE that changes points or unlocked_units. Use the RPCs:
--   public.purchase_unit(p_unit text, p_cost int)         — debit + unlock
--   public.award_match_points(p_siege uuid)               — match payout

CREATE TABLE public.sieges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL,
  host_username text NOT NULL,
  name text NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 40),
  map text NOT NULL,
  map_src text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty = ANY (ARRAY['recruit'::text, 'veteran'::text, 'elite'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ally_id uuid,
  ally_username text,
  started_at timestamp with time zone,

  -- Siege-setup phase (migration 002)
  host_units ARRAY NOT NULL DEFAULT '{}'::text[],
  ally_units ARRAY NOT NULL DEFAULT '{}'::text[],
  host_ready boolean NOT NULL DEFAULT false,
  ally_ready boolean NOT NULL DEFAULT false,

  -- Battle runtime (migration 004)
  phase text NOT NULL DEFAULT 'lobby'
    CHECK (phase IN ('lobby','setup','prep','battle','complete')),
  current_wave int NOT NULL DEFAULT 1 CHECK (current_wave >= 1),
  total_waves int NOT NULL DEFAULT 15 CHECK (total_waves BETWEEN 1 AND 50),
  team_lives int NOT NULL DEFAULT 12 CHECK (team_lives >= 0),
  host_gold int NOT NULL DEFAULT 0 CHECK (host_gold >= 0),
  ally_gold int NOT NULL DEFAULT 0 CHECK (ally_gold >= 0),
  host_queue ARRAY NOT NULL DEFAULT '{}'::text[],
  ally_queue ARRAY NOT NULL DEFAULT '{}'::text[],
  host_queue_ready boolean NOT NULL DEFAULT false,
  ally_queue_ready boolean NOT NULL DEFAULT false,
  host_contribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  ally_contribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text CHECK (outcome IN ('victory','defeat')),
  ended_at timestamp with time zone,

  CONSTRAINT sieges_pkey PRIMARY KEY (id),
  CONSTRAINT sieges_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id),
  CONSTRAINT sieges_ally_id_fkey FOREIGN KEY (ally_id) REFERENCES auth.users(id)
);

-- Partial index on phase='lobby' (migration 004) for the lobby browser query.
CREATE INDEX sieges_phase_idx ON public.sieges (phase) WHERE phase = 'lobby';
