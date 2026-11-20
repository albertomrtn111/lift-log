-- Un atleta dado de baja (clients.status <> 'active') deja de ver y cambiar sus datos
-- con su propia sesión. Sus datos no se tocan: al reactivarle vuelve a verlo todo.
-- El lado del equipo ya exigía coach_memberships.status = 'active'.

-- Devuelve el usuario conectado solo si la ficha de atleta está activa.
-- Se usa en las reglas que comparan clients.user_id / auth_user_id con auth.uid().
create or replace function public.uid_if_active(p_status text)
returns uuid
language sql
stable
set search_path to ''
as $$
    select case when p_status = 'active' then auth.uid() end
$$;

revoke all on function public.uid_if_active(text) from public;
grant execute on function public.uid_if_active(text) to anon, authenticated, service_role;

-- Funciones de comprobación del lado del atleta: ahora exigen ficha activa.
create or replace function public.is_client_self(p_client_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
    select exists (
        select 1 from public.clients c
        where c.id = p_client_id
          and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
          and c.status = 'active'
    );
$$;

create or replace function public.is_client_in_coach(p_coach_id uuid, p_client_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.coach_id = p_coach_id
      and c.auth_user_id = auth.uid()
      and c.status = 'active'
  );
$$;

create or replace function public.is_my_coach(p_coach_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
    select exists (
        select 1 from public.clients c
        where c.coach_id = p_coach_id
          and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
          and c.status = 'active'
    );
$$;

create or replace function public.is_client(p_client_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = auth.uid()
      and c.status = 'active'
  );
$$;

create or replace function public.is_client_for_diet_plan(p_diet_plan_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.diet_plans dp
    join public.clients c on c.id = dp.client_id
    where dp.id = p_diet_plan_id
      and c.user_id = auth.uid()
      and c.status = 'active'
  );
$$;

create or replace function public.is_client_for_diet_option(p_option_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.diet_meal_options o
    join public.diet_meals m on m.id = o.diet_meal_id
    join public.diet_plans dp on dp.id = m.diet_plan_id
    join public.clients c on c.id = dp.client_id
    where o.id = p_option_id
      and c.user_id = auth.uid()
      and c.status = 'active'
  );
$$;

create or replace function public.is_program_client(p_program_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.training_programs p
    join public.clients c on c.id = p.client_id
    where p.id = p_program_id
      and c.user_id = auth.uid()
      and c.status = 'active'
  );
$$;

create or replace function public.can_client_write_cell(p_program_id uuid, p_column_id uuid, p_week_index integer)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.training_programs p
    join public.clients c on c.id = p.client_id
    join public.training_columns col on col.id = p_column_id and col.program_id = p_program_id
    where p.id = p_program_id
      and c.user_id = auth.uid()
      and c.status = 'active'
      and col.scope = 'week'
      and col.editable_by in ('client', 'both')
      and p_week_index between 1 and p.weeks
  );
$$;

-- Reglas que comparaban la ficha con auth.uid() sin mirar el estado.
alter policy "Client read cardio" on public.cardio_sessions using ((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = cardio_sessions.client_id) AND (clients.user_id = public.uid_if_active(clients.status))))));
alter policy "Client updates own cardio" on public.cardio_sessions using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = cardio_sessions.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy "Client views own cardio" on public.cardio_sessions using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = cardio_sessions.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy checkin_media_self_delete on public.checkin_media using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = checkin_media.client_id) AND (c.auth_user_id = public.uid_if_active(c.status))))));
alter policy checkin_media_self_insert on public.checkin_media with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = checkin_media.client_id) AND (c.auth_user_id = public.uid_if_active(c.status))))));
alter policy checkin_media_self_select on public.checkin_media using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = checkin_media.client_id) AND (c.auth_user_id = public.uid_if_active(c.status))))));
alter policy client_notification_prefs_self on public.client_notification_preferences using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = client_notification_preferences.client_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status)))))));
alter policy cn_client_select on public.client_notifications using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = client_notifications.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy cn_client_update on public.client_notifications using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = client_notifications.client_id) AND (c.user_id = public.uid_if_active(c.status)))))) with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = client_notifications.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy clients_select_self on public.clients using ((auth_user_id = public.uid_if_active(status)));
alter policy clients_update_self on public.clients using ((auth_user_id = public.uid_if_active(status))) with check ((auth_user_id = public.uid_if_active(status)));
alter policy diet_plans_client_select on public.diet_plans using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = diet_plans.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy form_templates_select_via_checkin on public.form_templates using ((EXISTS ( SELECT 1 FROM (checkins c JOIN clients cl ON ((cl.id = c.client_id))) WHERE ((c.form_template_id = form_templates.id) AND (cl.auth_user_id = public.uid_if_active(cl.status))))));
alter policy macro_plans_client_select on public.macro_plans using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = macro_plans.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy "Clients can read metrics of their coach" on public.metric_definitions using ((coach_id IN ( SELECT clients.coach_id FROM clients WHERE (clients.auth_user_id = public.uid_if_active(clients.status)))));
alter policy nutrition_blocks_client_select on public.nutrition_blocks using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_blocks.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nds_client_all_own on public.nutrition_day_settings using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_day_settings.client_id) AND (c.user_id = public.uid_if_active(c.status)))))) with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_day_settings.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nle_client_delete_own on public.nutrition_log_entries using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_log_entries.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nle_client_insert_own on public.nutrition_log_entries with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_log_entries.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nle_client_select_own on public.nutrition_log_entries using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_log_entries.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nle_client_update_own on public.nutrition_log_entries using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_log_entries.client_id) AND (c.user_id = public.uid_if_active(c.status)))))) with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_log_entries.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy nutrition_planned_days_client_select on public.nutrition_planned_days using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = nutrition_planned_days.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy push_subscriptions_client_rw on public.push_subscriptions using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = push_subscriptions.client_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status))))))) with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = push_subscriptions.client_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status)))))));
alter policy "Client read access" on public.scheduled_strength_sessions using ((EXISTS ( SELECT 1 FROM clients WHERE ((clients.id = scheduled_strength_sessions.client_id) AND (clients.user_id = public.uid_if_active(clients.status))))));
alter policy "Client update own schedule" on public.scheduled_strength_sessions using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = scheduled_strength_sessions.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy "Client view own schedule" on public.scheduled_strength_sessions using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = scheduled_strength_sessions.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy strava_activities_client on public.strava_activities using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = strava_activities.client_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status)))))));
alter policy strava_laps_client on public.strava_activity_laps using ((EXISTS ( SELECT 1 FROM (strava_activities a JOIN clients c ON ((c.id = a.client_id))) WHERE ((a.id = strava_activity_laps.strava_activity_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status)))))));
alter policy strava_streams_client on public.strava_activity_streams using ((EXISTS ( SELECT 1 FROM (strava_activities a JOIN clients c ON ((c.id = a.client_id))) WHERE ((a.id = strava_activity_streams.strava_activity_id) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status)))))));
alter policy training_exercise_logs_client_delete on public.training_exercise_logs using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = training_exercise_logs.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy training_exercise_logs_client_insert on public.training_exercise_logs with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = training_exercise_logs.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy training_exercise_logs_client_select on public.training_exercise_logs using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = training_exercise_logs.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy training_exercise_logs_client_update on public.training_exercise_logs using ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = training_exercise_logs.client_id) AND (c.user_id = public.uid_if_active(c.status)))))) with check ((EXISTS ( SELECT 1 FROM clients c WHERE ((c.id = training_exercise_logs.client_id) AND (c.user_id = public.uid_if_active(c.status))))));
alter policy client_crud_exercise_sets on public.training_exercise_sets using ((EXISTS ( SELECT 1 FROM ((training_exercises te JOIN training_programs tp ON ((tp.id = te.program_id))) JOIN clients c ON ((c.id = tp.client_id))) WHERE ((te.id = training_exercise_sets.exercise_id) AND (c.auth_user_id = public.uid_if_active(c.status)))))) with check ((EXISTS ( SELECT 1 FROM ((training_exercises te JOIN training_programs tp ON ((tp.id = te.program_id))) JOIN clients c ON ((c.id = tp.client_id))) WHERE ((te.id = training_exercise_sets.exercise_id) AND (c.auth_user_id = public.uid_if_active(c.status))))));
alter policy chat_media_client_insert on storage.objects with check (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = ((storage.foldername(objects.name))[2])::uuid) AND (c.coach_id = ((storage.foldername(objects.name))[1])::uuid) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status))))))));
alter policy chat_media_client_read on storage.objects using (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = ((storage.foldername(objects.name))[2])::uuid) AND (c.coach_id = ((storage.foldername(objects.name))[1])::uuid) AND ((c.auth_user_id = public.uid_if_active(c.status)) OR (c.user_id = public.uid_if_active(c.status))))))));
alter policy checkin_media_storage_delete on storage.objects using (((bucket_id = 'checkin-media'::text) AND (public.is_coach_member(public.safe_uuid(split_part(name, '/'::text, 1))) OR (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = public.safe_uuid(split_part(objects.name, '/'::text, 2))) AND (c.auth_user_id = public.uid_if_active(c.status))))))));
alter policy checkin_media_storage_insert on storage.objects with check (((bucket_id = 'checkin-media'::text) AND (public.is_coach_member(public.safe_uuid(split_part(name, '/'::text, 1))) OR (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = public.safe_uuid(split_part(objects.name, '/'::text, 2))) AND (c.auth_user_id = public.uid_if_active(c.status))))))));
alter policy checkin_media_storage_select on storage.objects using (((bucket_id = 'checkin-media'::text) AND (public.is_coach_member(public.safe_uuid(split_part(name, '/'::text, 1))) OR (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = public.safe_uuid(split_part(objects.name, '/'::text, 2))) AND (c.auth_user_id = public.uid_if_active(c.status))))))));
alter policy checkin_media_storage_update on storage.objects using (((bucket_id = 'checkin-media'::text) AND (public.is_coach_member(public.safe_uuid(split_part(name, '/'::text, 1))) OR (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = public.safe_uuid(split_part(objects.name, '/'::text, 2))) AND (c.auth_user_id = public.uid_if_active(c.status)))))))) with check (((bucket_id = 'checkin-media'::text) AND (public.is_coach_member(public.safe_uuid(split_part(name, '/'::text, 1))) OR (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = public.safe_uuid(split_part(objects.name, '/'::text, 2))) AND (c.auth_user_id = public.uid_if_active(c.status))))))));
