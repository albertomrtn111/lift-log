-- ============================================================================
-- Persistent custom meal slots for macro tracking
-- ============================================================================
-- Lets each client add custom meals (e.g. "Pre-entreno") that appear from
-- effective_from onwards without affecting other clients.

create table if not exists public.nutrition_meal_slots (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  label          text not null check (length(trim(label)) > 0),
  order_index    int not null default 4,
  effective_from date not null default current_date,
  deleted_from   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint nutrition_meal_slots_deleted_after_effective
    check (deleted_from is null or deleted_from >= effective_from)
);

create index if not exists nutrition_meal_slots_client_date_idx
  on public.nutrition_meal_slots (client_id, effective_from, deleted_from, order_index);

create unique index if not exists nutrition_meal_slots_active_label_idx
  on public.nutrition_meal_slots (client_id, lower(trim(label)))
  where deleted_from is null;

drop trigger if exists nutrition_meal_slots_set_updated_at on public.nutrition_meal_slots;
create trigger nutrition_meal_slots_set_updated_at
before update on public.nutrition_meal_slots
for each row execute procedure public.set_updated_at();

alter table public.nutrition_meal_slots enable row level security;

drop policy if exists "nms_client_select_own" on public.nutrition_meal_slots;
create policy "nms_client_select_own"
  on public.nutrition_meal_slots for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nms_client_insert_own" on public.nutrition_meal_slots;
create policy "nms_client_insert_own"
  on public.nutrition_meal_slots for insert to authenticated
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nms_client_update_own" on public.nutrition_meal_slots;
create policy "nms_client_update_own"
  on public.nutrition_meal_slots for update to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nms_client_delete_own" on public.nutrition_meal_slots;
create policy "nms_client_delete_own"
  on public.nutrition_meal_slots for delete to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nms_coach_select" on public.nutrition_meal_slots;
create policy "nms_coach_select"
  on public.nutrition_meal_slots for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      join public.coach_memberships m on m.coach_id = c.coach_id
      where c.id = client_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','coach')
    )
  );
