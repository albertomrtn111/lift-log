-- Borrado definitivo de la atleta de ejemplo (clients.is_sample = true) con
-- todo lo que cuelgue de ella, incluido lo que el coach haya creado al
-- explorarla. Todo en una transacción: o se borra entero o no se borra nada.
-- Solo la llama el servidor (service role) tras validar al coach.

create or replace function public.delete_sample_client(p_coach_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.clients
        where id = p_client_id and coach_id = p_coach_id and is_sample
    ) then
        raise exception 'Solo se puede borrar la atleta de ejemplo de tu espacio';
    end if;

    -- Entrenamiento de fuerza
    delete from public.training_exercise_sets
    where exercise_id in (
        select e.id from public.training_exercises e
        join public.training_programs p on p.id = e.program_id
        where p.client_id = p_client_id
    );
    delete from public.training_exercise_logs where client_id = p_client_id;
    delete from public.scheduled_strength_sessions where client_id = p_client_id;
    delete from public.training_cells
    where program_id in (select id from public.training_programs where client_id = p_client_id);
    delete from public.training_exercises
    where program_id in (select id from public.training_programs where client_id = p_client_id);
    delete from public.training_days
    where program_id in (select id from public.training_programs where client_id = p_client_id);
    delete from public.training_columns
    where program_id in (select id from public.training_programs where client_id = p_client_id);
    delete from public.training_programs where client_id = p_client_id;
    delete from public.training_plans where client_id = p_client_id;
    delete from public.workout_logs where client_id = p_client_id;

    -- Dieta
    delete from public.diet_choice_logs where client_id = p_client_id;
    delete from public.diet_option_items
    where diet_meal_option_id in (
        select o.id from public.diet_meal_options o
        left join public.diet_plans p on p.id = coalesce(o.diet_plan_id, o.plan_id)
        where o.client_id = p_client_id or p.client_id = p_client_id
    );
    delete from public.diet_meal_items
    where client_id = p_client_id
       or coalesce(diet_plan_id, plan_id) in (select id from public.diet_plans where client_id = p_client_id);
    delete from public.diet_meal_options
    where client_id = p_client_id
       or coalesce(diet_plan_id, plan_id) in (select id from public.diet_plans where client_id = p_client_id);
    delete from public.diet_meals
    where client_id = p_client_id
       or plan_id in (select id from public.diet_plans where client_id = p_client_id);
    delete from public.diet_plans where client_id = p_client_id;
    delete from public.macro_plans where client_id = p_client_id;
    delete from public.diet_adherence_logs where client_id = p_client_id;
    delete from public.nutrition_log_entries where client_id = p_client_id;
    delete from public.nutrition_day_settings where client_id = p_client_id;

    -- Cardio y Strava
    delete from public.strava_activity_streams
    where strava_activity_id in (select id from public.strava_activities where client_id = p_client_id);
    delete from public.strava_activity_laps
    where strava_activity_id in (select id from public.strava_activities where client_id = p_client_id);
    update public.cardio_sessions set strava_activity_id = null where client_id = p_client_id;
    delete from public.strava_activities where client_id = p_client_id;
    delete from public.cardio_sessions where client_id = p_client_id;
    delete from public.athlete_integrations where client_id = p_client_id;

    -- Suplementos
    delete from public.supplement_reminder_deliveries where client_id = p_client_id;
    delete from public.supplement_dose_logs where client_id = p_client_id;
    delete from public.client_supplements where client_id = p_client_id;

    -- Revisiones
    delete from public.reviews where client_id = p_client_id;
    delete from public.checkin_media where client_id = p_client_id;
    delete from public.checkins where client_id = p_client_id;
    delete from public.client_review_schedules where client_id = p_client_id;

    -- Resto de datos del atleta
    delete from public.client_metrics where client_id = p_client_id;
    delete from public.messages where client_id = p_client_id;
    delete from public.nextia_chat_messages where client_id = p_client_id;
    delete from public.client_notifications where client_id = p_client_id;
    delete from public.client_notification_preferences where client_id = p_client_id;
    delete from public.push_subscriptions where client_id = p_client_id;
    delete from public.client_events where client_id = p_client_id;
    delete from public.client_goals where client_id = p_client_id;
    delete from public.athlete_current_goals where client_id = p_client_id;
    delete from public.athlete_ai_profiles where client_id = p_client_id;
    delete from public.athlete_baseline where client_id = p_client_id;
    delete from public.athlete_thresholds where client_id = p_client_id;
    delete from public.calendar_notes where client_id = p_client_id;
    delete from public.coach_tasks where client_id = p_client_id;
    delete from public.client_invite_logs where client_id = p_client_id;
    delete from public.payment_records where client_id = p_client_id;

    update public.form_templates
    set assigned_client_ids = array_remove(assigned_client_ids, p_client_id)
    where coach_id = p_coach_id and p_client_id = any(assigned_client_ids);

    delete from public.clients where id = p_client_id;
end;
$$;

revoke execute on function public.delete_sample_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_sample_client(uuid, uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
