-- =====================================================================
-- MIGRATE LEGACY CHECK-IN FORM ASSIGNMENTS TO REVIEW SCHEDULES
--
-- Objetivo:
-- - Cada form_template tipo checkin con assigned_client_ids pasa a tener
--   una review_template asociada.
-- - Cada atleta asignado al formulario recibe un client_review_schedule.
-- - No borra datos legacy; solo crea la nueva fuente de verdad.
-- =====================================================================

with legacy_forms as (
  select ft.*
  from public.form_templates ft
  where ft.type = 'checkin'
    and ft.is_active = true
    and coalesce(array_length(ft.assigned_client_ids, 1), 0) > 0
    and not exists (
      select 1
      from public.review_templates rt
      where rt.form_template_id = ft.id
    )
),
inserted_templates as (
  insert into public.review_templates (
    coach_id,
    name,
    description,
    review_type,
    form_template_id,
    default_frequency_days,
    include_body_metrics,
    include_performance_metrics,
    include_general_metrics,
    include_progress_photos,
    photos_required,
    photos_max_items,
    is_active
  )
  select
    lf.coach_id,
    lf.title,
    'Migrado desde una asignación legacy de formulario check-in. La pestaña Revisiones es ahora la fuente de verdad.',
    'custom',
    lf.id,
    coalesce((
      select c.checkin_frequency_days
      from public.clients c
      where c.id = any(lf.assigned_client_ids)
        and c.coach_id = lf.coach_id
      order by c.created_at asc
      limit 1
    ), 14),
    true,
    true,
    true,
    true,
    false,
    6,
    true
  from legacy_forms lf
  returning id, form_template_id
),
templates_for_assigned_forms as (
  select ft.id as form_template_id, ft.coach_id, ft.assigned_client_ids, rt.id as review_template_id, rt.default_frequency_days
  from public.form_templates ft
  join public.review_templates rt on rt.form_template_id = ft.id
  where ft.type = 'checkin'
    and coalesce(array_length(ft.assigned_client_ids, 1), 0) > 0
),
assigned_clients as (
  select
    tf.coach_id,
    tf.review_template_id,
    tf.default_frequency_days,
    assigned.client_id
  from templates_for_assigned_forms tf
  cross join lateral unnest(tf.assigned_client_ids) as assigned(client_id)
)
insert into public.client_review_schedules (
  coach_id,
  client_id,
  review_template_id,
  frequency_days,
  next_due_date,
  is_active
)
select
  ac.coach_id,
  c.id,
  ac.review_template_id,
  coalesce(c.checkin_frequency_days, ac.default_frequency_days, 14),
  c.next_checkin_date,
  true
from assigned_clients ac
join public.clients c on c.id = ac.client_id and c.coach_id = ac.coach_id
on conflict (client_id, review_template_id) do nothing;
