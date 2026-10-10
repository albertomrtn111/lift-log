-- One current training or body-composition phase per athlete.
create table if not exists public.athlete_current_goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  goal_type text not null check (goal_type in (
    'recomposition', 'definition', 'muscle_gain', 'endurance',
    'competition', 'health', 'other'
  )),
  title text not null check (char_length(trim(title)) between 1 and 160),
  start_date date not null,
  target_date date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id),
  check (target_date >= start_date)
);

create index if not exists idx_athlete_current_goals_client
  on public.athlete_current_goals (client_id);

alter table public.athlete_current_goals enable row level security;

-- Data API access is separate from RLS; only signed-in users need this table.
revoke all on table public.athlete_current_goals from public, anon;
grant select, insert, update, delete on table public.athlete_current_goals to authenticated;

create policy athlete_current_goals_select on public.athlete_current_goals
  for select to authenticated using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = athlete_current_goals.coach_id
        and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = athlete_current_goals.client_id
        and c.coach_id = athlete_current_goals.coach_id
    )
  );

create policy athlete_current_goals_insert on public.athlete_current_goals
  for insert to authenticated with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = athlete_current_goals.coach_id
        and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = athlete_current_goals.client_id
        and c.coach_id = athlete_current_goals.coach_id
    )
  );

create policy athlete_current_goals_update on public.athlete_current_goals
  for update to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = athlete_current_goals.coach_id
        and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = athlete_current_goals.client_id
        and c.coach_id = athlete_current_goals.coach_id
    )
  )
  with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = athlete_current_goals.coach_id
        and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = athlete_current_goals.client_id
        and c.coach_id = athlete_current_goals.coach_id
    )
  );

create policy athlete_current_goals_delete on public.athlete_current_goals
  for delete to authenticated using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = athlete_current_goals.coach_id
        and cm.user_id = (select auth.uid()) and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = athlete_current_goals.client_id
        and c.coach_id = athlete_current_goals.coach_id
    )
  );
