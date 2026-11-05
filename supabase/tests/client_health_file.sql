-- Prueba de lesiones y aspectos relevantes con un espacio temporal.
-- Requiere 20261106020000_client_health_file.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_assigned uuid; v_reception uuid; v_athlete uuid; v_outsider uuid; v_client uuid;
  v_injury public.client_injuries; v_note public.client_notes_relevant; v_n integer;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4], (array_agg(id))[5]
    into v_pro, v_assigned, v_reception, v_athlete, v_outsider
  from (select p.id from public.profiles p order by p.id limit 5) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_assigned, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  -- Un atleta real con su propia cuenta, en un espacio temporal: no tocamos su ficha verdadera.
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Rollback atleta', 'rollback@example.com', v_athlete) returning id into v_client;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  v_injury := public.studio_save_injury(v_client, null, null, jsonb_build_object(
    'region', 'rodilla_d', 'structure', 'Menisco interno', 'detail', ' grado II ', 'occurred', 'marzo 2025'
  ));
  if v_injury.status <> 'active' or v_injury.detail <> 'grado II' or v_injury.created_by <> v_pro then raise exception 'la lesión nace activa'; end if;

  v_injury := public.studio_save_injury(v_client, v_injury.id, v_injury.version, jsonb_build_object(
    'structure', 'Menisco interno', 'status', 'past'
  ));
  if v_injury.status <> 'past' or v_injury.version <> 2 or v_injury.detail is not null then raise exception 'cambiar la lesión'; end if;

  begin
    perform public.studio_save_injury(v_client, v_injury.id, 1, jsonb_build_object('status', 'active'));
    raise exception 'la versión vieja no pisa';
  exception when sqlstate 'NT409' then null;
  end;

  v_note := public.studio_save_relevant_note(v_client, null, ' Alergia al látex ');
  if v_note.note <> 'Alergia al látex' or v_note.version <> 1 then raise exception 'aspectos relevantes'; end if;
  v_note := public.studio_save_relevant_note(v_client, 1, 'Alergia al látex y asma');
  if v_note.version <> 2 then raise exception 'la nota sube de versión'; end if;
  begin
    perform public.studio_save_relevant_note(v_client, 1, 'Pisado');
    raise exception 'la nota vieja no pisa';
  exception when sqlstate 'NT409' then null;
  end;

  select count(*) into v_n from public.client_health_log where client_id = v_client;
  if v_n <> 4 then raise exception 'cada cambio queda registrado, hay %', v_n; end if;

  -- Recepción no ve nada ni puede escribir.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select (select count(*) from public.client_injuries where client_id = v_client)
       + (select count(*) from public.client_notes_relevant where client_id = v_client)
       + (select count(*) from public.client_health_log where client_id = v_client) into v_n;
  if v_n <> 0 then raise exception 'recepción no ve datos de salud'; end if;
  begin
    perform public.studio_save_injury(v_client, null, null, jsonb_build_object('region', 'lumbar'));
    raise exception 'recepción no escribe';
  exception when insufficient_privilege then null;
  end;

  -- El atleta tampoco, ni leer ni escribir.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select (select count(*) from public.client_injuries where client_id = v_client)
       + (select count(*) from public.client_notes_relevant where client_id = v_client)
       + (select count(*) from public.client_health_log where client_id = v_client) into v_n;
  if v_n <> 0 then raise exception 'el atleta no ve estos datos'; end if;
  begin
    perform public.studio_save_relevant_note(v_client, null, 'No');
    raise exception 'el atleta no escribe';
  exception when insufficient_privilege then null;
  end;

  -- Con «solo asignados», un profesional sin asignar se queda fuera.
  execute 'reset role';
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  insert into public.client_professionals (client_id, user_id) values (v_client, v_pro);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_assigned, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.client_injuries where client_id = v_client;
  if v_n <> 0 then raise exception 'sin asignar no se ve'; end if;
  begin
    perform public.studio_delete_injury(v_injury.id, v_injury.version);
    raise exception 'sin asignar no se borra';
  exception when insufficient_privilege then null;
  end;

  -- Directamente en las tablas no se escribe, ni siquiera con acceso.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  update public.client_injuries set detail = 'x' where id = v_injury.id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'la tabla es de solo lectura'; end if;
  begin
    insert into public.client_injuries (coach_id, client_id, region) values (v_space, v_client, 'lumbar');
    raise exception 'tampoco se inserta';
  exception when insufficient_privilege then null;
  end;

  -- Borrar deja rastro de lo que había.
  perform public.studio_delete_injury(v_injury.id, v_injury.version);
  select count(*) into v_n from public.client_health_log where row_id = v_injury.id and after_data is null;
  if v_n <> 1 then raise exception 'el borrado queda registrado'; end if;

  execute 'reset role';
  raise notice 'client_health_file OK';
end;
$tests$;
rollback;
