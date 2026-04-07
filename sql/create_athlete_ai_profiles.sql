create table if not exists public.athlete_ai_profiles (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'completed')),
  profile_status text not null default 'draft'
    check (profile_status in ('draft', 'generating', 'generated', 'approved')),
  answers_json jsonb not null default '{}'::jsonb,
  generated_athlete_summary text,
  generated_goals_and_calendar text,
  generated_health_and_constraints text,
  generated_training_profile text,
  generated_nutrition_and_body_context text,
  generated_key_points_and_working_rules text,
  generated_system_prompt text,
  generated_profile_json jsonb,
  generation_error text,
  onboarding_completed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id)
);

create index if not exists idx_athlete_ai_profiles_coach_client
  on public.athlete_ai_profiles (coach_id, client_id);

alter table public.athlete_ai_profiles enable row level security;

drop policy if exists "athlete_ai_profiles_select" on public.athlete_ai_profiles;
create policy "athlete_ai_profiles_select"
  on public.athlete_ai_profiles
  for select
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = athlete_ai_profiles.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "athlete_ai_profiles_insert" on public.athlete_ai_profiles;
create policy "athlete_ai_profiles_insert"
  on public.athlete_ai_profiles
  for insert
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = athlete_ai_profiles.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "athlete_ai_profiles_update" on public.athlete_ai_profiles;
create policy "athlete_ai_profiles_update"
  on public.athlete_ai_profiles
  for update
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = athlete_ai_profiles.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = athlete_ai_profiles.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "athlete_ai_profiles_delete" on public.athlete_ai_profiles;
create policy "athlete_ai_profiles_delete"
  on public.athlete_ai_profiles
  for delete
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = athlete_ai_profiles.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );
