-- Prueba de integración del calendario de nutrición con un cliente temporal y el rol
-- authenticated. Requiere 20261115100000_nutrition_calendar.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
    v_coach uuid;
    v_user uuid;
    v_client uuid := gen_random_uuid();
    v_today date;
    v_base jsonb;
    v_a jsonb;
    v_b jsonb;
    v_r record;
    v_n integer;
    v_assertions integer := 0;
    v_days jsonb;
begin
    select coach_id, user_id into v_coach, v_user from public.coach_memberships
        where status = 'active' and role = 'owner' order by created_at limit 1;
    if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
    v_today := public.nexttrain_coach_today(v_coach);
    insert into public.clients (id, coach_id, user_id, full_name, status)
        values (v_client, v_coach, v_user, 'Nutrition calendar rollback test', 'active');
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    execute 'set local role authenticated';

    -- Plan base de 2.600 desde hace una semana.
    v_base := public.save_nexttrain_nutrition_plan('macros', v_coach, v_client, null,
        jsonb_build_object('kcal', 2600, 'protein_g', 150, 'carbs_g', 330, 'fat_g', 75, 'effective_from', v_today - 7), null);

    -- 1. Sin nada planificado, la regla devuelve el plan base.
    select * into v_r from public.nutrition_targets_for(v_client, v_today, v_today);
    if v_r.source <> 'base' or v_r.kcal <> 2600 or v_r.macro_plan_id <> (v_base->>'id')::uuid then
        raise exception 'Sin días planificados debería mandar el plan base: %', row_to_json(v_r);
    end if;
    v_assertions := v_assertions + 1;

    -- 2. Bloque de tres días (carga de hidratos) a partir de pasado mañana.
    v_days := jsonb_build_array(
        jsonb_build_object('date', v_today + 2, 'kcal', 3400, 'protein_g', 150, 'carbs_g', 530, 'fat_g', 60, 'label', 'Carga HC 1/3'),
        jsonb_build_object('date', v_today + 3, 'kcal', 3600, 'protein_g', 150, 'carbs_g', 580, 'fat_g', 60, 'label', 'Carga HC 2/3'),
        jsonb_build_object('date', v_today + 4, 'kcal', 3800, 'protein_g', 150, 'carbs_g', 630, 'fat_g', 60, 'label', 'Carga HC 3/3'));
    v_a := public.save_nutrition_block(v_coach, v_client, null,
        jsonb_build_object('name', 'Maratón', 'kind', 'days', 'change_note', 'Carga antes de la carrera'), v_days, false);
    if (v_a->>'days')::int <> 3 or (v_a->>'start_date')::date <> v_today + 2 or (v_a->>'end_date')::date <> v_today + 4 then
        raise exception 'Bloque mal guardado: %', v_a;
    end if;
    select count(*) into v_n from public.nutrition_targets_for(v_client, v_today, v_today + 6) t where t.source = 'planned';
    if v_n <> 3 then raise exception 'Deberían mandar 3 días planificados y mandan %.', v_n; end if;
    select * into v_r from public.nutrition_targets_for(v_client, v_today + 3, v_today + 3);
    if v_r.kcal <> 3600 or v_r.label <> 'Carga HC 2/3' or v_r.block_name <> 'Maratón' then
        raise exception 'Día planificado incorrecto: %', row_to_json(v_r);
    end if;
    select * into v_r from public.nutrition_targets_for(v_client, v_today + 5, v_today + 5);
    if v_r.source <> 'base' or v_r.kcal <> 2600 then raise exception 'Tras el bloque debería volver al plan base.'; end if;
    v_assertions := v_assertions + 1;

    -- 3. Otro bloque que pisa un día: falla sin confirmar.
    begin
        perform public.save_nutrition_block(v_coach, v_client, null, jsonb_build_object('name', 'Otro'),
            jsonb_build_array(jsonb_build_object('date', v_today + 4, 'kcal', 2000, 'protein_g', 150, 'carbs_g', 200, 'fat_g', 70)), false);
        raise exception 'Se permitió pisar un día planificado sin confirmar.';
    exception when raise_exception then
        if sqlerrm not like 'Ya hay días planificados%' then raise; end if;
        v_assertions := v_assertions + 1;
    end;

    -- 4. Confirmado: el día pisado queda archivado y el primer bloque se acorta.
    v_b := public.save_nutrition_block(v_coach, v_client, null, jsonb_build_object('name', 'Otro'),
        jsonb_build_array(jsonb_build_object('date', v_today + 4, 'kcal', 2000, 'protein_g', 150, 'carbs_g', 200, 'fat_g', 70)), true);
    if (v_b->'replaced_dates')->>0 <> (v_today + 4)::text then raise exception 'No informa del día sustituido: %', v_b; end if;
    if (select end_date from public.nutrition_blocks where id = (v_a->>'id')::uuid) <> v_today + 3 then
        raise exception 'El bloque pisado debería terminar un día antes.';
    end if;
    select * into v_r from public.nutrition_targets_for(v_client, v_today + 4, v_today + 4);
    if v_r.kcal <> 2000 then raise exception 'Debería mandar el bloque nuevo.'; end if;
    v_assertions := v_assertions + 1;

    -- 5. No se planifican días pasados.
    begin
        perform public.save_nutrition_block(v_coach, v_client, null, jsonb_build_object('name', 'Pasado'),
            jsonb_build_array(jsonb_build_object('date', v_today - 1, 'kcal', 2000, 'protein_g', 150, 'carbs_g', 200, 'fat_g', 70)), true);
        raise exception 'Se permitió planificar un día pasado.';
    exception when raise_exception then
        if sqlerrm not like 'No se pueden planificar días pasados%' then raise; end if;
        v_assertions := v_assertions + 1;
    end;

    -- 6. Volver al plan base: el bloque que se queda sin días queda archivado.
    perform public.clear_nutrition_planned_days(v_coach, v_client, array[v_today + 4]);
    if (select archived_at from public.nutrition_blocks where id = (v_b->>'id')::uuid) is null then
        raise exception 'El bloque sin días debería quedar archivado.';
    end if;
    select * into v_r from public.nutrition_targets_for(v_client, v_today + 4, v_today + 4);
    if v_r.source <> 'base' then raise exception 'Tras quitarlo debería mandar el plan base.'; end if;
    v_assertions := v_assertions + 1;

    -- 7. Historial: el bloque vigente sale como «block» con sus días.
    select * into v_r from public.nutrition_plan_history where id = (v_a->>'id')::uuid;
    if v_r.kind <> 'block' or v_r.status <> 'scheduled' or v_r.planned_days <> 2 or v_r.change_note <> 'Carga antes de la carrera' then
        raise exception 'Historial del bloque incorrecto: %', row_to_json(v_r);
    end if;
    v_assertions := v_assertions + 1;

    -- 8. Otro coach no puede escribir.
    begin
        perform public.save_nutrition_block(gen_random_uuid(), v_client, null, jsonb_build_object('name', 'X'), v_days, true);
        raise exception 'Se permitió escribir en otro espacio.';
    exception when insufficient_privilege then v_assertions := v_assertions + 1; end;

    execute 'reset role';
    if v_assertions <> 8 then raise exception 'No se han completado las 8 verificaciones.'; end if;
end;
$tests$;
rollback;
select 8 as assertions_completed_before_rollback,
    not exists (select 1 from public.clients where full_name = 'Nutrition calendar rollback test') as temporary_data_rolled_back;
