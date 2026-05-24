create table if not exists public.nextia_chat_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) > 0 and char_length(content) <= 20000),
  context_version text not null default 'nextia-athlete-v1',
  created_at timestamptz not null default now()
);

create index if not exists idx_nextia_chat_messages_coach_client_created
  on public.nextia_chat_messages (coach_id, client_id, created_at desc);

create index if not exists idx_nextia_chat_messages_client_created
  on public.nextia_chat_messages (client_id, created_at desc);

alter table public.nextia_chat_messages enable row level security;

drop policy if exists "nextia_chat_messages_select" on public.nextia_chat_messages;
create policy "nextia_chat_messages_select"
  on public.nextia_chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = nextia_chat_messages.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and exists (
      select 1
      from public.clients c
      where c.id = nextia_chat_messages.client_id
        and c.coach_id = nextia_chat_messages.coach_id
    )
  );

drop policy if exists "nextia_chat_messages_insert" on public.nextia_chat_messages;
create policy "nextia_chat_messages_insert"
  on public.nextia_chat_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = nextia_chat_messages.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and exists (
      select 1
      from public.clients c
      where c.id = nextia_chat_messages.client_id
        and c.coach_id = nextia_chat_messages.coach_id
    )
  );

drop policy if exists "nextia_chat_messages_delete" on public.nextia_chat_messages;
create policy "nextia_chat_messages_delete"
  on public.nextia_chat_messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.coach_memberships cm
      where cm.coach_id = nextia_chat_messages.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

grant select, insert, delete on public.nextia_chat_messages to authenticated;

select pg_notify('pgrst', 'reload schema');
