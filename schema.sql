-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  user_id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  points integer NOT NULL DEFAULT 0,
  unlocked_units ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
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
  host_units ARRAY NOT NULL DEFAULT '{}'::text[],
  ally_units ARRAY NOT NULL DEFAULT '{}'::text[],
  host_ready boolean NOT NULL DEFAULT false,
  ally_ready boolean NOT NULL DEFAULT false,
  host_wave1 ARRAY NOT NULL DEFAULT '{}'::text[],
  ally_wave1 ARRAY NOT NULL DEFAULT '{}'::text[],
  host_wave1_ready boolean NOT NULL DEFAULT false,
  ally_wave1_ready boolean NOT NULL DEFAULT false,
  CONSTRAINT sieges_pkey PRIMARY KEY (id),
  CONSTRAINT sieges_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id),
  CONSTRAINT sieges_ally_id_fkey FOREIGN KEY (ally_id) REFERENCES auth.users(id)
);