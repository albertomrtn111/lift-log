-- Prueba de integración de save_nexttrain_review_draft y update_nexttrain_strength_program
-- con un cliente temporal y el rol authenticated. Termina con ROLLBACK explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_checkin uuid := gen_random_uuid();
  v_approved_checkin uuid := gen_random_uuid();
  v_old_program uuid := gen_random_uuid();
  v_program uuid := gen_random_uuid();
  v_day uuid := gen_random_uuid();
  v_review jsonb;
  v_result jsonb;
  v_version timestamptz;
  v_today date := current_date;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;

  -- Datos preparados como administrador; las llamadas se hacen después como authenticated.
  insert into public.clients (id, coach_id, user_id, full_name, status) values (v_client, v_coach, v_user, 'MCP review rollback test', 'active');
  insert into public.checkins (id, coach_id, client_id, submitted_at, status) values
    (v_checkin, v_coach, v_client, now() - interval '1 hour', 'reviewed'),
    (v_approved_checkin, v_coach, v_client, now() - interval '8 days', 'archived');
  insert into public.reviews (coach_id, client_id, checkin_id, status, ai_status, message_to_client)
    values (v_coach, v_client, v_approved_checkin, 'approved', 'completed', 'Enviado');
  -- updated_at en el pasado: dentro de una transacción now() no cambia y la versión antigua coincidiría con la nueva.
  insert into public.training_programs (id, coach_id, client_id, name, weeks, total_weeks, status, effective_from, effective_to, updated_at) values
    (v_old_program, v_coach, v_client, 'Bloque anterior', 4, 4, 'active', v_today - 28, v_today - 1, now() - interval '1 day'),
    (v_program, v_coach, v_client, 'Bloque nuevo', 4, 4, 'draft', v_today + 7, v_today + 34, now() - interval '1 day');
  insert into public.training_days (id, coach_id, program_id, name, day_name, order_index, day_order, default_weekday)
    values (v_day, v_coach, v_program, 'Pierna', 'Pierna', 1, 1, 1);
  insert into public.scheduled_strength_sessions (coach_id, client_id, program_id, day_id, scheduled_date, is_completed) values
    (v_coach, v_client, v_program, v_day, v_today + 7, false),
    (v_coach, v_client, v_program, v_day, v_today + 14, false),
    (v_coach, v_client, v_program, v_day, v_today - 1, true);

  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  -- 1. Sin revisión previa se crea en borrador con el resumen.
  v_review := public.save_nexttrain_review_draft(v_coach, v_client, v_checkin,
    jsonb_build_object('summary', 'Buena adherencia', 'expected_summary', null, 'expected_message_to_client', null));
  if v_review->>'status' <> 'draft' or v_review->>'summary' <> 'Buena adherencia' or v_review->>'message_to_client' is not null then
    raise exception 'No se creó el borrador de la revisión.';
  end if;
  v_assertions := v_assertions + 1;

  -- 2. Con una versión leída antigua no se guarda.
  begin
    perform public.save_nexttrain_review_draft(v_coach, v_client, v_checkin,
      jsonb_build_object('message_to_client', 'Hola', 'expected_summary', null, 'expected_message_to_client', null));
    raise exception 'Se aceptó un borrador con versión antigua.';
  exception when others then
    if sqlerrm <> 'La revisión cambió; vuelve a leer get_checkins.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 3. Con la versión actual se guarda el mensaje y se conserva el resumen omitido.
  v_review := public.save_nexttrain_review_draft(v_coach, v_client, v_checkin,
    jsonb_build_object('message_to_client', '  Gran semana  ', 'expected_summary', 'Buena adherencia', 'expected_message_to_client', null));
  if v_review->>'message_to_client' <> 'Gran semana' or v_review->>'summary' <> 'Buena adherencia' or v_review->>'status' <> 'draft' then
    raise exception 'No se actualizó el borrador o se perdió el resumen.';
  end if;
  v_assertions := v_assertions + 1;

  -- 4. Una revisión aprobada no se toca.
  begin
    perform public.save_nexttrain_review_draft(v_coach, v_client, v_approved_checkin,
      jsonb_build_object('message_to_client', 'Otro', 'expected_summary', null, 'expected_message_to_client', 'Enviado'));
    raise exception 'Se modificó una revisión aprobada.';
  exception when others then
    if sqlerrm <> 'La revisión ya no está en borrador; edítala desde la app.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 5. Otro espacio queda fuera aunque la función sea SECURITY DEFINER.
  begin
    perform public.save_nexttrain_review_draft(gen_random_uuid(), v_client, v_checkin,
      jsonb_build_object('summary', 'x', 'expected_summary', 'Buena adherencia', 'expected_message_to_client', 'Gran semana'));
    raise exception 'Se aceptó un espacio sin membresía.';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 6. Activar con fecha futura se rechaza.
  select updated_at into v_version from public.training_programs where id = v_program;
  begin
    perform public.update_nexttrain_strength_program(v_coach, v_client, v_program,
      jsonb_build_object('expected_updated_at', v_version, 'today', v_today, 'status', 'active', 'effective_from', v_today + 7));
    raise exception 'Se activó un programa futuro.';
  exception when others then
    if sqlerrm <> 'Guarda los programas futuros como borrador y actívalos al empezar.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 7. Activar sin fecha: empieza hoy, archiva el anterior y borra las sesiones no completadas con fechas antiguas.
  v_result := public.update_nexttrain_strength_program(v_coach, v_client, v_program,
    jsonb_build_object('expected_updated_at', v_version, 'today', v_today, 'status', 'active'));
  if v_result->>'status' <> 'active' or (v_result->>'effective_from')::date <> v_today
    or (v_result->>'effective_to')::date <> v_today + 27
    or not (v_result->'archived_program_ids') ? v_old_program::text
    or (select status from public.training_programs where id = v_old_program) <> 'archived'
    or (v_result->>'removed_scheduled_sessions')::integer <> 2
    or (select count(*) from public.scheduled_strength_sessions where program_id = v_program) <> 1 then
    raise exception 'La activación no archivó, no fijó la fecha o no limpió las sesiones.';
  end if;
  v_assertions := v_assertions + 1;

  -- 8. La versión anterior ya no sirve.
  begin
    perform public.update_nexttrain_strength_program(v_coach, v_client, v_program,
      jsonb_build_object('expected_updated_at', v_version, 'today', v_today, 'name', 'Otro nombre'));
    raise exception 'Se aceptó una edición con versión antigua.';
  exception when others then
    if sqlerrm <> 'El programa cambió; vuelve a leer get_program_history.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 9. Cambiar solo el nombre conserva fechas y sesiones; archivar deja el cliente sin programa activo.
  v_result := public.update_nexttrain_strength_program(v_coach, v_client, v_program,
    jsonb_build_object('expected_updated_at', (v_result->>'updated_at')::timestamptz, 'today', v_today, 'name', 'Bloque 2', 'status', 'archived'));
  if v_result->>'name' <> 'Bloque 2' or v_result->>'status' <> 'archived' or (v_result->>'effective_from')::date <> v_today
    or (v_result->>'removed_scheduled_sessions')::integer <> 0
    or exists(select 1 from public.training_programs where client_id = v_client and status = 'active') then
    raise exception 'El cambio de nombre o el archivado no fueron correctos.';
  end if;
  v_assertions := v_assertions + 1;

  raise notice 'mcp_review_draft_and_program_update: % verificaciones correctas', v_assertions;
end;
$tests$;
rollback;
