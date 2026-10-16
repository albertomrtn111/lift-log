-- Prueba de nexttrain_coach_today y del parche de create_nexttrain_strength_program y
-- save_nexttrain_nutrition_plan. Usa un cliente temporal y el rol authenticated; sirve con
-- y sin la biblioteca de ejercicios. Termina con ROLLBACK explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_catalog boolean := pg_catalog.to_regprocedure('public.resolve_catalog_exercise(uuid,text)') is not null;
  v_exercise text := 'Sentadilla MCP test';
  v_today date;
  v_program jsonb;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  if v_catalog then
    execute 'select name from public.exercise_catalog where is_active order by name limit 1' into v_exercise;
  end if;
  insert into public.clients (id, coach_id, user_id, full_name, status) values (v_client, v_coach, v_user, 'MCP coach today rollback test', 'active');

  -- 1-3. Zona del espacio, sin zona y zona desconocida.
  update public.coaches set timezone = 'Pacific/Kiritimati' where id = v_coach;
  if public.nexttrain_coach_today(v_coach) <> (now() at time zone 'Pacific/Kiritimati')::date then
    raise exception 'No se usa la zona del espacio.';
  end if;
  v_assertions := v_assertions + 1;
  update public.coaches set timezone = null where id = v_coach;
  if public.nexttrain_coach_today(v_coach) <> (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Sin zona no se usa Europe/Madrid.';
  end if;
  v_assertions := v_assertions + 1;
  update public.coaches set timezone = 'Mars/Olympus' where id = v_coach;
  if public.nexttrain_coach_today(v_coach) <> (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Con una zona desconocida no se usa Europe/Madrid.';
  end if;
  v_assertions := v_assertions + 1;

  -- 4. Las dos funciones del MCP ya no usan current_date.
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.create_nexttrain_strength_program(uuid,uuid,jsonb)'::regprocedure), 'current_date') > 0
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)'::regprocedure), 'current_date') > 0
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)'::regprocedure), 'nexttrain_coach_today(p_coach_id)') = 0 then
    raise exception 'Las funciones del MCP siguen usando current_date.';
  end if;
  v_assertions := v_assertions + 1;

  -- 5-6. En UTC+14, «hoy» del espacio suele ser el día siguiente en UTC: un programa activo
  -- que empieza hoy en el espacio se acepta y uno de mañana se rechaza.
  update public.coaches set timezone = 'Pacific/Kiritimati' where id = v_coach;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';
  v_today := public.nexttrain_coach_today(v_coach);
  v_program := public.create_nexttrain_strength_program(v_coach, v_client, jsonb_build_object(
    'name', 'Bloque hoy', 'weeks', 4, 'status', 'active', 'effective_from', v_today,
    'days', jsonb_build_array(jsonb_build_object('name', 'Pierna', 'weekday', 1,
      'exercises', jsonb_build_array(jsonb_build_object('name', v_exercise, 'sets', 4, 'reps', '6'))))));
  if v_program->>'status' <> 'active' or (v_program->>'effective_from')::date <> v_today then
    raise exception 'No se aceptó un programa activo que empieza hoy en la zona del espacio.';
  end if;
  v_assertions := v_assertions + 1;
  begin
    perform public.create_nexttrain_strength_program(v_coach, v_client, jsonb_build_object(
      'name', 'Bloque mañana', 'weeks', 4, 'status', 'active', 'effective_from', v_today + 1,
      'days', jsonb_build_array(jsonb_build_object('name', 'Pierna', 'weekday', 1,
        'exercises', jsonb_build_array(jsonb_build_object('name', v_exercise, 'sets', 4, 'reps', '6'))))));
    raise exception 'Se aceptó un programa activo que empieza mañana.';
  exception when others then
    if sqlerrm <> 'Guarda los programas futuros como borrador y actívalos al empezar.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  raise notice 'mcp_coach_today_in_sql: % verificaciones correctas (biblioteca: %)', v_assertions, v_catalog;
end;
$tests$;
rollback;
