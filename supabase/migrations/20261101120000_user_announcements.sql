-- Avisos de novedades de una sola vez («hay algo nuevo, ve a configurarlo»).
-- Los avisos viven en el código (src/lib/announcements/catalog.js); aquí solo se
-- guarda qué ha visto cada usuario, para no volver a enseñárselo en ningún
-- dispositivo. Una fila por usuario y aviso: descartado o completado.
create table if not exists public.user_announcements (
    user_id uuid not null references auth.users(id) on delete cascade,
    announcement_id text not null check (length(trim(announcement_id)) > 0),
    status text not null check (status in ('dismissed', 'completed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, announcement_id)
);

comment on table public.user_announcements is
    'Avisos de novedades (catálogo en el código) que cada usuario ha descartado o completado.';

alter table public.user_announcements enable row level security;

drop policy if exists "user_announcements_select_own" on public.user_announcements;
create policy "user_announcements_select_own"
    on public.user_announcements for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "user_announcements_insert_own" on public.user_announcements;
create policy "user_announcements_insert_own"
    on public.user_announcements for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "user_announcements_update_own" on public.user_announcements;
create policy "user_announcements_update_own"
    on public.user_announcements for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
