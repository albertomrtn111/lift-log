-- Prueba de deshacer y de los permisos del registro de sala con un espacio temporal.
-- Requiere 20261105235000_studio_live_undo.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_colleague uuid; v_assigned uuid; v_client uuid; v_a uuid; v_b uuid;
  v_session public.studio_sessions; v_copy public.studio_sessions;
  v_section public.studio_session_sections;
  v_item public.studio_session_items; v_item2 public.studio_session_items;
  v_n integer; v_status text; v_result jsonb;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_pro, v_colleague, v_assigned
  from (select p.id from public.profiles p order by p.id limit 3) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active'), (v_space, v_assigned, 'coach', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Rollback atleta', 'rollback@example.com') returning id into v_client;
  select (array_agg(id))[1], (array_agg(id))[2] into v_a, v_b
  from (select id from public.exercise_catalog where is_active order by id limit 2) x;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  if (public.studio_undo_last(v_client))->>'status' <> 'nothing' then raise exception 'sin cambios no hay nada que deshacer'; end if;

  v_session := public.studio_create_session(v_client, current_date, null, null, 'Fuerza');
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object(
    'catalog_exercise_id', v_a, 'sets', 3, 'reps', '10', 'load_kg', 40, 'note', 'Nota', 'tags', jsonb_build_array('barra')
  ));

  -- Deshacer un cambio de valores, también las etiquetas.
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('load_kg', 50, 'tags', '[]'::jsonb));
  if (public.studio_undo_last(v_client))->>'status' <> 'undone' then raise exception 'deshacer el cambio'; end if;
  select * into v_item from public.studio_session_items where id = v_item.id;
  if v_item.load_kg <> 40 or v_item.version <> 4 then raise exception 'la celda vuelve a 40 con versión nueva'; end if;
  select count(*) into v_n from public.studio_item_tags where item_id = v_item.id;
  if v_n <> 1 then raise exception 'vuelve la etiqueta'; end if;

  -- Deshacer marcar como realizado quita las series y devuelve la sesión a prevista.
  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  if (select status from public.studio_sessions where id = v_session.id) <> 'done' then raise exception 'la sesión pasa a hecha'; end if;
  perform public.studio_undo_last(v_client);
  select * into v_item from public.studio_session_items where id = v_item.id;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id;
  if v_item.is_done or v_n <> 0 or (select status from public.studio_sessions where id = v_session.id) <> 'planned' then
    raise exception 'deshacer realizado deja la sesión prevista y sin series';
  end if;

  -- Por series: se deshace al detalle.
  v_item := public.studio_save_sets(v_item.id, v_item.version, '[{"load_kg": 45}, {"load_kg": 50}]'::jsonb);
  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  v_item := public.studio_save_sets(v_item.id, v_item.version, '[{"load_kg": 60}]'::jsonb);
  perform public.studio_undo_last(v_client);
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and is_detailed;
  if v_n <> 2 then raise exception 'vuelven las dos series detalladas, hay %', v_n; end if;
  select version into v_item.version from public.studio_session_items where id = v_item.id;

  -- Borrar y deshacer recupera la celda con sus series.
  perform public.studio_delete_item(v_item.id, v_item.version);
  perform public.studio_undo_last(v_client);
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id;
  if v_n <> 2 then raise exception 'la celda vuelve con sus series, hay %', v_n; end if;
  select * into v_item from public.studio_session_items where id = v_item.id;
  if v_item.note <> 'Nota' then raise exception 'la celda vuelve con su nota'; end if;

  -- Subbloques y orden.
  v_section := public.studio_save_section(v_session.id, null, 'Fuerza');
  v_item2 := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_b));
  perform public.studio_arrange_session(v_session.id, array[v_section.id],
    jsonb_build_array(jsonb_build_object('id', v_item2.id, 'section_id', v_section.id), jsonb_build_object('id', v_item.id, 'section_id', null)));
  perform public.studio_undo_last(v_client);
  if (select section_id from public.studio_session_items where id = v_item2.id) is not null then
    raise exception 'deshacer el orden devuelve el ejercicio a su sitio';
  end if;
  perform public.studio_arrange_session(v_session.id, array[v_section.id],
    jsonb_build_array(jsonb_build_object('id', v_item2.id, 'section_id', v_section.id)));
  perform public.studio_delete_section(v_section.id);
  perform public.studio_undo_last(v_client);
  if (select section_id from public.studio_session_items where id = v_item2.id) <> v_section.id then
    raise exception 'el subbloque vuelve con sus ejercicios';
  end if;

  -- Duplicar es un solo lote.
  v_copy := public.studio_duplicate_session(v_session.id, current_date + 7);
  perform public.studio_undo_last(v_client);
  if exists (select 1 from public.studio_sessions where id = v_copy.id) then raise exception 'la copia desaparece entera'; end if;

  -- Borrar la sesión y deshacer la recupera entera.
  select version into v_n from public.studio_sessions where id = v_session.id;
  perform public.studio_delete_session(v_session.id, v_n);
  if exists (select 1 from public.studio_session_items where session_id = v_session.id) then raise exception 'se borra'; end if;
  perform public.studio_undo_last(v_client);
  select count(*) into v_n from public.studio_session_items where session_id = v_session.id;
  if v_n <> 2 then raise exception 'vuelven los dos ejercicios, hay %', v_n; end if;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id;
  if v_n <> 2 then raise exception 'vuelven sus series, hay %', v_n; end if;
  if not exists (select 1 from public.studio_session_sections where session_id = v_session.id) then raise exception 'vuelven los subbloques'; end if;

  -- Si otro tocó esa fila después, no se pisa: avisa y el siguiente deshacer pasa al anterior.
  select * into v_item from public.studio_session_items where id = v_item.id;
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('load_kg', 70));
  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('load_kg', 80));
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  if (public.studio_undo_last(v_client))->>'status' <> 'blocked' then raise exception 'el cambio del compañero no se pisa'; end if;
  if (select load_kg from public.studio_session_items where id = v_item.id) <> 80 then raise exception 'sigue el valor del compañero'; end if;

  -- Si el compañero deshace lo suyo, ya no hay nada que lo impida; deshacer lo de otro no es posible.
  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  if (public.studio_undo_last(v_client))->>'status' <> 'undone' then raise exception 'cada uno deshace lo suyo'; end if;
  if (select load_kg from public.studio_session_items where id = v_item.id) <> 70 then raise exception 'vuelve al valor anterior'; end if;
  if (public.studio_undo_last(v_client))->>'status' <> 'nothing' then raise exception 'no tiene más que deshacer'; end if;

  -- Tras deshacer no se vuelve a deshacer lo mismo: el lote queda marcado y tiene su propio registro.
  select count(*) into v_n from public.studio_change_log where client_id = v_client and undo_of is not null;
  if v_n = 0 then raise exception 'deshacer también queda apuntado'; end if;

  -- Con «solo asignados», el registro tampoco enseña lo de otros clientes.
  execute 'reset role';
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  insert into public.client_professionals (client_id, user_id) values (v_client, v_pro);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_assigned, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.studio_change_log where client_id = v_client;
  if v_n <> 0 then raise exception 'sin asignar no se ve el registro'; end if;
  begin
    perform public.studio_undo_last(v_client);
    raise exception 'sin asignar no se deshace';
  exception when insufficient_privilege then null;
  end;
  if public.studio_can_join_topic('studio:' || v_client) then raise exception 'sin asignar no entra en la presencia'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  if not public.studio_can_join_topic('studio:' || v_client) then raise exception 'el asignado entra en la presencia'; end if;
  if public.studio_can_join_topic('otra-cosa') then raise exception 'solo los canales de sala'; end if;

  begin
    perform public.studio_restore_item('{}'::jsonb);
    raise exception 'la interna no se llama';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'studio_live_undo OK';
end;
$tests$;
rollback;
