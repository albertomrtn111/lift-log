-- =====================================================================
-- REVIEW SYSTEM V2 — FOUNDATION
-- Sistema flexible de plantillas de revisión.
-- Los campos legacy en `clients` (checkin_frequency_days, next_checkin_date)
-- y `form_templates.assigned_client_ids` SE MANTIENEN como fallback.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. review_templates: plantilla de revisión (coach-level)
-- ---------------------------------------------------------------------
create table if not exists public.review_templates (
  id                          uuid primary key default gen_random_uuid(),
  coach_id                    uuid not null references public.coaches(id) on delete cascade,
  name                        text not null,
  description                 text,
  review_type                 text not null default 'custom'
    check (review_type in ('weekly','biweekly','monthly','manual','onboarding','custom')),
  form_template_id            uuid references public.form_templates(id) on delete set null,
  default_frequency_days      integer not null default 14
    check (default_frequency_days between 1 and 365),

  include_body_metrics        boolean not null default false,
  include_performance_metrics boolean not null default false,
  include_general_metrics     boolean not null default false,

  include_progress_photos     boolean not null default false,
  photos_required             boolean not null default false,
  photos_max_items            integer not null default 6 check (photos_max_items between 1 and 20),

  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_review_templates_coach_active
  on public.review_templates (coach_id, is_active);

create index if not exists idx_review_templates_form_template
  on public.review_templates (form_template_id) where form_template_id is not null;

alter table public.review_templates enable row level security;

drop policy if exists "review_templates_select" on public.review_templates;
create policy "review_templates_select" on public.review_templates
  for select to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = review_templates.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "review_templates_insert" on public.review_templates;
create policy "review_templates_insert" on public.review_templates
  for insert to authenticated
  with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = review_templates.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "review_templates_update" on public.review_templates;
create policy "review_templates_update" on public.review_templates
  for update to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = review_templates.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "review_templates_delete" on public.review_templates;
create policy "review_templates_delete" on public.review_templates
  for delete to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = review_templates.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- ---------------------------------------------------------------------
-- 2. review_template_metrics: selección avanzada (Nivel 2)
-- ---------------------------------------------------------------------
create table if not exists public.review_template_metrics (
  id                  uuid primary key default gen_random_uuid(),
  review_template_id  uuid not null references public.review_templates(id) on delete cascade,
  metric_id           uuid not null references public.metric_definitions(id) on delete cascade,
  required            boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (review_template_id, metric_id)
);

create index if not exists idx_rtm_template on public.review_template_metrics (review_template_id);
create index if not exists idx_rtm_metric   on public.review_template_metrics (metric_id);

alter table public.review_template_metrics enable row level security;

drop policy if exists "rtm_select" on public.review_template_metrics;
create policy "rtm_select" on public.review_template_metrics
  for select to authenticated
  using (
    exists (
      select 1 from public.review_templates rt
      join public.coach_memberships cm on cm.coach_id = rt.coach_id
      where rt.id = review_template_metrics.review_template_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "rtm_insert" on public.review_template_metrics;
create policy "rtm_insert" on public.review_template_metrics
  for insert to authenticated
  with check (
    exists (
      select 1 from public.review_templates rt
      join public.coach_memberships cm on cm.coach_id = rt.coach_id
      where rt.id = review_template_metrics.review_template_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "rtm_update" on public.review_template_metrics;
create policy "rtm_update" on public.review_template_metrics
  for update to authenticated
  using (
    exists (
      select 1 from public.review_templates rt
      join public.coach_memberships cm on cm.coach_id = rt.coach_id
      where rt.id = review_template_metrics.review_template_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "rtm_delete" on public.review_template_metrics;
create policy "rtm_delete" on public.review_template_metrics
  for delete to authenticated
  using (
    exists (
      select 1 from public.review_templates rt
      join public.coach_memberships cm on cm.coach_id = rt.coach_id
      where rt.id = review_template_metrics.review_template_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- ---------------------------------------------------------------------
-- 3. client_review_schedules: plan de revisiones del atleta
-- ---------------------------------------------------------------------
create table if not exists public.client_review_schedules (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  coach_id            uuid not null references public.coaches(id) on delete cascade,
  review_template_id  uuid not null references public.review_templates(id) on delete cascade,
  frequency_days      integer not null default 14
    check (frequency_days between 1 and 365),
  next_due_date       date,
  is_active           boolean not null default true,
  last_sent_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (client_id, review_template_id)
);

create index if not exists idx_crs_client_active on public.client_review_schedules (client_id, is_active);
create index if not exists idx_crs_coach_due
  on public.client_review_schedules (coach_id, next_due_date) where is_active = true;

alter table public.client_review_schedules enable row level security;

drop policy if exists "crs_select" on public.client_review_schedules;
create policy "crs_select" on public.client_review_schedules
  for select to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = client_review_schedules.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "crs_insert" on public.client_review_schedules;
create policy "crs_insert" on public.client_review_schedules
  for insert to authenticated
  with check (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = client_review_schedules.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and exists (
      select 1 from public.clients c
      where c.id = client_review_schedules.client_id
        and c.coach_id = client_review_schedules.coach_id
    )
  );

drop policy if exists "crs_update" on public.client_review_schedules;
create policy "crs_update" on public.client_review_schedules
  for update to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = client_review_schedules.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "crs_delete" on public.client_review_schedules;
create policy "crs_delete" on public.client_review_schedules
  for delete to authenticated
  using (
    exists (
      select 1 from public.coach_memberships cm
      where cm.coach_id = client_review_schedules.coach_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- ---------------------------------------------------------------------
-- 4. ALTER checkins: trazabilidad
-- ---------------------------------------------------------------------
alter table public.checkins
  add column if not exists review_template_id uuid references public.review_templates(id) on delete set null,
  add column if not exists review_schedule_id uuid references public.client_review_schedules(id) on delete set null;

create index if not exists idx_checkins_review_template
  on public.checkins (review_template_id) where review_template_id is not null;

create index if not exists idx_checkins_review_schedule
  on public.checkins (review_schedule_id) where review_schedule_id is not null;

-- ---------------------------------------------------------------------
-- 5. Trigger updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_review_v2_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_review_templates_updated_at on public.review_templates;
create trigger trg_review_templates_updated_at
  before update on public.review_templates
  for each row execute function public.set_review_v2_updated_at();

drop trigger if exists trg_crs_updated_at on public.client_review_schedules;
create trigger trg_crs_updated_at
  before update on public.client_review_schedules
  for each row execute function public.set_review_v2_updated_at();

-- =====================================================================
-- SEED DE COMPATIBILIDAD
-- =====================================================================

-- Una review_template por cada form_template tipo 'checkin'
-- Replica el comportamiento legacy: todas las métricas + fotos
insert into public.review_templates (
  coach_id, name, description, review_type, form_template_id, default_frequency_days,
  include_body_metrics, include_performance_metrics, include_general_metrics,
  include_progress_photos, photos_required, photos_max_items, is_active
)
select
  ft.coach_id, ft.title,
  'Migrado desde el sistema anterior. Replica el comportamiento legacy.',
  'custom', ft.id, 14,
  true, true, true,
  true, false, 6,
  ft.is_active
from public.form_templates ft
where ft.type = 'checkin'
  and not exists (
    select 1 from public.review_templates rt
    where rt.form_template_id = ft.id and rt.coach_id = ft.coach_id
  );

-- Un schedule por cliente (assigned > default)
with client_template as (
  select distinct on (c.id)
    c.id as client_id, c.coach_id, c.checkin_frequency_days, c.next_checkin_date,
    ft.id as form_template_id,
    case when c.id = any(ft.assigned_client_ids) then 1 else 0 end as is_assigned,
    ft.is_default, ft.created_at as ft_created_at
  from public.clients c
  join public.form_templates ft
    on ft.coach_id = c.coach_id
   and ft.type = 'checkin'
   and ft.is_active = true
   and (c.id = any(ft.assigned_client_ids) or ft.is_default = true)
  order by c.id, is_assigned desc, ft.is_default desc, ft.created_at desc
)
insert into public.client_review_schedules (
  client_id, coach_id, review_template_id, frequency_days, next_due_date, is_active
)
select
  ct.client_id, ct.coach_id, rt.id,
  coalesce(ct.checkin_frequency_days, 14),
  ct.next_checkin_date, true
from client_template ct
join public.review_templates rt
  on rt.form_template_id = ct.form_template_id
 and rt.coach_id = ct.coach_id
on conflict (client_id, review_template_id) do nothing;
