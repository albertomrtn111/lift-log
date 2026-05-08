-- Supplement tracking and daily reminder support.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.supplement_dose_logs (
  id uuid primary key default gen_random_uuid(),
  supplement_id uuid not null references public.client_supplements(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  status text not null check (status in ('taken', 'skipped')),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplement_id, scheduled_date, scheduled_time)
);

drop trigger if exists supplement_dose_logs_set_updated_at on public.supplement_dose_logs;
create trigger supplement_dose_logs_set_updated_at
before update on public.supplement_dose_logs
for each row execute procedure public.set_updated_at();

create index if not exists supplement_dose_logs_client_date_idx
  on public.supplement_dose_logs (client_id, scheduled_date);

alter table public.supplement_dose_logs enable row level security;

create table if not exists public.supplement_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  supplement_id uuid not null references public.client_supplements(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (supplement_id, scheduled_date, scheduled_time)
);

create index if not exists supplement_reminder_deliveries_client_date_idx
  on public.supplement_reminder_deliveries (client_id, scheduled_date);

alter table public.supplement_reminder_deliveries enable row level security;

-- These tables are accessed through authenticated backend API routes using
-- the service role client. Direct RLS policies can be added later if we want
-- client-side table reads.
