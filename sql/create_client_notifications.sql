-- Historial de notificaciones por cliente (in-app inbox)
create table if not exists public.client_notifications (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  title      text not null,
  body       text,
  url        text,
  type       text not null default 'general'
               check (type in ('general','message','plan_updated','check_in','macro_updated','supplement')),
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cn_client_created_idx on public.client_notifications (client_id, created_at desc);
create index if not exists cn_client_unread_idx  on public.client_notifications (client_id, is_read) where is_read = false;

alter table public.client_notifications enable row level security;

-- El cliente lee y actualiza solo las suyas
drop policy if exists "cn_client_select" on public.client_notifications;
create policy "cn_client_select" on public.client_notifications
  for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

drop policy if exists "cn_client_update" on public.client_notifications;
create policy "cn_client_update" on public.client_notifications
  for update to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- El coach (o service role desde API routes) puede insertar
drop policy if exists "cn_coach_insert" on public.client_notifications;
create policy "cn_coach_insert" on public.client_notifications
  for insert to authenticated
  with check (
    exists (
      select 1 from public.clients c
      join public.coach_memberships m on m.coach_id = c.coach_id
      where c.id = client_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','coach')
    )
  );
