-- Safety net for legacy n8n-created checkins.
-- n8n may still insert checkins from form_templates.assigned_client_ids.
-- This trigger links those rows to the unique active review schedule/template
-- that uses the same form_template_id, so the app can filter metrics/photos.

create or replace function public.link_legacy_checkin_to_review_schedule()
returns trigger
language plpgsql
as $$
declare
  v_schedule_id uuid;
  v_review_template_id uuid;
  v_frequency_days integer;
  v_next_due_date date;
  v_match_count integer;
begin
  if new.type <> 'checkin'
     or new.review_template_id is not null
     or new.form_template_id is null then
    return new;
  end if;

  select
    count(*),
    min(crs.id),
    min(crs.review_template_id),
    min(crs.frequency_days),
    min(crs.next_due_date)
  into
    v_match_count,
    v_schedule_id,
    v_review_template_id,
    v_frequency_days,
    v_next_due_date
  from public.client_review_schedules crs
  join public.review_templates rt on rt.id = crs.review_template_id
  where crs.client_id = new.client_id
    and crs.coach_id = new.coach_id
    and crs.is_active = true
    and rt.is_active = true
    and rt.form_template_id = new.form_template_id;

  -- Ambiguous matches are left untouched; the app also has a guarded resolver.
  if v_match_count = 1 then
    new.review_schedule_id := v_schedule_id;
    new.review_template_id := v_review_template_id;

    if new.period_end is null then
      new.period_end := v_next_due_date;
    end if;

    if new.period_start is null and new.period_end is not null then
      new.period_start := new.period_end - coalesce(v_frequency_days, 14);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists link_legacy_checkin_to_review_schedule_before_insert on public.checkins;
create trigger link_legacy_checkin_to_review_schedule_before_insert
before insert on public.checkins
for each row execute function public.link_legacy_checkin_to_review_schedule();

drop trigger if exists link_legacy_checkin_to_review_schedule_before_update on public.checkins;
create trigger link_legacy_checkin_to_review_schedule_before_update
before update of form_template_id, review_template_id on public.checkins
for each row execute function public.link_legacy_checkin_to_review_schedule();
