-- Modo Sala F0-1, grupo Nutrición: las políticas del equipo pasan a training_client_ids().
--
-- Propietario y profesionales conservan el mismo acceso; una membresía con rol client deja de
-- contar como equipo y recepción no ve nutrición. Las políticas del atleta no cambian.
-- diet_meals, diet_meal_options y diet_meal_items reciben coach_id y client_id de sus
-- disparadores BEFORE, que corren antes de comprobar la política.

drop policy if exists supplements_rw_member on public.client_supplements;
drop policy if exists macro_plans_rw_member on public.macro_plans;

drop policy if exists diet_plans_coach_delete on public.diet_plans;
drop policy if exists diet_plans_coach_delete_archived on public.diet_plans;
drop policy if exists diet_plans_coach_insert on public.diet_plans;
drop policy if exists diet_plans_coach_select on public.diet_plans;
drop policy if exists diet_plans_coach_update on public.diet_plans;

drop policy if exists diet_meals_coach_all on public.diet_meals;
drop policy if exists diet_meals_coach_delete on public.diet_meals;
drop policy if exists diet_meals_coach_insert on public.diet_meals;
drop policy if exists diet_meals_coach_select on public.diet_meals;
drop policy if exists diet_meals_coach_update on public.diet_meals;

drop policy if exists diet_meal_options_coach_all on public.diet_meal_options;
drop policy if exists diet_meal_options_coach_delete on public.diet_meal_options;
drop policy if exists diet_meal_options_coach_insert on public.diet_meal_options;
drop policy if exists diet_meal_options_coach_select on public.diet_meal_options;
drop policy if exists diet_meal_options_coach_update on public.diet_meal_options;

drop policy if exists diet_meal_items_coach_all on public.diet_meal_items;
drop policy if exists diet_meal_items_coach_delete on public.diet_meal_items;
drop policy if exists diet_meal_items_coach_insert on public.diet_meal_items;
drop policy if exists diet_meal_items_coach_select on public.diet_meal_items;
drop policy if exists diet_meal_items_coach_update on public.diet_meal_items;

drop policy if exists diet_adherence_logs_delete on public.diet_adherence_logs;
drop policy if exists diet_adherence_logs_insert on public.diet_adherence_logs;
drop policy if exists diet_adherence_logs_select on public.diet_adherence_logs;
drop policy if exists diet_adherence_logs_update on public.diet_adherence_logs;

drop policy if exists diet_choice_logs_select on public.diet_choice_logs;

drop policy if exists diet_option_items_delete on public.diet_option_items;
drop policy if exists diet_option_items_insert on public.diet_option_items;
drop policy if exists diet_option_items_select on public.diet_option_items;
drop policy if exists diet_option_items_update on public.diet_option_items;

drop policy if exists nds_coach_select on public.nutrition_day_settings;
drop policy if exists nle_coach_select on public.nutrition_log_entries;

-- Tablas con cliente: al escribir, el cliente tiene que ser de ese mismo espacio.
do $$
declare
    t text;
begin
    foreach t in array array[
        'client_supplements', 'macro_plans', 'diet_plans', 'diet_meals', 'diet_meal_options', 'diet_meal_items'
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

-- El equipo solo lee lo que registra el atleta.
create policy nds_team_select on public.nutrition_day_settings
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy nle_team_select on public.nutrition_log_entries
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

-- Adherencia: la registran el atleta y el equipo, siempre a su nombre.
create policy diet_adherence_logs_select on public.diet_adherence_logs
    for select to authenticated
    using (client_id in (select public.training_client_ids()) or public.is_client_user(client_id));

create policy diet_adherence_logs_insert on public.diet_adherence_logs
    for insert to authenticated
    with check (
        (client_id in (select public.training_client_ids()) or public.is_client_user(client_id))
        and created_by = auth.uid()
    );

create policy diet_adherence_logs_update on public.diet_adherence_logs
    for update to authenticated
    using (client_id in (select public.training_client_ids()) or public.is_client_user(client_id))
    with check (client_id in (select public.training_client_ids()) or public.is_client_user(client_id));

create policy diet_adherence_logs_delete on public.diet_adherence_logs
    for delete to authenticated
    using (client_id in (select public.training_client_ids()));

create policy diet_choice_logs_select on public.diet_choice_logs
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or exists (
            select 1 from public.clients c
            where c.id = diet_choice_logs.client_id
              and c.user_id = auth.uid()
              and c.status = 'active'
        )
    );

-- Alimentos de cada opción, a través del plan.
create policy diet_option_items_select on public.diet_option_items
    for select to authenticated
    using (exists (
        select 1
        from public.diet_meal_options dmo
        join public.diet_meals dm on dm.id = dmo.diet_meal_id
        join public.diet_plans dp on dp.id = dm.plan_id
        where dmo.id = diet_option_items.diet_meal_option_id
          and (dp.client_id in (select public.training_client_ids()) or public.is_client_user(dp.client_id))
    ));

create policy diet_option_items_team_write on public.diet_option_items
    for all to authenticated
    using (exists (
        select 1
        from public.diet_meal_options dmo
        join public.diet_meals dm on dm.id = dmo.diet_meal_id
        join public.diet_plans dp on dp.id = dm.plan_id
        where dmo.id = diet_option_items.diet_meal_option_id
          and dp.client_id in (select public.training_client_ids())
    ))
    with check (exists (
        select 1
        from public.diet_meal_options dmo
        join public.diet_meals dm on dm.id = dmo.diet_meal_id
        join public.diet_plans dp on dp.id = dm.plan_id
        where dmo.id = diet_option_items.diet_meal_option_id
          and dp.client_id in (select public.training_client_ids())
    ));
