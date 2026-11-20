-- Prueba de NXT-143: con su sesión, el atleta solo cambia lo suyo y no ve las notas
-- de cobro; el coach sigue pudiendo cambiarlo todo. Espacio y usuarios temporales.
-- Requiere 20261120130000_athlete_own_data_only.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_coach uuid := gen_random_uuid(); v_athlete uuid := gen_random_uuid();
  v_client uuid; v_checkin uuid; v_cardio uuid; v_coach_msg uuid; v_own_msg uuid;
  v_n integer; v_text text; v_blocked boolean;
begin
  insert into auth.users (id, email, aud, role) select u, u || '@example.com', 'authenticated', 'authenticated' from unnest(array[v_coach, v_athlete]) u;
  insert into public.profiles (id, email) select u, u || '@example.com' from unnest(array[v_coach, v_athlete]) u on conflict (id) do nothing;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback NXT-143', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_coach, 'owner', 'active');
  insert into public.clients (coach_id, full_name, email, auth_user_id, user_id, status, payment_amount, payment_day, payment_notes)
  values (v_space, 'Ana', 'ana-nxt143@example.com', v_athlete, v_athlete, 'active', 50, 5, ' Bizum ') returning id into v_client;
  insert into public.checkins (coach_id, client_id, type, status, raw_payload) values (v_space, v_client, 'checkin', 'pending', '{}') returning id into v_checkin;
  insert into public.cardio_sessions (coach_id, client_id, scheduled_date, name, coach_notes) values (v_space, v_client, current_date, 'Rodaje', 'Suave') returning id into v_cardio;
  insert into public.messages (coach_id, client_id, sender_role, sender_id, content) values (v_space, v_client, 'coach', v_coach, 'Hola') returning id into v_coach_msg;
  insert into public.messages (coach_id, client_id, sender_role, sender_id, content) values (v_space, v_client, 'client', v_athlete, 'Hola coach') returning id into v_own_msg;

  -- La nota de cobro se copió a la tabla nueva (recortada).
  select notes into v_text from public.client_payment_notes where client_id = v_client;
  if v_text is distinct from 'Bizum' then raise exception 'nota copiada: %', v_text; end if;

  execute 'set local role authenticated';

  -- Atleta ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);

  -- Sigue viendo su ficha, pero no la cambia ni ve la nota de cobro en la tabla nueva.
  select count(*) into v_n from public.clients where id = v_client;
  if v_n <> 1 then raise exception 'el atleta ve su ficha: %', v_n; end if;
  update public.clients set payment_amount = 1, coach_id = gen_random_uuid() where id = v_client;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el atleta cambió su ficha'; end if;
  select count(*) into v_n from public.client_payment_notes;
  if v_n <> 0 then raise exception 'el atleta ve notas de cobro: %', v_n; end if;

  -- Revisiones: sus respuestas sí; el feedback y el estado, no.
  update public.checkins set raw_payload = '{"peso": 70}', submitted_at = now() where id = v_checkin;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el atleta no pudo responder: %', v_n; end if;
  v_blocked := false;
  begin
    update public.checkins set coach_feedback = 'Muy bien' where id = v_checkin;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'el atleta escribió el feedback del coach'; end if;
  v_blocked := false;
  begin
    update public.checkins set status = 'reviewed' where id = v_checkin;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'el atleta cambió el estado de la revisión'; end if;

  -- Cardio: sus resultados y sus notas sí; la sesión del coach, no.
  update public.cardio_sessions
     set actual_distance_km = 8.2, actual_duration_min = 45, actual_avg_pace = '5:29', rpe = 6,
         feedback_notes = 'Bien', avg_heart_rate = 150, max_heart_rate = 170, is_completed = true, performed_date = now()
   where id = v_cardio;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el atleta no pudo registrar el cardio: %', v_n; end if;
  v_blocked := false;
  begin
    update public.cardio_sessions set coach_notes = 'Otra cosa' where id = v_cardio;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'el atleta cambió las notas del coach en cardio'; end if;
  v_blocked := false;
  begin
    update public.cardio_sessions set target_distance_km = 1 where id = v_cardio;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'el atleta cambió el objetivo del cardio'; end if;

  -- Chat: sus mensajes sí; los del coach, no.
  update public.messages set content = 'Cambiado' where id = v_coach_msg;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el atleta cambió un mensaje del coach'; end if;
  update public.messages set content = 'Hola, coach' where id = v_own_msg;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el atleta no pudo cambiar su mensaje: %', v_n; end if;

  -- Coach -----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);

  update public.checkins set coach_feedback = 'Muy bien', status = 'reviewed' where id = v_checkin;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el coach no pudo dar feedback: %', v_n; end if;
  update public.cardio_sessions set coach_notes = 'Más suave', target_distance_km = 6 where id = v_cardio;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el coach no pudo cambiar el cardio: %', v_n; end if;
  update public.messages set read_at = now() where id = v_own_msg;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el coach no pudo marcar leído: %', v_n; end if;
  update public.clients set payment_amount = 60 where id = v_client;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el coach no pudo cambiar la cuota: %', v_n; end if;

  -- Notas de cobro: el coach las ve y las cambia; la web antigua (clients.payment_notes) se copia.
  select notes into v_text from public.client_payment_notes where client_id = v_client;
  if v_text is distinct from 'Bizum' then raise exception 'el coach no ve la nota: %', v_text; end if;
  update public.clients set payment_notes = 'Transferencia' where id = v_client;
  select notes into v_text from public.client_payment_notes where client_id = v_client;
  if v_text is distinct from 'Transferencia' then raise exception 'cambio no copiado: %', v_text; end if;
  insert into public.client_payment_notes (client_id, notes) values (v_client, 'Efectivo')
    on conflict (client_id) do update set notes = excluded.notes;
  select notes into v_text from public.client_payment_notes where client_id = v_client;
  if v_text is distinct from 'Efectivo' then raise exception 'el coach no pudo guardar la nota: %', v_text; end if;

  execute 'reset role';
  raise notice 'NXT-143: todas las comprobaciones pasan';
end;
$tests$;
rollback;
