create table if not exists public.calendar_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  note_date date not null,
  kind text not null default 'note' check (kind in ('note', 'reminder', 'alert')),
  content text not null,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_notes_coach_date
  on public.calendar_notes (coach_id, note_date);

create index if not exists idx_calendar_notes_client_date
  on public.calendar_notes (client_id, note_date);

alter table public.calendar_notes enable row level security;

drop policy if exists "calendar_notes_select" on public.calendar_notes;
create policy "calendar_notes_select"
  on public.calendar_notes
  for select
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = calendar_notes.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "calendar_notes_insert" on public.calendar_notes;
create policy "calendar_notes_insert"
  on public.calendar_notes
  for insert
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = calendar_notes.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "calendar_notes_update" on public.calendar_notes;
create policy "calendar_notes_update"
  on public.calendar_notes
  for update
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = calendar_notes.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = calendar_notes.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "calendar_notes_delete" on public.calendar_notes;
create policy "calendar_notes_delete"
  on public.calendar_notes
  for delete
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = calendar_notes.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );
