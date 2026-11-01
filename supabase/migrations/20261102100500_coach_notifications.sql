-- Notificaciones fase 2: campana del coach con historial y resumen diario.

-- 1) Campana del coach. Cada aviso al coach (con o sin push) deja aquí una
--    fila. `group_key` agrupa avisos del mismo tema mientras no se leen
--    (p. ej. todos los mensajes sin leer de un atleta en una sola fila).
create table if not exists public.coach_notifications (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    client_id uuid references public.clients(id) on delete cascade,
    category text not null check (category in ('reviews', 'messages', 'tasks', 'system')),
    kind text not null,
    title text not null,
    body text,
    url text,
    group_key text,
    is_read boolean not null default false,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists coach_notifications_coach_idx
    on public.coach_notifications (coach_id, updated_at desc);

create index if not exists coach_notifications_unread_idx
    on public.coach_notifications (coach_id)
    where not is_read;

-- Un solo aviso abierto por tema: el siguiente actualiza esa fila.
create unique index if not exists coach_notifications_open_group_idx
    on public.coach_notifications (coach_id, group_key)
    where group_key is not null and not is_read;

alter table public.coach_notifications enable row level security;

-- El coach (y su equipo) lee y marca como leídos sus avisos; las inserciones
-- las hace el servidor con service role.
drop policy if exists coach_notifications_select_member on public.coach_notifications;
create policy coach_notifications_select_member on public.coach_notifications
    for select to authenticated
    using (public.is_coach_member(coach_id));

drop policy if exists coach_notifications_update_member on public.coach_notifications;
create policy coach_notifications_update_member on public.coach_notifications
    for update to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

-- Realtime para la campana.
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'coach_notifications'
       ) then
        alter publication supabase_realtime add table public.coach_notifications;
    end if;
end $$;

-- 2) Resumen diario por email.
alter table public.coach_notification_preferences
    add column if not exists digest_enabled boolean not null default true,
    add column if not exists digest_time time not null default '08:30';
