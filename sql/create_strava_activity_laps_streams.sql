-- Stores detailed Strava lap metrics and raw streams for coach-side analysis.
-- Direct table access stays closed by RLS; app routes use the service role.

create table if not exists public.strava_activity_streams (
  id uuid primary key default gen_random_uuid(),
  strava_activity_id uuid not null references public.strava_activities(id) on delete cascade,
  provider_activity_id text not null,
  stream_keys text[] not null default '{}',
  streams jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strava_activity_id)
);

drop trigger if exists strava_activity_streams_set_updated_at on public.strava_activity_streams;
create trigger strava_activity_streams_set_updated_at
before update on public.strava_activity_streams
for each row execute procedure public.set_updated_at();

create index if not exists strava_activity_streams_provider_activity_idx
  on public.strava_activity_streams (provider_activity_id);

alter table public.strava_activity_streams enable row level security;

create table if not exists public.strava_activity_laps (
  id uuid primary key default gen_random_uuid(),
  strava_activity_id uuid not null references public.strava_activities(id) on delete cascade,
  provider_lap_id text,
  lap_index integer not null,
  name text,
  start_date timestamptz,
  start_date_local timestamp without time zone,
  start_index integer,
  end_index integer,
  distance_meters numeric,
  moving_time_seconds integer,
  elapsed_time_seconds integer,
  avg_speed numeric,
  max_speed numeric,
  avg_pace_seconds_per_km numeric,
  avg_heartrate integer,
  start_heartrate integer,
  end_heartrate integer,
  max_heartrate integer,
  avg_cadence numeric,
  avg_watts numeric,
  avg_velocity_smooth numeric,
  elevation_gain numeric,
  raw_lap jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strava_activity_id, lap_index)
);

drop trigger if exists strava_activity_laps_set_updated_at on public.strava_activity_laps;
create trigger strava_activity_laps_set_updated_at
before update on public.strava_activity_laps
for each row execute procedure public.set_updated_at();

create index if not exists strava_activity_laps_activity_idx
  on public.strava_activity_laps (strava_activity_id, lap_index);

create index if not exists strava_activity_laps_provider_lap_idx
  on public.strava_activity_laps (provider_lap_id)
  where provider_lap_id is not null;

alter table public.strava_activity_laps enable row level security;
