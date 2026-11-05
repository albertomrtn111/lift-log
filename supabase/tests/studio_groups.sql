-- Prueba de grupos, asistencia y valores por persona con un espacio temporal.
-- Requiere 20261106030000_studio_groups.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_reception uuid; v_outsider uuid; v_a uuid; v_ana uuid; v_luis uuid; v_eva uuid; v_solo uuid;
  v_group public.training_groups; v_other public.training_groups;
  v_session public.studio_sessions; v_copy public.studio_sessions; v_item public.studio_session_items;
  v_individual public.studio_sessions; v_solo_item public.studio_session_items; v_n integer; v_load numeric;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_pro, v_reception, v_outsider
  from (select p.id from public.profiles p order by p.id limit 3) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_ana;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Luis', 'l@example.com') returning id into v_luis;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Eva', 'e@example.com') returning id into v_eva;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Solo', 's@example.com') returning id into v_solo;
  select id into v_a from public.exercise_catalog where is_active order by id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  v_group := public.studio_save_group(v_space, null, ' TEAM martes ', 'schedule', '[{"weekday": 2, "time": "18:00"}]'::jsonb, array[v_pro]);
  if v_group.name <> 'TEAM martes' then raise exception 'el grupo nace limpio'; end if;
  perform public.studio_set_group_members(v_group.id, array[v_ana, v_luis, v_eva]);

  v_session := public.studio_create_group_session(v_group.id, current_date, '18:00');
  if v_session.client_id is not null or v_session.group_id <> v_group.id then raise exception 'la sesión es del grupo'; end if;
  select count(*) into v_n from public.studio_session_attendance where session_id = v_session.id and status = 'unmarked';
  if v_n <> 3 then raise exception 'la asistencia nace con los integrantes, hay %', v_n; end if;

  -- Un ejercicio general: una sola fila, sin copias por persona.
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'sets', 3, 'reps', '10', 'load_kg', 20));

  perform public.studio_set_attendance(v_session.id, v_ana, 'attended');
  perform public.studio_set_attendance(v_session.id, v_luis, 'attended');
  perform public.studio_set_attendance(v_session.id, v_eva, 'absent');

  -- Luis lleva lo suyo; lo vacío hereda lo general.
  v_item := public.studio_save_person_values(v_item.id, v_luis, v_item.version, jsonb_build_object('load_kg', 30, 'reps', '8'));

  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_ana;
  if v_n <> 3 then raise exception 'Ana tiene sus tres series, hay %', v_n; end if;
  select max(load_kg), count(*) into v_load, v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and reps = 8;
  if v_n <> 3 or v_load <> 30 then raise exception 'Luis tiene sus valores'; end if;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_eva;
  if v_n <> 0 then raise exception 'quien no vino no tiene series'; end if;
  if (select status from public.studio_sessions where id = v_session.id) <> 'done' then raise exception 'la sesión pasa a hecha'; end if;

  -- Sus series cuentan en el historial de cada persona.
  select count(*) into v_n from public.v_strength_set_facts where source = 'studio' and client_id = v_luis;
  if v_n <> 3 then raise exception 'el historial de Luis tiene sus series, hay %', v_n; end if;

  -- Cambiar la asistencia recoloca las series.
  perform public.studio_set_attendance(v_session.id, v_eva, 'attended');
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_eva;
  if v_n <> 3 then raise exception 'Eva vino al final'; end if;
  perform public.studio_set_attendance(v_session.id, v_ana, 'absent');
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_ana;
  if v_n <> 0 then raise exception 'Ana no vino al final'; end if;
  if (select origin from public.studio_session_attendance where session_id = v_session.id and client_id = v_ana) <> 'manual' then
    raise exception 'lo manual queda marcado como manual';
  end if;

  -- Por series de una persona: se respetan al cambiar lo general.
  select version into v_item.version from public.studio_session_items where id = v_item.id;
  v_item := public.studio_save_person_sets(v_item.id, v_luis, v_item.version, '[{"load_kg": 35}, {"load_kg": 40}]'::jsonb);
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('load_kg', 25));
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_n <> 2 then raise exception 'lo detallado no se regenera'; end if;
  select max(load_kg) into v_load from public.studio_session_sets where item_id = v_item.id and client_id = v_eva;
  if v_load <> 25 then raise exception 'lo heredado sí sigue a lo general'; end if;
  begin
    perform public.studio_save_person_sets(v_item.id, v_ana, v_item.version, '[{"load_kg": 35}]'::jsonb);
    raise exception 'quien no vino no registra series';
  exception when invalid_parameter_value then null;
  end;

  -- Deshacer va por grupo y recupera a cada persona.
  perform public.studio_delete_session(v_session.id, (select version from public.studio_sessions where id = v_session.id));
  if (public.studio_undo_last(v_group.id))->>'status' <> 'undone' then raise exception 'deshacer en el grupo'; end if;
  select count(*) into v_n from public.studio_session_attendance where session_id = v_session.id;
  if v_n <> 3 then raise exception 'vuelve la asistencia, hay %', v_n; end if;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_n <> 2 then raise exception 'vuelven las series de Luis, hay %', v_n; end if;
  select count(*) into v_n from public.studio_item_people where item_id = v_item.id and client_id = v_luis;
  if v_n <> 1 then raise exception 'vuelven sus valores'; end if;

  -- Duplicar una clase crea otra del mismo grupo, con la asistencia sin marcar.
  v_copy := public.studio_duplicate_session(v_session.id, current_date + 7);
  if v_copy.group_id <> v_group.id or v_copy.status <> 'planned' then raise exception 'la copia es del grupo'; end if;
  select count(*) into v_n from public.studio_session_attendance where session_id = v_copy.id and status = 'unmarked';
  if v_n <> 3 then raise exception 'la copia nace sin marcar'; end if;

  -- Quien sale del grupo no entra en las clases siguientes, y conserva su historial.
  perform public.studio_set_group_members(v_group.id, array[v_ana, v_luis]);
  if (select left_on from public.training_group_members where group_id = v_group.id and client_id = v_eva) is null then raise exception 'Eva sale'; end if;
  v_copy := public.studio_create_group_session(v_group.id, current_date + 14);
  select count(*) into v_n from public.studio_session_attendance where session_id = v_copy.id;
  if v_n <> 2 then raise exception 'la clase nueva tiene dos personas, hay %', v_n; end if;
  select count(*) into v_n from public.v_strength_set_facts where source = 'studio' and client_id = v_eva;
  if v_n = 0 then raise exception 'Eva conserva sus series'; end if;

  -- Unir: las sesiones pasan al otro y el absorbido queda archivado.
  v_other := public.studio_save_group(v_space, null, 'TEAM jueves', 'fixed', '[]'::jsonb, '{}');
  perform public.studio_merge_groups(v_group.id, v_other.id);
  select count(*) into v_n from public.studio_sessions where group_id = v_other.id;
  if v_n <> 3 then raise exception 'las sesiones pasan al grupo, hay %', v_n; end if;
  if (select is_active from public.training_groups where id = v_group.id) then raise exception 'el absorbido se archiva'; end if;

  -- Una sesión individual sigue igual, y no admite asistencia.
  v_individual := public.studio_create_session(v_solo, current_date);
  v_solo_item := public.studio_save_item(v_individual.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'sets', 2));
  v_solo_item := public.studio_set_item_done(v_solo_item.id, v_solo_item.version, true);
  select count(*) into v_n from public.studio_session_sets where item_id = v_solo_item.id and client_id = v_solo;
  if v_n <> 2 then raise exception 'la sesión individual no cambia'; end if;
  begin
    perform public.studio_set_attendance(v_individual.id, v_solo, 'attended');
    raise exception 'la asistencia es de los grupos';
  exception when invalid_parameter_value then null;
  end;

  -- Recepción no ve grupos ni sesiones, y de fuera no se toca nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.training_groups where coach_id = v_space;
  if v_n <> 0 then raise exception 'recepción no ve grupos'; end if;
  select count(*) into v_n from public.studio_sessions where coach_id = v_space;
  if v_n <> 0 then raise exception 'recepción no ve sesiones'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_set_attendance(v_session.id, v_ana, 'attended');
    raise exception 'de fuera no se marca';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_save_item(v_session.id, v_item.id, null, jsonb_build_object('load_kg', 1));
    raise exception 'de fuera no se escribe';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_set_group_members(v_other.id, array[v_ana]);
    raise exception 'de fuera no se cambian integrantes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_undo_last(v_other.id);
    raise exception 'de fuera no se deshace';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'studio_groups OK';
end;
$tests$;
rollback;
