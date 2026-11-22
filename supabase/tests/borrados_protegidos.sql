-- Prueba de NXT-149: con la sesión del coach, lo que tiene registros del atleta no se
-- borra directamente; la papelera guarda la copia y se recupera; lo vacío se borra
-- como antes. Espacio y usuarios temporales.
-- Requiere 20261122120000_proteger_borrados_atleta.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_coach uuid := gen_random_uuid(); v_athlete uuid := gen_random_uuid();
  v_client uuid; v_program uuid; v_empty_program uuid; v_day uuid; v_exercise uuid; v_set uuid;
  v_checkin uuid; v_empty_checkin uuid; v_cardio uuid; v_planned uuid; v_metric uuid; v_unused_metric uuid;
  v_trash uuid; v_n integer; v_info jsonb; v_blocked boolean;
begin
  insert into auth.users (id, email, aud, role) select u, u || '@example.com', 'authenticated', 'authenticated' from unnest(array[v_coach, v_athlete]) u;
  insert into public.profiles (id, email) select u, u || '@example.com' from unnest(array[v_coach, v_athlete]) u on conflict (id) do nothing;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback NXT-149', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_coach, 'owner', 'active');
  insert into public.clients (coach_id, full_name, email, auth_user_id, user_id, status)
  values (v_space, 'Ana', 'ana-nxt149@example.com', v_athlete, v_athlete, 'active') returning id into v_client;

  insert into public.training_programs (coach_id, client_id, name, weeks, status) values (v_space, v_client, 'Bloque 1', 4, 'archived') returning id into v_program;
  insert into public.training_days (coach_id, program_id, name) values (v_space, v_program, 'Día A') returning id into v_day;
  insert into public.training_exercises (coach_id, program_id, day_id, exercise_name) values (v_space, v_program, v_day, 'Sentadilla') returning id into v_exercise;
  insert into public.training_exercise_sets (exercise_id, week_index, set_index, weight_kg, reps) values (v_exercise, 1, 0, 100, 5) returning id into v_set;
  insert into public.training_exercise_sets (exercise_id, week_index, set_index, weight_kg, reps) values (v_exercise, 2, 0, 102.5, 5);
  insert into public.training_exercise_sets (exercise_id, week_index, set_index) values (v_exercise, 3, 0);
  insert into public.training_programs (coach_id, client_id, name, weeks, status) values (v_space, v_client, 'Vacío', 4, 'archived') returning id into v_empty_program;

  insert into public.metric_definitions (coach_id, name, value_type, category) values (v_space, 'Cintura', 'number', 'body') returning id into v_metric;
  insert into public.metric_definitions (coach_id, name, value_type, category) values (v_space, 'Sin usar', 'number', 'body') returning id into v_unused_metric;
  insert into public.checkins (coach_id, client_id, type, status, submitted_at, raw_payload)
  values (v_space, v_client, 'checkin', 'reviewed', now(), jsonb_build_object('campo_1', 'Bien', 'metric_' || v_metric, 80)) returning id into v_checkin;
  insert into public.checkin_media (coach_id, client_id, checkin_id, bucket, path, media_type)
  values (v_space, v_client, v_checkin, 'checkin-media', 'prueba/nxt149.webp', 'front');
  insert into public.checkins (coach_id, client_id, type, status, raw_payload) values (v_space, v_client, 'checkin', 'pending', '{}') returning id into v_empty_checkin;
  insert into public.cardio_sessions (coach_id, client_id, scheduled_date, name, is_completed, actual_distance_km, rpe)
  values (v_space, v_client, current_date, 'Rodaje', true, 8.2, 6) returning id into v_cardio;
  insert into public.cardio_sessions (coach_id, client_id, scheduled_date, name) values (v_space, v_client, current_date + 1, 'Series') returning id into v_planned;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);

  -- Recuentos para los avisos.
  v_info := public.nexttrain_strength_records(v_program);
  if (v_info ->> 'sets')::int <> 2 or (v_info ->> 'weeks')::int <> 2 then raise exception 'recuento del programa: %', v_info; end if;
  v_info := public.nexttrain_checkin_records(v_checkin);
  if (v_info ->> 'answers')::int <> 1 or (v_info ->> 'measures')::int <> 1 or (v_info ->> 'photos')::int <> 1 then raise exception 'recuento de la revisión: %', v_info; end if;
  v_info := public.nexttrain_metric_usage(v_metric);
  if (v_info ->> 'values')::int <> 1 or (v_info ->> 'athletes')::int <> 1 then raise exception 'uso de la métrica: %', v_info; end if;

  -- Programa archivado con series: ni el programa, ni el día, ni el ejercicio, ni la serie.
  v_blocked := false;
  begin delete from public.training_programs where id = v_program; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró un programa con series'; end if;
  v_blocked := false;
  begin delete from public.training_days where id = v_day; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró un día con series de un programa archivado'; end if;
  v_blocked := false;
  begin delete from public.training_exercises where program_id = v_program; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró un ejercicio con series de un programa archivado'; end if;
  v_blocked := false;
  begin delete from public.training_exercise_sets where id = v_set; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'el coach borró una serie registrada de un programa archivado'; end if;
  select count(*) into v_n from public.training_exercise_sets where exercise_id = v_exercise;
  if v_n <> 3 then raise exception 'faltan series: %', v_n; end if;

  -- Ocultar sí; y el programa vacío se borra como antes.
  update public.training_programs set hidden_at = now() where id = v_program;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se pudo ocultar'; end if;
  delete from public.training_programs where id = v_empty_program;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se borró el programa vacío'; end if;

  -- Programa activo: el aviso de la web manda; la base deja quitar el ejercicio.
  update public.training_programs set status = 'draft' where id = v_program;
  delete from public.training_exercises where id = v_exercise;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se pudo quitar el ejercicio de un programa en borrador'; end if;

  -- Revisión: directa no; a la papelera sí, y se recupera entera.
  v_blocked := false;
  begin delete from public.checkins where id = v_checkin; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró una revisión con respuestas'; end if;
  v_trash := public.nexttrain_trash_checkin(v_checkin);
  select count(*) into v_n from public.checkins where id = v_checkin;
  if v_n <> 0 then raise exception 'la revisión sigue ahí'; end if;
  select count(*) into v_n from public.deleted_records where id = v_trash;
  if v_n <> 1 then raise exception 'el coach no ve la papelera'; end if;
  perform public.nexttrain_restore_deleted_record(v_trash);
  select count(*) into v_n from public.checkin_media where checkin_id = v_checkin;
  if v_n <> 1 then raise exception 'la foto no volvió: %', v_n; end if;
  delete from public.checkins where id = v_empty_checkin;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se borró la revisión vacía'; end if;

  -- Cardio hecho: directa no; papelera y recuperar. El planificado se borra como antes.
  v_blocked := false;
  begin delete from public.cardio_sessions where id = v_cardio; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró un cardio hecho'; end if;
  v_trash := public.nexttrain_trash_cardio_session(v_cardio);
  perform public.nexttrain_restore_deleted_record(v_trash);
  select count(*) into v_n from public.cardio_sessions where id = v_cardio and actual_distance_km = 8.2;
  if v_n <> 1 then raise exception 'el cardio no volvió'; end if;
  delete from public.cardio_sessions where id = v_planned;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se borró el cardio planificado'; end if;

  -- Métrica con valores: no se borra; sin valores, sí.
  v_blocked := false;
  begin delete from public.metric_definitions where id = v_metric; exception when raise_exception then v_blocked := true; end;
  if not v_blocked then raise exception 'se borró una métrica con valores'; end if;
  delete from public.metric_definitions where id = v_unused_metric;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no se borró la métrica sin usar'; end if;

  -- Atleta: no ve la papelera; sí puede quitar sus propias series.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.deleted_records;
  if v_n <> 0 then raise exception 'el atleta ve la papelera'; end if;

  -- Servidor y cascadas: como antes (borrar el cliente se lo lleva todo).
  execute 'reset role';
  delete from public.clients where id = v_client;
  raise notice 'NXT-149: todas las comprobaciones pasan';
end;
$tests$;
rollback;
