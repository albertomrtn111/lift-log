-- Strava core integration for NexTrain.
-- Tokens are intentionally kept out of client queries; use backend API routes
-- with the service role client for token access.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.athlete_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  provider text not null default 'strava' check (provider in ('strava')),
  provider_athlete_id text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error', 'revoked')),
  error_message text,
  connected_at timestamptz default now(),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider),
  unique (provider, provider_athlete_id)
);

drop trigger if exists athlete_integrations_set_updated_at on public.athlete_integrations;
create trigger athlete_integrations_set_updated_at
before update on public.athlete_integrations
for each row execute procedure public.set_updated_at();

alter table public.athlete_integrations enable row level security;

create table if not exists public.strava_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  provider text not null default 'strava' check (provider in ('strava')),
  provider_activity_id text not null,
  strava_athlete_id text not null,
  name text,
  activity_type text,
  sport_type text,
  start_date timestamptz,
  start_date_local timestamp without time zone,
  distance_meters numeric,
  moving_time_seconds integer,
  elapsed_time_seconds integer,
  average_speed numeric,
  average_pace_seconds_per_km numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  total_elevation_gain numeric,
  calories numeric,
  raw_payload jsonb,
  matched_planned_session_id uuid references public.cardio_sessions(id) on delete set null,
  cardio_session_id uuid references public.cardio_sessions(id) on delete set null,
  rpe integer check (rpe >= 1 and rpe <= 10),
  athlete_notes text,
  feedback_status text not null default 'pending' check (feedback_status in ('pending', 'completed')),
  is_deleted boolean not null default false,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_activity_id)
);

drop trigger if exists strava_activities_set_updated_at on public.strava_activities;
create trigger strava_activities_set_updated_at
before update on public.strava_activities
for each row execute procedure public.set_updated_at();

create index if not exists strava_activities_client_feedback_idx
  on public.strava_activities (client_id, feedback_status, start_date_local desc);

create index if not exists strava_activities_athlete_idx
  on public.strava_activities (strava_athlete_id);

alter table public.strava_activities enable row level security;

alter table public.cardio_sessions
  add column if not exists source_provider text,
  add column if not exists provider_activity_id text,
  add column if not exists strava_activity_id uuid references public.strava_activities(id) on delete set null,
  add column if not exists source_payload jsonb;

create unique index if not exists cardio_sessions_provider_activity_uidx
  on public.cardio_sessions (source_provider, provider_activity_id)
  where source_provider is not null and provider_activity_id is not null;

create index if not exists cardio_sessions_strava_activity_idx
  on public.cardio_sessions (strava_activity_id);

-- Keep direct table access closed by default. The app exposes sanitized status
-- and activity feedback endpoints instead of selecting token-bearing rows.
