-- Prueba de las reglas de citas a sesiones con un espacio temporal.
-- Requiere 20261106060000_agenda_apply.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_svc_team uuid; v_svc_fisio uuid; v_svc_online uuid;
  v_ana uuid; v_luis uuid; v_eva uuid; v_solo uuid; v_online uuid;
  v_at timestamptz := (current_date + 2 + time '18:00') at time zone 'Europe/Madrid';
  v_r jsonb; v_n integer; v_session uuid; v_group uuid; v_status text; v_client uuid; v_item uuid; v_a uuid;
begin
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.agenda_services (coach_id, provider, external_id, name, kind, group_mode, creates_session) values (v_space, 'fisiotrack', '1', 'TEAM', 'training', 'auto', true) returning id into v_svc_team;
  insert into public.agenda_services (coach_id, provider, external_id, name, kind, group_mode, creates_session) values (v_space, 'fisiotrack', '2', 'FISIOTERAPIA', 'physio', 'individual', true) returning id into v_svc_fisio;
  insert into public.agenda_services (coach_id, provider, external_id, name, kind, group_mode, creates_session) values (v_space, 'fisiotrack', '3', 'ONLINE', 'online', 'individual', false) returning id into v_svc_online;
  insert into public.external_staff_map (coach_id, provider, external_id, external_name) values (v_space, 'fisiotrack', 's1', 'Marcos'), (v_space, 'fisiotrack', 's2', 'Ana F');
  insert into public.external_patients (coach_id, provider, external_id, full_name, email) values (v_space, 'fisiotrack', 'p1', 'Ana', 'ana@rollback.example') returning id into v_ana;
  insert into public.external_patients (coach_id, provider, external_id, full_name) values (v_space, 'fisiotrack', 'p2', 'Luis') returning id into v_luis;
  insert into public.external_patients (coach_id, provider, external_id, full_name) values (v_space, 'fisiotrack', 'p3', 'Eva') returning id into v_eva;
  insert into public.external_patients (coach_id, provider, external_id, full_name) values (v_space, 'fisiotrack', 'p4', 'Solo') returning id into v_solo;
  insert into public.external_patients (coach_id, provider, external_id, full_name) values (v_space, 'fisiotrack', 'p5', 'Online') returning id into v_online;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana ya estaba', 'ANA@rollback.example') returning id into v_client;

  -- Clase de tres; fisioterapia simultánea, individual; una online que no crea nada.
  insert into public.agenda_appointments (coach_id, provider, external_id, external_patient_id, external_staff_id, service_id, starts_at, status) values
    (v_space, 'fisiotrack', 'a1', v_ana, 's1', v_svc_team, v_at, 'confirmed'),
    (v_space, 'fisiotrack', 'a2', v_luis, 's1', v_svc_team, v_at, 'confirmed'),
    (v_space, 'fisiotrack', 'a3', v_eva, 's1', v_svc_team, v_at, 'confirmed'),
    (v_space, 'fisiotrack', 'a4', v_solo, 's2', v_svc_fisio, v_at, 'confirmed'),
    (v_space, 'fisiotrack', 'a5', v_online, 's1', v_svc_online, v_at + interval '1 hour', 'confirmed');

  v_r := public.agenda_apply(v_space);
  if (v_r->>'classes')::int <> 1 or (v_r->>'sessions')::int <> 1 or (v_r->>'clients')::int <> 3 then raise exception 'recuento %', v_r; end if;
  if (select client_id from public.external_patients where id = v_ana) <> v_client then raise exception 'Ana se vincula por email, sin duplicarse'; end if;
  if exists (select 1 from public.clients where coach_id = v_space and id <> v_client and status is distinct from 'active') then raise exception 'los clientes de la agenda entran activos'; end if;
  if (select client_id from public.external_patients where id = v_online) is not null then raise exception 'online no da de alta'; end if;

  select session_id into v_session from public.agenda_appointments where external_id = 'a1' and coach_id = v_space;
  select group_id into v_group from public.studio_sessions where id = v_session;
  if v_group is null then raise exception 'la clase es una sesión de grupo'; end if;
  if (select name from public.training_groups where id = v_group) not like 'Marcos · % 18:00' then raise exception 'nombre del grupo'; end if;
  select count(*) into v_n from public.studio_session_attendance where session_id = v_session and status = 'attended' and origin = 'agenda';
  if v_n <> 3 then raise exception 'tres personas en la clase, hay %', v_n; end if;
  select count(*) into v_n from public.training_group_members where group_id = v_group;
  if v_n <> 3 then raise exception 'tres integrantes'; end if;
  select count(*) into v_n from public.studio_sessions where coach_id = v_space and client_id is not null;
  if v_n <> 1 then raise exception 'una sola sesión individual, hay %', v_n; end if;

  -- Repetir no duplica nada.
  v_r := public.agenda_apply(v_space);
  if (v_r->>'classes')::int <> 0 or (v_r->>'sessions')::int <> 0 then raise exception 'repetir no duplica %', v_r; end if;

  -- Lo marcado a mano manda sobre la agenda.
  update public.studio_session_attendance set origin = 'manual' where session_id = v_session and client_id = v_client;
  update public.agenda_appointments set status = 'canceled' where external_id in ('a1', 'a2') and coach_id = v_space;
  perform public.agenda_apply(v_space);
  select status into v_status from public.studio_session_attendance where session_id = v_session and client_id = v_client;
  if v_status <> 'attended' then raise exception 'lo manual no se toca'; end if;
  select status into v_status from public.studio_session_attendance a join public.external_patients p on p.client_id = a.client_id where a.session_id = v_session and p.id = v_luis;
  if v_status <> 'absent' then raise exception 'la anulación se refleja'; end if;

  -- Individual: cambio de hora, anulación, y cita borrada con o sin ejercicios.
  select session_id into v_session from public.agenda_appointments where external_id = 'a4' and coach_id = v_space;
  update public.agenda_appointments set starts_at = v_at + interval '1 day' where external_id = 'a4' and coach_id = v_space;
  perform public.agenda_apply(v_space);
  if (select session_date from public.studio_sessions where id = v_session) <> current_date + 3 then raise exception 'la hora sigue a la cita'; end if;

  update public.agenda_appointments set status = 'canceled' where external_id = 'a4' and coach_id = v_space;
  perform public.agenda_apply(v_space);
  if (select status from public.studio_sessions where id = v_session) <> 'cancelled' then raise exception 'anulada'; end if;
  update public.agenda_appointments set status = 'confirmed' where external_id = 'a4' and coach_id = v_space;
  update public.studio_sessions set status = 'planned' where id = v_session;

  select id into v_a from public.exercise_catalog where is_active limit 1;
  insert into public.studio_session_items (session_id, client_id, coach_id, catalog_exercise_id, is_done)
  select v_session, s.client_id, v_space, v_a, true from public.studio_sessions s where s.id = v_session returning id into v_item;
  update public.studio_sessions set status = 'done' where id = v_session;
  update public.agenda_appointments set deleted_at = now() where external_id = 'a4' and coach_id = v_space;
  perform public.agenda_apply(v_space);
  if not exists (select 1 from public.studio_sessions where id = v_session) then raise exception 'lo registrado nunca se borra'; end if;

  delete from public.studio_session_items where id = v_item;
  update public.studio_sessions set status = 'planned' where id = v_session;
  perform public.agenda_apply(v_space);
  if exists (select 1 from public.studio_sessions where id = v_session) then raise exception 'la sesión vacía se quita'; end if;

  -- Una sesión hecha a mano ese día se queda con la cita.
  select id into v_client from public.clients where coach_id = v_space and full_name = 'Solo';
  insert into public.studio_sessions (coach_id, client_id, session_date) values (v_space, v_client, current_date + 5) returning id into v_session;
  insert into public.agenda_appointments (coach_id, provider, external_id, external_patient_id, external_staff_id, service_id, starts_at, status)
  values (v_space, 'fisiotrack', 'a6', v_solo, 's2', v_svc_fisio, (current_date + 5 + time '10:00') at time zone 'Europe/Madrid', 'confirmed');
  perform public.agenda_apply(v_space);
  if (select session_id from public.agenda_appointments where external_id = 'a6' and coach_id = v_space) <> v_session then raise exception 'se asocia a la sesión a mano'; end if;

  raise notice 'agenda_apply OK';
end;
$tests$;
rollback;
