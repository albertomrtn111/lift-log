create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_type text not null default 'race' check (event_type in ('race', 'test', 'camp', 'other')),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  priority text not null default 'b' check (priority in ('a', 'b', 'c')),
  location text,
  target text,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_events_coach_client_date
  on public.client_events (coach_id, client_id, event_date);

create index if not exists idx_client_events_coach_date
  on public.client_events (coach_id, event_date);

alter table public.client_events enable row level security;

drop policy if exists "client_events_select" on public.client_events;
create policy "client_events_select"
  on public.client_events
  for select
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = client_events.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "client_events_insert" on public.client_events;
create policy "client_events_insert"
  on public.client_events
  for insert
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = client_events.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and exists (
      select 1
      from public.clients c
      where c.id = client_events.client_id
        and c.coach_id = client_events.coach_id
    )
  );

drop policy if exists "client_events_update" on public.client_events;
create policy "client_events_update"
  on public.client_events
  for update
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = client_events.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = client_events.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and exists (
      select 1
      from public.clients c
      where c.id = client_events.client_id
        and c.coach_id = client_events.coach_id
    )
  );

drop policy if exists "client_events_delete" on public.client_events;
create policy "client_events_delete"
  on public.client_events
  for delete
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = client_events.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );
