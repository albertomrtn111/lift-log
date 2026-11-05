-- Modo Sala F0-1, grupo Revisiones y seguimiento: las políticas del equipo pasan a las
-- funciones de permisos.
--
-- Datos de un cliente: training_client_ids(). Plantillas del espacio: is_coach_member.
-- Propietario y profesionales conservan el mismo acceso; una membresía con rol client deja
-- de contar como equipo. Las políticas del propio atleta no cambian, salvo que las de
-- checkin_media se separan de las del equipo.

drop policy if exists athlete_ai_profiles_delete on public.athlete_ai_profiles;
drop policy if exists athlete_ai_profiles_insert on public.athlete_ai_profiles;
drop policy if exists athlete_ai_profiles_select on public.athlete_ai_profiles;
drop policy if exists athlete_ai_profiles_update on public.athlete_ai_profiles;

drop policy if exists athlete_current_goals_delete on public.athlete_current_goals;
drop policy if exists athlete_current_goals_insert on public.athlete_current_goals;
drop policy if exists athlete_current_goals_select on public.athlete_current_goals;
drop policy if exists athlete_current_goals_update on public.athlete_current_goals;

drop policy if exists checkin_media_delete on public.checkin_media;
drop policy if exists checkin_media_insert on public.checkin_media;
drop policy if exists checkin_media_select on public.checkin_media;
drop policy if exists checkin_media_update_coach on public.checkin_media;

drop policy if exists checkins_rw_member on public.checkins;

drop policy if exists client_events_delete on public.client_events;
drop policy if exists client_events_insert on public.client_events;
drop policy if exists client_events_select on public.client_events;
drop policy if exists client_events_update on public.client_events;

drop policy if exists client_goals_rw_member on public.client_goals;
drop policy if exists client_metrics_rw_member on public.client_metrics;

drop policy if exists crs_delete on public.client_review_schedules;
drop policy if exists crs_insert on public.client_review_schedules;
drop policy if exists crs_select on public.client_review_schedules;
drop policy if exists crs_update on public.client_review_schedules;

drop policy if exists reviews_rw_member on public.reviews;

drop policy if exists form_templates_delete_coach on public.form_templates;
drop policy if exists form_templates_delete_member on public.form_templates;
drop policy if exists form_templates_insert_coach on public.form_templates;
drop policy if exists form_templates_insert_member on public.form_templates;
drop policy if exists form_templates_select_coach on public.form_templates;
drop policy if exists form_templates_select_member on public.form_templates;
drop policy if exists form_templates_update_coach on public.form_templates;
drop policy if exists form_templates_update_member on public.form_templates;

drop policy if exists "Coaches manage own metric definitions" on public.metric_definitions;
drop policy if exists metric_definitions_select_active_coach_member on public.metric_definitions;

drop policy if exists review_templates_delete on public.review_templates;
drop policy if exists review_templates_insert on public.review_templates;
drop policy if exists review_templates_select on public.review_templates;
drop policy if exists review_templates_update on public.review_templates;

drop policy if exists rtm_delete on public.review_template_metrics;
drop policy if exists rtm_insert on public.review_template_metrics;
drop policy if exists rtm_select on public.review_template_metrics;
drop policy if exists rtm_update on public.review_template_metrics;

-- Los mismos clientes que can_see_training, de una vez. Las políticas lo evalúan una sola vez
-- por consulta; llamar a can_see_training por cada fila hace las listas unas 18 veces más lentas.
create or replace function public.training_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.id
    from public.clients c
    join public.coaches sp on sp.id = c.coach_id
    join public.coach_memberships cm on cm.coach_id = c.coach_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach')
      and (
          sp.client_visibility = 'all'
          or cm.role in ('owner', 'admin')
          or exists (
              select 1 from public.client_professionals cp
              where cp.client_id = c.id and cp.user_id = auth.uid()
          )
      );
$$;

revoke all on function public.training_client_ids() from public, anon;
grant execute on function public.training_client_ids() to authenticated, service_role;

-- Datos de un cliente: al escribir, el cliente tiene que ser de ese mismo espacio.
do $$
declare
    t text;
begin
    foreach t in array array[
        'athlete_ai_profiles', 'athlete_current_goals', 'checkin_media', 'checkins',
        'client_events', 'client_goals', 'client_metrics', 'client_review_schedules', 'reviews'
    ] loop
        execute format(
            'create policy %I on public.%I for all to authenticated
                using (client_id in (select public.training_client_ids()))
                with check (
                    client_id in (select public.training_client_ids())
                    and exists (
                        select 1 from public.clients c
                        where c.id = %I.client_id and c.coach_id = %I.coach_id
                    )
                )',
            t || '_team_all', t, t, t
        );
    end loop;
end;
$$;

-- El atleta conserva sus fotos, ahora en políticas propias.
create policy checkin_media_self_select on public.checkin_media
    for select to authenticated
    using (exists (
        select 1 from public.clients c
        where c.id = checkin_media.client_id and c.auth_user_id = auth.uid()
    ));

create policy checkin_media_self_insert on public.checkin_media
    for insert to authenticated
    with check (exists (
        select 1 from public.clients c
        where c.id = checkin_media.client_id and c.auth_user_id = auth.uid()
    ));

create policy checkin_media_self_delete on public.checkin_media
    for delete to authenticated
    using (exists (
        select 1 from public.clients c
        where c.id = checkin_media.client_id and c.auth_user_id = auth.uid()
    ));

-- Plantillas y definiciones del espacio.
create policy form_templates_team_all on public.form_templates
    for all to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

create policy metric_definitions_team_all on public.metric_definitions
    for all to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

create policy review_templates_team_all on public.review_templates
    for all to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

create policy review_template_metrics_team_all on public.review_template_metrics
    for all to authenticated
    using (exists (
        select 1 from public.review_templates rt
        where rt.id = review_template_metrics.review_template_id
          and public.is_coach_member(rt.coach_id)
    ))
    with check (exists (
        select 1 from public.review_templates rt
        where rt.id = review_template_metrics.review_template_id
          and public.is_coach_member(rt.coach_id)
    ));
