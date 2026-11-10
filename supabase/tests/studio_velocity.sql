-- Prueba de la velocidad de la barra y de las ecuaciones carga-velocidad con un espacio temporal.
-- Requiere 20261110090000_studio_velocity.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_client uuid; v_ana uuid; v_luis uuid; v_squat uuid := 'b9c80fb2-7e54-4d8b-80eb-b837d35aeacf';
  v_group public.training_groups; v_session public.studio_sessions; v_item public.studio_session_items;
  v_n integer; v_vel numeric; v_detail jsonb; v_failed boolean;
begin
  select p.id into v_pro from public.profiles p order by p.id limit 1;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_pro, 'coach', 'active')
    on conflict do nothing;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Rollback atleta', 'rollback@example.com') returning id into v_client;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_ana;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Luis', 'l@example.com') returning id into v_luis;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Las ecuaciones se leen, pero nadie las cambia desde la app.
  select count(*) into v_n from public.exercise_vbt_equations;
  if v_n < 10 then raise exception 'faltan ecuaciones, hay %', v_n; end if;
  if (select velocity_type from public.exercise_vbt_equations where catalog_exercise_id = 'bbbfa15c-51ab-4224-b504-77a492f42336') <> 'mv' then
    raise exception 'la búlgara va con velocidad media';
  end if;
  v_failed := false;
  begin
    update public.exercise_vbt_equations set a = 1 where catalog_exercise_id = v_squat;
    get diagnostics v_n = row_count;
    v_failed := v_n = 0;
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'las ecuaciones no se cambian desde la app'; end if;

  -- Celda: la velocidad se guarda y deshacer la devuelve.
  v_session := public.studio_create_session(v_client, current_date, null, null, 'Fuerza');
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object(
    'catalog_exercise_id', v_squat, 'sets', 3, 'reps', '5', 'load_kg', 80, 'velocity_ms', 0.62
  ));
  if v_item.velocity_ms <> 0.62 then raise exception 'la celda guarda la velocidad'; end if;
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('velocity_ms', 0.7));
  perform public.studio_undo_last(v_client);
  if (select velocity_ms from public.studio_session_items where id = v_item.id) <> 0.62 then raise exception 'deshacer devuelve la velocidad'; end if;

  select * into v_item from public.studio_session_items where id = v_item.id;
  v_failed := false;
  begin
    perform public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('velocity_ms', 0));
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'una velocidad de cero no vale'; end if;

  -- Por series: cada una con su velocidad y sus repeticiones medidas; la que no se mide, sin velocidad.
  select * into v_item from public.studio_session_items where id = v_item.id;
  v_item := public.studio_save_sets(v_item.id, v_item.version, jsonb_build_array(
    jsonb_build_object('load_kg', 60, 'reps', 5, 'velocity_ms', 0.91, 'source', 'my_jump',
      'rep_detail', jsonb_build_array(jsonb_build_object('mpv', 0.91, 'mv', 0.84, 'pv', 1.5, 'rom', 52))),
    jsonb_build_object('load_kg', 80, 'velocity_ms', 0.64, 'rep_detail', null),
    jsonb_build_object('load_kg', 90)
  ));
  select count(*) filter (where velocity_ms is not null), max(velocity_ms) into v_n, v_vel
  from public.studio_session_sets where item_id = v_item.id;
  if v_n <> 2 or v_vel <> 0.91 then raise exception 'solo las series medidas tienen velocidad'; end if;
  select rep_detail into v_detail from public.studio_session_sets where item_id = v_item.id and set_index = 1;
  if v_detail->0->>'mpv' <> '0.91' then raise exception 'se guardan las repeticiones'; end if;
  if (select source from public.studio_session_sets where item_id = v_item.id and set_index = 1) <> 'my_jump' then
    raise exception 'se sabe que viene de My Jump';
  end if;
  if (select rep_detail from public.studio_session_sets where item_id = v_item.id and set_index = 2) is not null then
    raise exception 'sin repeticiones medidas queda vacío';
  end if;

  v_item := public.studio_save_sets(v_item.id, v_item.version, '[{"load_kg": 100}]'::jsonb);
  perform public.studio_undo_last(v_client);
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and velocity_ms is not null and rep_detail is not null;
  if v_n <> 1 then raise exception 'deshacer devuelve lo medido'; end if;

  -- Grupo: cada persona con su velocidad y sus series medidas.
  v_group := public.studio_save_group(v_space, null, 'TEAM', 'schedule', '[{"weekday": 2, "time": "18:00"}]'::jsonb, array[v_pro]);
  perform public.studio_set_group_members(v_group.id, array[v_ana, v_luis]);
  v_session := public.studio_create_group_session(v_group.id, current_date, '18:00');
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_squat, 'sets', 2, 'reps', '5', 'load_kg', 60));
  perform public.studio_set_attendance(v_session.id, v_ana, 'attended');
  perform public.studio_set_attendance(v_session.id, v_luis, 'attended');
  select * into v_item from public.studio_session_items where id = v_item.id;
  v_item := public.studio_save_person_values(v_item.id, v_luis, v_item.version, jsonb_build_object('load_kg', 70, 'velocity_ms', 0.8));
  if (select velocity_ms from public.studio_item_people where item_id = v_item.id and client_id = v_luis) <> 0.8 then
    raise exception 'Luis tiene su velocidad';
  end if;
  v_item := public.studio_save_person_sets(v_item.id, v_ana, v_item.version, jsonb_build_array(
    jsonb_build_object('load_kg', 50, 'velocity_ms', 1.01, 'source', 'my_jump'),
    jsonb_build_object('load_kg', 65, 'velocity_ms', 0.78, 'source', 'my_jump')
  ));
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_ana and velocity_ms is not null;
  if v_n <> 2 then raise exception 'Ana tiene sus dos series medidas'; end if;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and velocity_ms is not null;
  if v_n <> 0 then raise exception 'lo que se genera para Luis no inventa velocidad'; end if;

  raise notice 'studio_velocity OK';
end;
$tests$;
rollback;
