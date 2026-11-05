-- Modo Sala F0-1, grupo Entrenamiento: las políticas del equipo pasan a las funciones de permisos.
--
-- Propietario y profesionales conservan el mismo acceso; una membresía con rol client deja de
-- contar como equipo y recepción no ve entrenamiento. Las políticas del atleta no cambian.

drop policy if exists athlete_baseline_coach on public.athlete_baseline;
drop policy if exists athlete_thresholds_coach on public.athlete_thresholds;
drop policy if exists "Coach manage cardio" on public.cardio_sessions;
drop policy if exists "Coach manages client cardio" on public.cardio_sessions;
drop policy if exists "Coach full access via client" on public.scheduled_strength_sessions;
drop policy if exists season_plans_coach_delete on public.season_plans;
drop policy if exists season_plans_coach_insert on public.season_plans;
drop policy if exists season_plans_coach_select on public.season_plans;
drop policy if exists season_plans_coach_update on public.season_plans;
drop policy if exists season_phases_coach_all on public.season_phases;
drop policy if exists season_weeks_coach_all on public.season_weeks;
drop policy if exists season_week_targets_coach_all on public.season_week_targets;
drop policy if exists strava_activities_coach on public.strava_activities;
drop policy if exists strava_laps_coach on public.strava_activity_laps;
drop policy if exists strava_streams_coach on public.strava_activity_streams;
drop policy if exists training_cells_coach_all on public.training_cells;
drop policy if exists training_columns_coach_all on public.training_columns;
drop policy if exists training_days_coach_all on public.training_days;
drop policy if exists training_exercises_coach_all on public.training_exercises;
drop policy if exists training_exercise_logs_coach_delete on public.training_exercise_logs;
drop policy if exists training_exercise_logs_coach_insert on public.training_exercise_logs;
drop policy if exists training_exercise_logs_coach_select on public.training_exercise_logs;
drop policy if exists training_exercise_logs_coach_update on public.training_exercise_logs;
drop policy if exists coach_crud_exercise_sets on public.training_exercise_sets;
drop policy if exists training_plans_rw_member on public.training_plans;
drop policy if exists training_programs_coach_all on public.training_programs;
drop policy if exists "Coach manage own templates" on public.training_templates;
drop policy if exists workout_logs_rw_member on public.workout_logs;

-- Programas de los clientes visibles, evaluados una sola vez por consulta.
create or replace function public.training_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select p.id
    from public.training_programs p
    where p.client_id in (select public.training_client_ids());
$$;

revoke all on function public.training_program_ids() from public, anon;
grant execute on function public.training_program_ids() to authenticated, service_role;

-- Tablas con cliente: al escribir, el cliente tiene que ser de ese mismo espacio.
do $$
declare
    t text;
begin
    foreach t in array array[
        'athlete_baseline', 'athlete_thresholds', 'cardio_sessions', 'scheduled_strength_sessions',
        'season_plans', 'training_exercise_logs', 'training_plans', 'training_programs', 'workout_logs'
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

-- Tablas de un programa: al escribir, el programa tiene que ser de ese mismo espacio.
do $$
declare
    t text;
begin
    foreach t in array array['training_cells', 'training_columns', 'training_days', 'training_exercises'] loop
        execute format(
            'create policy %I on public.%I for all to authenticated
                using (program_id in (select public.training_program_ids()))
                with check (
                    program_id in (select public.training_program_ids())
                    and exists (
                        select 1 from public.training_programs p
                        where p.id = %I.program_id and p.coach_id = %I.coach_id
                    )
                )',
            t || '_team_all', t, t, t
        );
    end loop;
end;
$$;

create policy training_exercise_sets_team_all on public.training_exercise_sets
    for all to authenticated
    using (exists (
        select 1 from public.training_exercises te
        where te.id = training_exercise_sets.exercise_id
          and te.program_id in (select public.training_program_ids())
    ))
    with check (exists (
        select 1 from public.training_exercises te
        where te.id = training_exercise_sets.exercise_id
          and te.program_id in (select public.training_program_ids())
    ));

create policy training_templates_team_all on public.training_templates
    for all to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

create policy season_phases_team_all on public.season_phases
    for all to authenticated
    using (exists (
        select 1 from public.season_plans sp
        where sp.id = season_phases.season_plan_id
          and sp.client_id in (select public.training_client_ids())
    ))
    with check (exists (
        select 1 from public.season_plans sp
        where sp.id = season_phases.season_plan_id
          and sp.client_id in (select public.training_client_ids())
    ));

create policy season_weeks_team_all on public.season_weeks
    for all to authenticated
    using (exists (
        select 1 from public.season_plans sp
        where sp.id = season_weeks.season_plan_id
          and sp.client_id in (select public.training_client_ids())
    ))
    with check (exists (
        select 1 from public.season_plans sp
        where sp.id = season_weeks.season_plan_id
          and sp.client_id in (select public.training_client_ids())
    ));

create policy season_week_targets_team_all on public.season_week_targets
    for all to authenticated
    using (exists (
        select 1
        from public.season_weeks sw
        join public.season_plans sp on sp.id = sw.season_plan_id
        where sw.id = season_week_targets.season_week_id
          and sp.client_id in (select public.training_client_ids())
    ))
    with check (exists (
        select 1
        from public.season_weeks sw
        join public.season_plans sp on sp.id = sw.season_plan_id
        where sw.id = season_week_targets.season_week_id
          and sp.client_id in (select public.training_client_ids())
    ));

-- Strava: el equipo solo lee.
create policy strava_activities_team_select on public.strava_activities
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy strava_laps_team_select on public.strava_activity_laps
    for select to authenticated
    using (exists (
        select 1 from public.strava_activities a
        where a.id = strava_activity_laps.strava_activity_id
          and a.client_id in (select public.training_client_ids())
    ));

create policy strava_streams_team_select on public.strava_activity_streams
    for select to authenticated
    using (exists (
        select 1 from public.strava_activities a
        where a.id = strava_activity_streams.strava_activity_id
          and a.client_id in (select public.training_client_ids())
    ));
