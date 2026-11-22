-- NXT-150: cambiar la asistencia de una clase no borra series, y se puede deshacer.
-- Requiere 20261122121000_studio_attendance_keeps_sets.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_other_pro uuid; v_a uuid; v_ana uuid; v_luis uuid; v_eva uuid;
  v_group public.training_groups; v_session public.studio_sessions; v_item public.studio_session_items;
  v_n integer; v_h integer; v_load numeric; v_before uuid[]; v_after uuid[]; v_status text; v_at timestamptz;
begin
  select (array_agg(id))[1], (array_agg(id))[2] into v_pro, v_other_pro
  from (select p.id from public.profiles p order by p.id limit 2) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback asistencia', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_other_pro, 'coach', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_ana;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Luis', 'l@example.com') returning id into v_luis;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Eva', 'e@example.com') returning id into v_eva;
  select id into v_a from public.exercise_catalog where is_active order by id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  v_group := public.studio_save_group(v_space, null, 'TEAM martes', 'schedule', '[{"weekday": 2, "time": "18:00"}]'::jsonb, array[v_pro]);
  perform public.studio_set_group_members(v_group.id, array[v_ana, v_luis, v_eva]);
  v_session := public.studio_create_group_session(v_group.id, current_date, '18:00');
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'sets', 3, 'reps', '10', 'load_kg', 20));
  perform public.studio_set_attendance(v_session.id, v_ana, 'attended');
  perform public.studio_set_attendance(v_session.id, v_luis, 'attended');
  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  v_item := public.studio_save_person_sets(v_item.id, v_luis, v_item.version,
    '[{"load_kg": 35, "velocity_ms": 0.8, "source": "my_jump", "rep_detail": [{"mpv": 0.8, "mv": 0.7, "pv": 1.2, "rom": 40}]}, {"load_kg": 40}]'::jsonb);
  select array_agg(id order by set_index) into v_before from public.studio_session_sets where item_id = v_item.id and client_id = v_luis;

  -- Desmarcar «Vino»: sus series dejan de contar, pero se guardan.
  perform public.studio_set_attendance(v_session.id, v_luis, 'unmarked');
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis;
  select count(*) into v_h from public.studio_session_sets_hidden where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_n <> 0 or v_h <> 2 then raise exception 'se apartan: visibles %, apartadas %', v_n, v_h; end if;
  select count(*) into v_n from public.v_strength_set_facts where source = 'studio' and client_id = v_luis;
  if v_n <> 0 then raise exception 'lo apartado no cuenta en el historial'; end if;

  -- Editar la clase mientras tanto no las toca.
  select * into v_item from public.studio_session_items where id = v_item.id;
  v_item := public.studio_save_item(v_session.id, v_item.id, v_item.version, jsonb_build_object('load_kg', 25));
  select count(*) into v_h from public.studio_session_sets_hidden where item_id = v_item.id and client_id = v_luis;
  if v_h <> 2 then raise exception 'las ediciones no tocan lo apartado, hay %', v_h; end if;

  -- Volver a marcar «Vino»: vuelven tal cual.
  perform public.studio_set_attendance(v_session.id, v_luis, 'attended');
  select array_agg(id order by set_index), max(load_kg) into v_after, v_load
  from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_after is distinct from v_before or v_load <> 40 then raise exception 'vuelven igual: % / %', v_after, v_load; end if;
  if (select rep_detail->0->>'rom' from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and set_index = 1) <> '40' then
    raise exception 'vuelve lo medido con My Jump';
  end if;

  -- Deshacer: devuelve la asistencia y, con ella, las series.
  perform public.studio_set_attendance(v_session.id, v_luis, 'absent');
  if (public.studio_undo_last(v_group.id))->>'status' <> 'undone' then raise exception 'deshacer la asistencia'; end if;
  select status into v_status from public.studio_session_attendance where session_id = v_session.id and client_id = v_luis;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_status <> 'attended' or v_n <> 2 then raise exception 'deshacer devuelve «Vino» (%) y las series (%)', v_status, v_n; end if;

  -- No se pisa lo que otro profesional cambió después.
  perform public.studio_set_attendance(v_session.id, v_eva, 'attended');
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_pro, 'role', 'authenticated')::text, true);
  perform public.studio_set_attendance(v_session.id, v_eva, 'absent');
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  if (public.studio_undo_last(v_group.id))->>'status' <> 'blocked' then raise exception 'no se pisa lo de otro'; end if;

  -- Borrar la clase con Luis fuera y deshacerlo recupera también lo apartado.
  perform public.studio_set_attendance(v_session.id, v_luis, 'absent');
  perform public.studio_delete_session(v_session.id, (select version from public.studio_sessions where id = v_session.id));
  if (public.studio_undo_last(v_group.id))->>'status' <> 'undone' then raise exception 'deshacer el borrado'; end if;
  select count(*) into v_h from public.studio_session_sets_hidden where item_id = v_item.id and client_id = v_luis and is_detailed;
  if v_h <> 2 then raise exception 'vuelve lo apartado, hay %', v_h; end if;
  perform public.studio_set_attendance(v_session.id, v_luis, 'attended');

  -- El equipo ve lo apartado, pero no lo escribe directamente.
  begin
    insert into public.studio_session_sets_hidden (id, item_id, client_id, set_index) values (gen_random_uuid(), v_item.id, v_ana, 9);
    raise exception 'no se escribe a mano';
  exception when insufficient_privilege then null;
  end;

  -- Agenda: una cita anulada no quita «Vino» a quien tiene series registradas, y a quien no,
  -- le aparta sus series al momento. Se ejecuta como la sincronización, sin usuario.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.studio_session_attendance set origin = 'agenda' where session_id = v_session.id;
  update public.studio_session_attendance set status = 'attended' where session_id = v_session.id and client_id = v_eva;
  perform public.studio_sync_sets(v_item.id);
  insert into public.agenda_appointments (coach_id, client_id, starts_at, status, session_id) values
    (v_space, v_luis, now(), 'canceled', v_session.id), (v_space, v_eva, now(), 'canceled', v_session.id);
  perform public.agenda_apply(v_space);
  if (select status from public.studio_session_attendance where session_id = v_session.id and client_id = v_luis) <> 'attended' then
    raise exception 'la agenda respeta a quien tiene series registradas';
  end if;
  select status, marked_at into v_status, v_at from public.studio_session_attendance where session_id = v_session.id and client_id = v_eva;
  select count(*) into v_h from public.studio_session_sets_hidden where item_id = v_item.id and client_id = v_eva;
  if v_status <> 'absent' or v_h <> 3 then raise exception 'la agenda marca a Eva (%) y aparta lo suyo (%)', v_status, v_h; end if;
  -- now() no avanza dentro de la transacción: se fecha a mano para ver si la segunda pasada la reescribe.
  update public.studio_session_attendance set marked_at = '2026-01-01' where session_id = v_session.id and client_id = v_eva;
  perform public.agenda_apply(v_space);
  if (select marked_at from public.studio_session_attendance where session_id = v_session.id and client_id = v_eva) <> '2026-01-01'::timestamptz then
    raise exception 'la agenda no reescribe a quien ya estaba como «No vino»';
  end if;

  raise notice 'studio_attendance_keeps_sets OK';
end;
$tests$;
rollback;
