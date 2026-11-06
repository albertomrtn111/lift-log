-- Prueba de técnica, citas y sensaciones en la app del atleta, con un espacio temporal.
-- Requiere 20261106120000_athlete_feedback.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_other uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_athlete uuid := gen_random_uuid(); v_mate uuid := gen_random_uuid(); v_outsider uuid := gen_random_uuid();
  v_client uuid; v_mate_client uuid; v_outsider_client uuid; v_a uuid; v_own public.studio_sessions; v_planned public.studio_sessions; v_group uuid; v_class uuid;
  v_room_key text; v_client_key text; v_mate_key text; v_room_video public.media_assets; v_n integer;
begin
  -- Usuarios nuevos: hacen falta sin ficha de cliente, y el ROLLBACK los quita.
  insert into auth.users (id, email, aud, role) select u, u || '@example.com', 'authenticated', 'authenticated' from unnest(array[v_pro, v_athlete, v_mate, v_outsider]) u;
  insert into public.profiles (id, email) select u, u || '@example.com' from unnest(array[v_pro, v_athlete, v_mate, v_outsider]) u on conflict (id) do nothing;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio'), (v_other, 'Rollback otra', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly'), (v_other, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_pro, 'owner', 'active');
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Ana', 'a@example.com', v_athlete) returning id into v_client;
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_space, 'Luis', 'l@example.com', v_mate) returning id into v_mate_client;
  insert into public.clients (coach_id, full_name, email, auth_user_id) values (v_other, 'Eva', 'e@example.com', v_outsider) returning id into v_outsider_client;
  select id into v_a from public.exercise_catalog where is_active limit 1;
  v_room_key := 'studio-media/' || v_space || '/' || v_space || '/';
  v_client_key := 'studio-media/' || v_space || '/' || v_client || '/';
  v_mate_key := 'studio-media/' || v_space || '/' || v_mate_client || '/';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_own := public.studio_create_session(v_client, current_date);
  v_planned := public.studio_create_session(v_client, current_date + 1);
  perform public.studio_set_image_consent(v_client, true);
  perform public.studio_set_image_consent(v_mate_client, true);
  v_room_video := public.studio_add_media_asset(v_space, null, v_room_key || 'a.mp4', null, 'Sala', 10, 1, 'video/mp4');
  perform public.studio_assign_video(v_room_video.id, v_a, null);
  perform public.studio_add_exercise_media(v_space, v_a, v_client, 'image', null, v_client_key || 'a.webp', null);
  perform public.studio_add_exercise_media(v_space, v_a, v_mate_client, 'image', null, v_mate_key || 'b.webp', null);
  execute 'reset role';
  update public.studio_sessions set status = 'done' where id = v_own.id;
  insert into public.training_groups (coach_id, name) values (v_space, 'Clase') returning id into v_group;
  insert into public.studio_sessions (coach_id, group_id, session_date, status) values (v_space, v_group, current_date, 'done') returning id into v_class;
  insert into public.studio_session_attendance (session_id, client_id, status) values (v_class, v_client, 'attended'), (v_class, v_mate_client, 'absent');
  insert into public.agenda_appointments (coach_id, provider, external_id, client_id, starts_at, ends_at, status)
  values (v_space, 'fisiotrack', 'a', v_client, now() + interval '1 day', now() + interval '2 days', 'confirmed'),
         (v_space, 'fisiotrack', 'b', v_mate_client, now() + interval '1 day', now() + interval '2 days', 'confirmed');
  execute 'set local role authenticated';

  -- El atleta ve lo de la sala y lo suyo, no lo de otro cliente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercise_media where coach_id = v_space;
  if v_n <> 2 then raise exception 'medios vistos %', v_n; end if;
  if not public.studio_can_read_media(v_space, v_space) then raise exception 'archivo de la sala'; end if;
  if not public.studio_can_read_media(v_space, v_client) then raise exception 'archivo suyo'; end if;
  if public.studio_can_read_media(v_space, v_mate_client) then raise exception 'archivo de otro'; end if;
  if public.studio_can_use_media(v_space, v_space) then raise exception 'el atleta no sube'; end if;
  select count(*) into v_n from public.agenda_appointments where coach_id = v_space;
  if v_n <> 1 then raise exception 'citas vistas %', v_n; end if;

  -- Sus sensaciones, solo en sesiones hechas suyas, y se pueden cambiar y borrar.
  perform public.athlete_save_feedback(v_own.id, 7, ' Bien ');
  perform public.athlete_save_feedback(v_class, null, 'Dura');
  perform public.athlete_save_feedback(v_own.id, 8, 'Mejor');
  select count(*) into v_n from public.studio_session_feedback where client_id = v_client and rpe = 8 and comment = 'Mejor';
  if v_n <> 1 then raise exception 'cambiar'; end if;
  perform public.athlete_save_feedback(v_class, null, '  ');
  select count(*) into v_n from public.studio_session_feedback where session_id = v_class;
  if v_n <> 0 then raise exception 'borrar'; end if;
  begin
    perform public.athlete_save_feedback(v_planned.id, 5, null);
    raise exception 'sesión sin hacer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.athlete_save_feedback(v_own.id, 11, null);
    raise exception 'RPE fuera de rango';
  exception when check_violation then null;
  end;

  -- Al retirar el consentimiento deja de ver sus archivos, también él.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.studio_session_feedback where client_id = v_client;
  if v_n <> 1 then raise exception 'el profesional las ve'; end if;
  perform public.studio_set_image_consent(v_client, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  if public.studio_can_read_media(v_space, v_client) then raise exception 'sin consentimiento'; end if;
  select count(*) into v_n from public.exercise_media where coach_id = v_space;
  if v_n <> 1 then raise exception 'queda lo de la sala, hay %', v_n; end if;
  select count(*) into v_n from public.client_consents where client_id = v_client;
  if v_n <> 1 then raise exception 've su consentimiento'; end if;

  -- Quien faltó no opina, y uno de otra sala no ve nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_mate, 'role', 'authenticated')::text, true);
  begin
    perform public.athlete_save_feedback(v_class, 5, null);
    raise exception 'faltó';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from public.studio_session_feedback where client_id = v_client;
  if v_n <> 0 then raise exception 'sensaciones ajenas'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercise_media where coach_id = v_space;
  if v_n <> 0 then raise exception 'otra sala'; end if;
  if public.studio_can_read_media(v_space, v_space) then raise exception 'archivo de otra sala'; end if;

  execute 'reset role';
  raise notice 'athlete_feedback OK';
end;
$tests$;
rollback;
