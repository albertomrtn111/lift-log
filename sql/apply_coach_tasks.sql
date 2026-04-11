-- ============================================================
-- MIGRACIÓN: coach_tasks
-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Mecanismo de "Aplazar":
--   - No hay campo snoozed_until separado.
--   - Aplazar = actualizar task_date al nuevo día.
--   - La tarea desaparece del día original y aparece en el nuevo.
--   - El estado sigue siendo 'pending' hasta que el coach la complete.
-- ============================================================

create table if not exists public.coach_tasks (
  id            uuid        primary key default gen_random_uuid(),
  coach_id      uuid        not null references public.coaches(id) on delete cascade,
  client_id     uuid        references public.clients(id) on delete set null,
  task_date     date        not null,
  title         text        not null,
  description   text,
  status        text        not null default 'pending'
                            check (status in ('pending', 'completed')),
  priority      text        not null default 'normal'
                            check (priority in ('normal', 'high')),
  created_by    uuid        default auth.uid() references public.profiles(id),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Índices
create index if not exists idx_coach_tasks_coach_date
  on public.coach_tasks (coach_id, task_date);

create index if not exists idx_coach_tasks_status_date
  on public.coach_tasks (coach_id, status, task_date);

-- Row Level Security
alter table public.coach_tasks enable row level security;

-- SELECT: solo coaches con membership activa
drop policy if exists "coach_tasks_select" on public.coach_tasks;
create policy "coach_tasks_select"
  on public.coach_tasks for select
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = coach_tasks.coach_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  );

-- INSERT
drop policy if exists "coach_tasks_insert" on public.coach_tasks;
create policy "coach_tasks_insert"
  on public.coach_tasks for insert
  with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = coach_tasks.coach_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  );

-- UPDATE (crear tarea, completar, aplazar)
drop policy if exists "coach_tasks_update" on public.coach_tasks;
create policy "coach_tasks_update"
  on public.coach_tasks for update
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = coach_tasks.coach_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = coach_tasks.coach_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  );

-- DELETE
drop policy if exists "coach_tasks_delete" on public.coach_tasks;
create policy "coach_tasks_delete"
  on public.coach_tasks for delete
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = coach_tasks.coach_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  );
