-- Prueba de integración con un cliente temporal y el rol authenticated.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_quiet_client uuid := gen_random_uuid();
  v_program jsonb;
  v_active jsonb;
  v_payload jsonb;
  v_latest jsonb;
  v_before integer;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  insert into public.clients (id, coach_id, user_id, full_name, status) values
    (v_client, v_coach, v_user, 'MCP strength rollback test', 'active'),
    (v_quiet_client, v_coach, v_user, 'MCP strength rollback test', 'active');
  -- v_client: el check-in más reciente (hace 1 hora, energía 8) y 600 más antiguos
  -- (desde hace 2 horas, energía 6). v_quiet_client: uno solo de hace 500 días.
  -- Con el límite global anterior de 500 filas, v_quiet_client aparecía como sin_checkin.
  insert into public.checkins (coach_id, client_id, submitted_at, energy) values
    (v_coach, v_client, now() - interval '1 hour', 8),
    (v_coach, v_quiet_client, now() - interval '500 days', 5);
  insert into public.checkins (coach_id, client_id, submitted_at, energy)
    select v_coach, v_client, now() - (g || ' hours')::interval, 6 from generate_series(2, 601) g;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  -- 1-2. Último check-in por cliente.
  v_latest := public.nexttrain_latest_checkins(v_coach, array[v_client, v_quiet_client]);
  if jsonb_array_length(v_latest) <> 2 then raise exception 'Falta el último check-in de algún cliente.'; end if;
  v_assertions := v_assertions + 1;
  if not exists(select 1 from jsonb_array_elements(v_latest) e
    where (e->>'client_id')::uuid = v_client and (e->>'energy')::integer = 8)
    or not exists(select 1 from jsonb_array_elements(v_latest) e
    where (e->>'client_id')::uuid = v_quiet_client and (e->>'energy')::integer = 5) then
    raise exception 'No se devolvió el check-in más reciente de cada cliente.';
  end if;
  v_assertions := v_assertions + 1;

  -- 3-4. Creación completa en borrador.
  v_payload := jsonb_build_object('name','Bloque test','weeks',4,'status','draft','effective_from',current_date,
    'days', jsonb_build_array(
      jsonb_build_object('name','Torso','weekday',1,'exercises',jsonb_build_array(
        jsonb_build_object('name','Press banca','sets',4,'reps','6-8','rir',2,'rest_seconds',180,'muscle_group','pecho'),
        jsonb_build_object('name','Remo','sets',4,'reps','8-10'))),
      jsonb_build_object('name','Pierna','weekday',4,'exercises',jsonb_build_array(
        jsonb_build_object('name','Sentadilla','sets',5,'reps','5','rir',1.5,'notes','Pausa abajo')))));
  v_program := public.create_nexttrain_strength_program(v_coach, v_client, v_payload);
  if (v_program->>'effective_to')::date <> current_date + 27 or (v_program->>'day_count')::integer <> 2
    or (v_program->>'exercise_count')::integer <> 3
    or (select count(*) from public.training_columns where program_id=(v_program->>'id')::uuid) <> 9 then
    raise exception 'El programa no se creó completo.';
  end if;
  v_assertions := v_assertions + 1;
  if not exists(select 1 from public.training_exercises where program_id=(v_program->>'id')::uuid
    and exercise_name='Remo' and muscle_group='otros' and order_index=2)
    or not exists(select 1 from public.training_exercises where program_id=(v_program->>'id')::uuid
    and exercise_name='Sentadilla' and rir=1.5) then
    raise exception 'Ejercicio sin orden, grupo muscular por defecto o RIR decimal.';
  end if;
  v_assertions := v_assertions + 1;

  -- 5. Un día inválido después de insertar el primero revierte todo.
  select count(*) into v_before from public.training_programs where client_id = v_client;
  begin
    perform public.create_nexttrain_strength_program(v_coach, v_client, jsonb_set(v_payload,
      '{days,1,exercises}', '[]'::jsonb));
    raise exception 'Se aceptó un día sin ejercicios.';
  exception when others then
    if sqlerrm <> 'Cada día necesita al menos un ejercicio.' then raise; end if;
  end;
  if (select count(*) from public.training_programs where client_id = v_client) <> v_before then
    raise exception 'Quedó un programa a medias.';
  end if;
  v_assertions := v_assertions + 1;

  -- 6. Espacio ajeno.
  begin
    perform public.create_nexttrain_strength_program(gen_random_uuid(), v_client, v_payload);
    raise exception 'Se aceptó un espacio ajeno.';
  exception when insufficient_privilege then null;
  end;
  v_assertions := v_assertions + 1;

  -- 7. Activar dos veces respeta unique_active_program_per_client archivando el anterior.
  v_active := public.create_nexttrain_strength_program(v_coach, v_client, v_payload || '{"status":"active"}');
  v_program := public.create_nexttrain_strength_program(v_coach, v_client, v_payload || '{"status":"active","name":"Bloque 2"}');
  if not exists(select 1 from public.training_programs where id=(v_active->>'id')::uuid and status='archived')
    or (v_program->'archived_program_ids') <> jsonb_build_array(v_active->>'id')
    or (select count(*) from public.training_programs where client_id=v_client and status='active') <> 1 then
    raise exception 'La activación no archivó el programa activo anterior.';
  end if;
  v_assertions := v_assertions + 1;

  -- 8. Un programa activo no puede empezar en el futuro y no archiva nada.
  begin
    perform public.create_nexttrain_strength_program(v_coach, v_client,
      v_payload || jsonb_build_object('status','active','effective_from',current_date + 7));
    raise exception 'Se aceptó un programa activo futuro.';
  exception when others then
    if sqlerrm <> 'Guarda los programas futuros como borrador y actívalos al empezar.' then raise; end if;
  end;
  if not exists(select 1 from public.training_programs where id=(v_program->>'id')::uuid and status='active') then
    raise exception 'El rechazo archivó el programa activo.';
  end if;
  v_assertions := v_assertions + 1;

  execute 'reset role';
  if v_assertions <> 8 then raise exception 'No se han completado las 8 verificaciones.'; end if;
end;
$tests$;
rollback;
select 8 as assertions_completed_before_rollback,
  not exists(select 1 from public.clients where full_name='MCP strength rollback test') as temporary_data_rolled_back;
