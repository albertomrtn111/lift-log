-- Prueba de integración de update_nexttrain_strength_program_days con un cliente
-- temporal y el rol authenticated. Sirve con y sin la biblioteca de ejercicios
-- (resolve_catalog_exercise). Termina con ROLLBACK explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_program uuid := gen_random_uuid();
  v_day_a uuid := gen_random_uuid();
  v_day_b uuid := gen_random_uuid();
  v_squat uuid := gen_random_uuid();
  v_press uuid := gen_random_uuid();
  v_bench uuid := gen_random_uuid();
  v_row uuid := gen_random_uuid();
  v_version timestamptz;
  v_catalog boolean := pg_catalog.to_regprocedure('public.resolve_catalog_exercise(uuid,text)') is not null;
  v_new_name text := 'Hip thrust MCP test';
  v_result jsonb;
  v_payload jsonb;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  if v_catalog then
    -- Con biblioteca, el ejercicio nuevo tiene que existir en ella.
    execute 'select name from public.exercise_catalog where is_active order by name limit 1' into v_new_name;
  end if;

  insert into public.clients (id, coach_id, user_id, full_name, status) values (v_client, v_coach, v_user, 'MCP strength days rollback test', 'active');
  -- updated_at en el pasado: dentro de la transacción now() no cambia.
  insert into public.training_programs (id, coach_id, client_id, name, weeks, total_weeks, status, effective_from, effective_to, updated_at)
    values (v_program, v_coach, v_client, 'Bloque edición', 4, 4, 'draft', current_date, current_date + 27, now() - interval '1 day');
  insert into public.training_days (id, coach_id, program_id, name, day_name, order_index, day_order, default_weekday) values
    (v_day_a, v_coach, v_program, 'Pierna', 'Pierna', 1, 1, 1),
    (v_day_b, v_coach, v_program, 'Torso', 'Torso', 2, 2, 4);
  insert into public.training_exercises (id, coach_id, program_id, day_id, order_index, exercise_name, muscle_group, sets, reps) values
    (v_squat, v_coach, v_program, v_day_a, 1, 'Sentadilla', 'cuádriceps', 4, '6'),
    (v_press, v_coach, v_program, v_day_a, 2, 'Prensa', 'cuádriceps', 3, '10'),
    (v_bench, v_coach, v_program, v_day_b, 1, 'Press banca', 'pecho', 4, '8'),
    (v_row, v_coach, v_program, v_day_b, 2, 'Remo', 'espalda', 4, '10');
  -- Sentadilla: serie completada. Prensa: solo la prescripción. Press banca: registro del atleta.
  insert into public.training_exercise_sets (exercise_id, week_index, set_index, weight_kg, reps, completed, is_override) values
    (v_squat, 1, 0, 100, 6, true, false),
    (v_press, 1, 0, 150, 10, false, false);
  insert into public.training_exercise_logs (coach_id, client_id, program_id, day_id, exercise_id, week_index, sets)
    values (v_coach, v_client, v_program, v_day_b, v_bench, 1, '[{"set":1,"weight":60,"reps":8}]'::jsonb);
  insert into public.scheduled_strength_sessions (coach_id, client_id, program_id, day_id, scheduled_date, is_completed) values
    (v_coach, v_client, v_program, v_day_a, current_date + 7, false),
    (v_coach, v_client, v_program, v_day_b, current_date - 3, true),
    (v_coach, v_client, v_program, v_day_b, current_date + 10, false);

  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';
  select updated_at into v_version from public.training_programs where id = v_program;

  -- Estructura válida: Pierna conserva Sentadilla (5 series) y recibe Remo; Prensa sale (sin resultados);
  -- Torso pasa del jueves al viernes; se añade Glúteo el sábado con un ejercicio nuevo.
  v_payload := jsonb_build_object('expected_updated_at', v_version, 'days', jsonb_build_array(
    jsonb_build_object('id', v_day_a, 'name', 'Pierna', 'weekday', 1, 'exercises', jsonb_build_array(
      jsonb_build_object('id', v_squat, 'sets', 5),
      jsonb_build_object('id', v_row))),
    jsonb_build_object('id', v_day_b, 'name', 'Torso', 'weekday', 5, 'exercises', jsonb_build_array(
      jsonb_build_object('id', v_bench))),
    jsonb_build_object('name', 'Glúteo', 'weekday', 6, 'exercises', jsonb_build_array(
      jsonb_build_object('name', v_new_name, 'sets', 3, 'reps', '12', 'rir', 2)))));

  -- 1. Versión antigua.
  begin
    perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program,
      jsonb_set(v_payload, '{expected_updated_at}', to_jsonb(v_version - interval '1 hour')));
    raise exception 'Se aceptó una edición con versión antigua.';
  exception when others then
    if sqlerrm <> 'El programa cambió; vuelve a leer get_program_history.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 2. Quitar un ejercicio con resultados.
  begin
    perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program,
      jsonb_set(v_payload, '{days,0,exercises}', jsonb_build_array(jsonb_build_object('id', v_row))));
    raise exception 'Se quitó un ejercicio con resultados.';
  exception when others then
    if sqlerrm not like 'No se pueden quitar ejercicios con resultados registrados: Sentadilla.%' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 3. Quitar un día con sesión completada y registros (aunque su ejercicio se mueva).
  begin
    perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, jsonb_build_object(
      'expected_updated_at', v_version, 'days', jsonb_build_array(
        jsonb_build_object('id', v_day_a, 'name', 'Pierna', 'weekday', 1, 'exercises', jsonb_build_array(
          jsonb_build_object('id', v_squat), jsonb_build_object('id', v_press), jsonb_build_object('id', v_bench), jsonb_build_object('id', v_row))))));
    raise exception 'Se quitó un día con sesiones completadas.';
  exception when others then
    if sqlerrm not like 'No se pueden quitar días con sesiones completadas o resultados registrados: Torso.%' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 4. Un id de otro programa.
  begin
    perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program,
      jsonb_set(v_payload, '{days,0,id}', to_jsonb(gen_random_uuid())));
    raise exception 'Se aceptó un día ajeno.';
  exception when others then
    if sqlerrm <> 'Hay un día que no pertenece a este programa.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 5. Con biblioteca, un ejercicio que no está en ella se rechaza.
  if v_catalog then
    begin
      perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program,
        jsonb_set(v_payload, '{days,2,exercises,0,name}', '"Ejercicio inexistente MCP"'));
      raise exception 'Se aceptó un ejercicio fuera de la biblioteca.';
    exception when others then
      if sqlerrm not like 'Estos ejercicios no están en la biblioteca: Ejercicio inexistente MCP.%' then raise; end if;
    end;
  end if;
  v_assertions := v_assertions + 1;

  -- 6. Edición válida.
  v_result := public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, v_payload);
  if (v_result->>'day_count')::integer <> 3 or (v_result->>'exercise_count')::integer <> 4
    or (v_result->>'removed_exercise_count')::integer <> 1 or (v_result->>'removed_day_count')::integer <> 0
    or (v_result->>'removed_scheduled_sessions')::integer <> 1
    or (v_result->>'catalog_enforced')::boolean <> v_catalog
    or (v_result->>'updated_at')::timestamptz = v_version then
    raise exception 'Resumen de la edición incorrecto: %', v_result;
  end if;
  v_assertions := v_assertions + 1;

  if exists (select 1 from public.training_exercises where id = v_press)
    or exists (select 1 from public.training_exercise_sets where exercise_id = v_press)
    or (select sets from public.training_exercises where id = v_squat) <> 5
    or (select reps from public.training_exercises where id = v_squat) <> '6'
    or not exists (select 1 from public.training_exercise_sets where exercise_id = v_squat and completed)
    or (select day_id from public.training_exercises where id = v_row) <> v_day_a
    or (select order_index from public.training_exercises where id = v_row) <> 2
    or (select default_weekday from public.training_days where id = v_day_b) <> 5
    or (select count(*) from public.scheduled_strength_sessions where day_id = v_day_b) <> 1
    or (select count(*) from public.scheduled_strength_sessions where day_id = v_day_a) <> 1 then
    raise exception 'La estructura guardada no es la esperada.';
  end if;
  v_assertions := v_assertions + 1;

  if not exists (select 1 from public.training_days d join public.training_exercises e on e.day_id = d.id
    where d.program_id = v_program and d.name = 'Glúteo' and d.default_weekday = 6 and d.order_index = 3
      and e.sets = 3 and e.rir = 2
      and (case when v_catalog then e.catalog_exercise_id is not null else e.exercise_name = v_new_name and e.muscle_group = 'otros' end)) then
    raise exception 'El día o el ejercicio nuevo no se creó bien.';
  end if;
  v_assertions := v_assertions + 1;

  raise notice 'mcp_strength_program_days_update: % verificaciones correctas (biblioteca: %)', v_assertions, v_catalog;
end;
$tests$;
rollback;
