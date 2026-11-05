-- Prueba de rutinas, encargos y añadir en bloque con un espacio temporal.
-- Requiere 20261106000000_studio_routines_requests.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_colleague uuid; v_reception uuid; v_outsider uuid;
  v_client uuid; v_a uuid; v_b uuid; v_c uuid;
  v_session public.studio_sessions; v_other public.studio_sessions;
  v_routine public.studio_routines; v_request public.studio_requests;
  v_n integer;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4]
    into v_pro, v_colleague, v_reception, v_outsider
  from (select p.id from public.profiles p order by p.id limit 4) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Rollback atleta', 'rollback@example.com') returning id into v_client;
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_a, v_b, v_c
  from (select id from public.exercise_catalog where is_active order by id limit 3) x;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_session := public.studio_create_session(v_client, current_date);
  v_other := public.studio_create_session(v_client, current_date + 1);

  -- En bloque: un solo lote, con subbloques y etiquetas, y deshacer lo quita todo.
  v_n := public.studio_add_items(v_session.id, jsonb_build_array(
    jsonb_build_object('catalog_exercise_id', v_a, 'sets', 3, 'section_title', 'Fuerza', 'tags', jsonb_build_array('barra')),
    jsonb_build_object('catalog_exercise_id', v_b, 'section_title', 'Fuerza'),
    jsonb_build_object('catalog_exercise_id', v_c)
  ), null, null, 'copy');
  if v_n <> 3 then raise exception 'añade los tres'; end if;
  if (select origin from public.studio_sessions where id = v_session.id) <> 'copy' then raise exception 'la sesión queda como copia'; end if;
  select count(*) into v_n from public.studio_session_sections where session_id = v_session.id;
  if v_n <> 1 then raise exception 'un solo subbloque, hay %', v_n; end if;
  select count(distinct batch_id) into v_n from public.studio_change_log
  where client_id = v_client and table_name in ('studio_session_items', 'studio_session_sections');
  if v_n <> 1 then raise exception 'todo en un lote, hay %', v_n; end if;
  if (public.studio_undo_last(v_client))->>'status' <> 'undone' then raise exception 'deshacer el bloque'; end if;
  select count(*) into v_n from public.studio_session_items where session_id = v_session.id;
  if v_n <> 0 then raise exception 'deshacer quita todo el bloque, quedan %', v_n; end if;

  begin
    perform public.studio_add_items(v_session.id, '[]'::jsonb);
    raise exception 'sin ejercicios no se añade';
  exception when invalid_parameter_value then null;
  end;

  -- Rutinas: de todo el espacio, y entran marcadas en la sesión.
  v_routine := public.studio_save_routine(v_space, null, ' Movilidad 1 ', 'mobility', null, jsonb_build_array(
    jsonb_build_object('catalog_exercise_id', v_a, 'sets', 2, 'reps', '10'),
    jsonb_build_object('catalog_exercise_id', v_b)
  ));
  if v_routine.name <> 'Movilidad 1' then raise exception 'la rutina nace limpia'; end if;
  perform public.studio_add_items(v_session.id, jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_a)), v_routine.id);
  select count(*) into v_n from public.studio_session_items where session_id = v_session.id and routine_id = v_routine.id;
  if v_n <> 1 then raise exception 'la celda recuerda su rutina'; end if;

  -- Cambiarla deja exactamente lo nuevo.
  v_routine := public.studio_save_routine(v_space, v_routine.id, 'Movilidad 1', 'mobility', v_client,
    jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_c)));
  select count(*) into v_n from public.studio_routine_items where routine_id = v_routine.id;
  if v_n <> 1 then raise exception 'la rutina queda con un ejercicio'; end if;
  begin
    perform public.studio_save_routine(v_space, null, 'Vacía', 'other', null, '[]'::jsonb);
    raise exception 'sin ejercicios no hay rutina';
  exception when invalid_parameter_value then null;
  end;

  -- Borrarla no toca lo ya añadido.
  perform public.studio_delete_routine(v_routine.id);
  select count(*) into v_n from public.studio_session_items where session_id = v_session.id;
  if v_n <> 1 then raise exception 'lo añadido se queda'; end if;

  -- Encargos: para un compañero, con ejercicios marcados, y de fuera del equipo no.
  begin
    perform public.studio_create_request(v_other.id, v_outsider, 'No', null);
    raise exception 'solo para alguien del equipo';
  exception when invalid_parameter_value then null;
  end;
  v_request := public.studio_create_request(v_other.id, v_colleague, ' Revisar hombro ', 'Mira la rotación',
    jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_a, 'sets', 2)));
  if v_request.status <> 'pending' or v_request.from_user <> v_pro or v_request.title <> 'Revisar hombro' then
    raise exception 'el encargo nace pendiente y de quien lo deja';
  end if;
  select count(*) into v_n from public.studio_session_items where session_id = v_other.id and request_id = v_request.id;
  if v_n <> 1 then raise exception 'sus ejercicios apuntan al encargo'; end if;

  -- El encargo avisa en vivo pero no entra en la pila de deshacer: se deshacen sus ejercicios.
  select count(*) into v_n from public.studio_change_log where row_id = v_request.id;
  if v_n <> 1 then raise exception 'el encargo queda en el registro'; end if;
  perform public.studio_undo_last(v_client);
  if not exists (select 1 from public.studio_requests where id = v_request.id) then raise exception 'el encargo sigue'; end if;
  select count(*) into v_n from public.studio_session_items where session_id = v_other.id;
  if v_n <> 0 then raise exception 'sus ejercicios se deshacen, quedan %', v_n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  v_request := public.studio_set_request_status(v_request.id, 'done');
  if v_request.status <> 'done' or v_request.done_by <> v_colleague or v_request.done_at is null then raise exception 'lo marca hecho el compañero'; end if;
  v_request := public.studio_set_request_status(v_request.id, 'pending');
  if v_request.done_by is not null then raise exception 'reabrir limpia quién lo hizo'; end if;

  -- Recepción y gente de fuera, nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.studio_requests where client_id = v_client;
  if v_n <> 0 then raise exception 'recepción no ve encargos'; end if;
  begin
    perform public.studio_create_request(v_other.id, null, 'No', null);
    raise exception 'recepción no deja encargos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_save_routine(v_space, null, 'No', 'other', null, jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_a)));
    raise exception 'recepción no crea rutinas';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_add_items(v_session.id, jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_a)));
    raise exception 'de fuera no se añade';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_set_request_status(v_request.id, 'done');
    raise exception 'de fuera no se toca el encargo';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'studio_routines_requests OK';
end;
$tests$;
rollback;
