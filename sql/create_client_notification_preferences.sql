-- Client-level notification preferences.
-- Defaults are intentionally enabled to preserve current behavior.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.client_notification_preferences (
  client_id uuid primary key references public.clients(id) on delete cascade,
  messages_enabled boolean not null default true,
  reviews_enabled boolean not null default true,
  supplements_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists client_notification_preferences_set_updated_at on public.client_notification_preferences;
create trigger client_notification_preferences_set_updated_at
before update on public.client_notification_preferences
for each row execute procedure public.set_updated_at();

alter table public.client_notification_preferences enable row level security;

drop policy if exists "cnp_client_select" on public.client_notification_preferences;
create policy "cnp_client_select" on public.client_notification_preferences
  for select to authenticated
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_id
        and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
    )
  );

drop policy if exists "cnp_client_insert" on public.client_notification_preferences;
create policy "cnp_client_insert" on public.client_notification_preferences
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.clients c
      where c.id = client_id
        and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
    )
  );

drop policy if exists "cnp_client_update" on public.client_notification_preferences;
create policy "cnp_client_update" on public.client_notification_preferences
  for update to authenticated
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_id
        and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      where c.id = client_id
        and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
    )
  );
