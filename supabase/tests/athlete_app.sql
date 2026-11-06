-- Prueba de la app del atleta para clientes de sala, con un espacio temporal.
-- Requiere 20261106110000_athlete_app.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_online uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_athlete uuid := gen_random_uuid(); v_mate uuid := gen_random_uuid(); v_online_athlete uuid := gen_random_uuid();
  v_client uuid; v_mate_client uuid; v_online_client uuid; v_a uuid; v_group public.training_groups; v_class public.studio_sessions; v_own public.studio_sessions;
  v_item public.studio_session_items; v_class_item public.studio_session_items; v_report public.session_reports; v_m jsonb; v_n integer;
begin
  -- Usuarios nuevos: hacen falta sin ficha de cliente, y el ROLLBACK los quita.
  insert into auth.users (id, email, aud, role) select u, u || '@example.com', 'authenticated', 'authenticated' from unnest(array[v_pro, v_athlete, v_mate, v_online_athlete]) u;
  insert into public.profiles (id, email) select u, u || '@example.com' from unnest(array[v_pro, v_athlete, v_mate, v_online_athlete]) u on conflict (id) do nothing;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio'), (v_online, 'Rollback online', 'starter');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly'), (v_online, 'comped', 'starter', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_pro, 'owner', 'active');
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Ana', 'a@example.com', v_athlete) returning id into v_client;
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Luis', 'l@example.com', v_mate) returning id into v_mate_client;
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_online, 'Eva', 'e@example.com', v_online_athlete) returning id into v_online_client;
  select id into v_a from public.exercise_catalog where is_active limit 1;

  execute 'set local role authenticated';

  -- Un atleta de un espacio sin sala lo ve todo como siempre.
  perform set_config('request.jwt.claims', json_build_object('sub', v_online_athlete, 'role', 'authenticated')::text, true);
  v_m := public.my_athlete_modules();
  if not (v_m @> '{"app": true, "sessions": false, "routine": true, "diet": true, "chat": true}') then raise exception 'online %', v_m; end if;

  -- Quien no es atleta no se limita.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  if public.my_athlete_modules() is not null then raise exception 'profesional'; end if;

  -- El profesional prepara una sesión suya, una clase y un informe.
  v_own := public.studio_create_session(v_client, current_date);
  v_item := public.studio_save_item(v_own.id, null, null, jsonb_build_object('catalog_exercise_id', v_a));
  perform public.studio_set_item_done(v_item.id, v_item.version, true);
  execute 'reset role';
  update public.studio_sessions set status = 'done' where id = v_own.id;
  insert into public.training_groups (coach_id, name) values (v_space, 'Clase') returning * into v_group;
  insert into public.studio_sessions (coach_id, group_id, session_date, status) values (v_space, v_group.id, current_date, 'done') returning * into v_class;
  insert into public.studio_session_attendance (session_id, client_id, status) values (v_class.id, v_client, 'attended'), (v_class.id, v_mate_client, 'absent');
  insert into public.studio_session_items (coach_id, session_id, catalog_exercise_id, is_done, sort_order) values (v_space, v_class.id, v_a, true, 1) returning * into v_class_item;
  insert into public.studio_item_people (item_id, client_id, load_kg) values (v_class_item.id, v_client, 20), (v_class_item.id, v_mate_client, 30);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_report := public.studio_save_report(v_own.id, v_client, '{"title": "Informe"}'::jsonb);

  -- Cliente de sala sin nada online: sin rutina ni dieta, con sus sesiones.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  v_m := public.my_athlete_modules();
  if not (v_m @> '{"app": true, "sessions": true, "routine": false, "diet": false, "chat": true}') then raise exception 'sala %', v_m; end if;

  -- Ve su sesión y la clase a la que vino, con sus cargas y sin las de nadie más.
  select count(*) into v_n from public.studio_sessions where id in (v_own.id, v_class.id);
  if v_n <> 2 then raise exception 'sesiones vistas %', v_n; end if;
  select count(*) into v_n from public.studio_session_items where session_id = v_class.id;
  if v_n <> 1 then raise exception 'ejercicios de la clase %', v_n; end if;
  select count(*) into v_n from public.studio_item_people where item_id = v_class_item.id;
  if v_n <> 1 then raise exception 'solo sus cargas, hay %', v_n; end if;

  -- El informe sin enviar no le llega.
  select count(*) into v_n from public.session_reports where id = v_report.id;
  if v_n <> 0 then raise exception 'informe sin enviar'; end if;

  -- El atleta no escribe en nada de sala.
  begin
    perform public.studio_save_item(v_own.id, null, null, jsonb_build_object('catalog_exercise_id', v_a));
    raise exception 'el atleta no añade ejercicios';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_set_item_done(v_item.id, v_item.version, false);
    raise exception 'el atleta no marca';
  exception when insufficient_privilege then null;
  end;
  update public.studio_sessions set name = 'x' where id = v_own.id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el atleta no edita'; end if;
  delete from public.studio_session_items where id = v_item.id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el atleta no borra'; end if;

  -- Quien faltó a la clase no la ve.
  perform set_config('request.jwt.claims', json_build_object('sub', v_mate, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.studio_sessions where id = v_class.id;
  if v_n <> 0 then raise exception 'faltó y la ve'; end if;
  select count(*) into v_n from public.studio_item_people where item_id = v_class_item.id and client_id = v_client;
  if v_n <> 0 then raise exception 've cargas ajenas'; end if;

  -- Enviado, el informe aparece; revocado, desaparece.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_record_delivery(v_report.id, 'link', null);
  perform public.studio_save_app_settings(v_space, true, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.session_reports where id = v_report.id;
  if v_n <> 1 then raise exception 'informe enviado'; end if;
  if (public.my_athlete_modules()->>'chat')::boolean then raise exception 'chat apagado'; end if;
  begin
    perform public.studio_save_app_settings(v_space, true, true);
    raise exception 'el atleta no cambia ajustes';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_revoke_report(v_report.id);
  perform public.studio_save_app_settings(v_space, false, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.session_reports where id = v_report.id;
  if v_n <> 0 then raise exception 'informe revocado'; end if;
  if (public.my_athlete_modules()->>'app')::boolean then raise exception 'app apagada'; end if;

  execute 'reset role';
  raise notice 'athlete_app OK';
end;
$tests$;
rollback;
