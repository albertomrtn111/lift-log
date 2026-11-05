-- Prueba de las sesiones de sala con un espacio temporal.
-- Requiere 20261105230000_studio_sessions.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_starter uuid := gen_random_uuid();
  v_pro uuid; v_reception uuid; v_athlete uuid; v_outsider uuid;
  v_client uuid; v_starter_client uuid; v_a uuid; v_b uuid;
  v_session public.studio_sessions; v_item public.studio_session_items; v_item2 public.studio_session_items; v_n integer;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4]
    into v_pro, v_reception, v_athlete, v_outsider
  from (
    select p.id from public.profiles p
    where p.id not in (select auth_user_id from public.clients where auth_user_id is not null)
      and p.id not in (select user_id from public.clients where user_id is not null)
    order by p.id
    limit 4
  ) x;
  if v_athlete is null then raise exception 'faltan usuarios para la prueba'; end if;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio'), (v_starter, 'Rollback online', 'starter');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_starter, 'comped', 'starter', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_reception, 'reception', 'active'), (v_starter, v_pro, 'coach', 'active');
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Rollback atleta', 'rollback@example.com', v_athlete) returning id into v_client;
  insert into public.clients (coach_id, full_name, email) values (v_starter, 'Rollback online', 'rollback2@example.com') returning id into v_starter_client;
  select id into v_a from public.exercise_catalog where name = 'Press de banca plano con barra';
  select id into v_b from public.exercise_catalog where name = 'Press de banca plano con mancuernas';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Sin el plan no hay sala.
  begin
    perform public.studio_create_session(v_starter_client, current_date);
    raise exception 'sin plan no se crean sesiones';
  exception when insufficient_privilege then null;
  end;

  v_session := public.studio_create_session(v_client, current_date, null, null, 'Fuerza');
  if v_session.status <> 'planned' or v_session.location_id is null or v_session.professional_id <> v_pro then
    raise exception 'la sesión nace prevista, con sede y profesional';
  end if;

  -- Directamente en la tabla no se escribe.
  update public.studio_sessions set name = 'No' where id = v_session.id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'solo se escribe con las funciones'; end if;

  -- Lo prescrito no cuenta.
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'sets', 3, 'reps', '10-12', 'load_kg', 40));
  if v_item.sets <> 3 or exists (select 1 from public.studio_session_sets) then raise exception 'la prescripción no crea series'; end if;

  -- Marcar crea las series heredadas y la sesión pasa a hecha.
  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  if (select count(*) from public.studio_session_sets where item_id = v_item.id) <> 3 then raise exception 'crea 3 series'; end if;
  if (select reps from public.studio_session_sets where item_id = v_item.id and set_index = 1) <> 10 then raise exception 'las reps salen de 10-12'; end if;
  if (select status from public.studio_sessions where id = v_session.id) <> 'done' then raise exception 'pasa a hecha'; end if;

  -- Versión vieja: no se pisa.
  begin
    perform public.studio_save_item(v_session.id, v_item.id, v_item.version - 1, '{"sets": 9}');
    raise exception 'una versión vieja no guarda';
  exception when sqlstate 'NT409' then null;
  end;

  -- Cambiar la celda regenera las heredadas.
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, '{"sets": 2}');
  if (select count(*) from public.studio_session_sets where item_id = v_item.id) <> 2 then raise exception 'regenera las heredadas'; end if;

  -- El mismo ejercicio dos veces, con series detalladas que se respetan.
  v_item2 := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'sets', 2, 'load_kg', 50));
  v_item2 := public.studio_save_sets(v_item2.id, v_item2.version, '[{"reps": 5}, {"reps": 3, "load_kg": 55}]');
  if not v_item2.is_done then raise exception 'las series marcan realizado'; end if;
  if (select load_kg from public.studio_session_sets where item_id = v_item2.id and set_index = 1) <> 50 then raise exception 'lo vacío hereda'; end if;
  v_item2 := public.studio_save_item(v_session.id, v_item2.id, v_item2.version, '{"sets": 8}');
  if (select count(*) from public.studio_session_sets where item_id = v_item2.id) <> 2 then raise exception 'las detalladas no se regeneran'; end if;

  -- Vista única.
  if (select count(*) from public.v_strength_set_facts where client_id = v_client and source = 'studio') <> 4 then raise exception 'la vista suma las series de sala'; end if;

  -- Anulada no cuenta y se conserva lo marcado.
  v_session := public.studio_update_session(v_session.id, null, '{"status": "cancelled"}');
  if exists (select 1 from public.v_strength_set_facts where client_id = v_client and source = 'studio') then raise exception 'una anulada no cuenta'; end if;
  v_session := public.studio_update_session(v_session.id, v_session.version, '{"status": "planned", "wellness_sleep": 10, "wellness_fatigue": 0, "wellness_stress": 0, "wellness_soreness": 2, "rpe": 7, "duration_min": 60}');
  if v_session.status <> 'done' or v_session.wellness_score <> 9.5 then raise exception 'reabrir vuelve a hecha, con su nota: % %', v_session.status, v_session.wellness_score; end if;

  -- Recepción no ve ni escribe.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.studio_sessions) or exists (select 1 from public.studio_session_sets) then raise exception 'recepción no ve sesiones'; end if;
  begin
    perform public.studio_create_session(v_client, current_date);
    raise exception 'recepción no crea sesiones';
  exception when insufficient_privilege then null;
  end;

  -- Otra persona no ve nada.
  if v_outsider is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.studio_sessions) then raise exception 'otra persona no ve sesiones'; end if;
  end if;

  -- El atleta ve lo hecho, no lo previsto, y no escribe.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_create_session(v_client, current_date + 1);
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  if (select count(*) from public.studio_sessions) <> 1 or (select status from public.studio_sessions limit 1) <> 'done' then raise exception 'el atleta solo ve lo hecho'; end if;
  if (select count(*) from public.studio_session_sets) <> 4 then raise exception 'el atleta ve sus series'; end if;
  begin
    perform public.studio_delete_session(v_session.id, null);
    raise exception 'el atleta no borra';
  exception when insufficient_privilege then null;
  end;

  -- Quitar el ejercicio de la sesión la devuelve a prevista.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_delete_item(v_item.id, null);
  perform public.studio_delete_item(v_item2.id, null);
  if (select status from public.studio_sessions where id = v_session.id) <> 'planned' then raise exception 'sin realizados vuelve a prevista'; end if;

  -- Todo queda en el log, por lotes.
  if (select count(*) from public.studio_change_log where coach_id = v_space) < 8 then raise exception 'cada cambio queda apuntado'; end if;

  -- La fusión también mueve lo de sala.
  execute 'reset role';
  insert into public.platform_admins (user_id) values (v_pro) on conflict do nothing;
  execute 'set local role authenticated';
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a));
  perform public.merge_catalog_exercise(v_a, v_b);
  if (select catalog_exercise_id from public.studio_session_items where id = v_item.id) <> v_b then raise exception 'la fusión mueve lo de sala'; end if;

  if has_function_privilege('authenticated', 'public.studio_sync_sets(uuid)', 'execute') then raise exception 'las internas no se llaman desde fuera'; end if;
end;
$tests$;
rollback;
