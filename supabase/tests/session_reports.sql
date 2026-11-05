-- Prueba de los informes de sesión con un espacio temporal.
-- Requiere 20261106080000_session_reports.sql y 20261106081000_report_new_code.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_pro uuid; v_reception uuid; v_outsider uuid; v_client uuid; v_other uuid;
  v_session public.studio_sessions; v_report public.session_reports; v_code text; v_r jsonb; v_n integer;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_pro, v_reception, v_outsider
  from (select p.id from public.profiles p order by p.id limit 3) x;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_pro, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_client;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Luis', 'l@example.com') returning id into v_other;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_session := public.studio_create_session(v_client, current_date);
  v_report := public.studio_save_report(v_session.id, v_client, '{"title": "Informe"}'::jsonb);
  v_code := v_report.code;
  if length(v_code) < 60 then raise exception 'el código es largo'; end if;
  begin
    perform public.studio_save_report(v_session.id, v_other, '{"a": 1}'::jsonb);
    raise exception 'otra persona no';
  exception when invalid_parameter_value then null;
  end;

  -- Regenerar conserva el enlace.
  v_report := public.studio_save_report(v_session.id, v_client, '{"title": "Nuevo"}'::jsonb);
  if v_report.code <> v_code then raise exception 'el enlace sigue'; end if;

  -- Sin consentimiento no se envía, pero se puede copiar el enlace.
  begin
    perform public.studio_record_delivery(v_report.id, 'whatsapp', '600');
    raise exception 'sin consentimiento no';
  exception when invalid_parameter_value then null;
  end;
  perform public.studio_record_delivery(v_report.id, 'link', null);
  perform public.studio_set_report_consent(v_client, true);
  perform public.studio_record_delivery(v_report.id, 'whatsapp', '600');
  select count(*) into v_n from public.report_deliveries where report_id = v_report.id;
  if v_n <> 2 then raise exception 'envíos apuntados, hay %', v_n; end if;

  -- Sin cuenta se lee por código, y nada más.
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  v_r := public.report_by_code(v_code);
  if v_r->'snapshot'->>'title' <> 'Nuevo' or v_r->'brand'->>'name' <> 'Rollback sala' then raise exception 'lectura pública'; end if;
  if public.report_by_code('codigo-falso') is not null then raise exception 'un código falso no da nada'; end if;
  select count(*) into v_n from public.session_reports;
  if v_n <> 0 then raise exception 'sin cuenta no se lista nada'; end if;
  begin
    perform public.studio_save_report(v_session.id, v_client, '{}'::jsonb);
    raise exception 'sin cuenta no se escribe';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Recepción y gente de fuera no ven ni tocan informes.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.session_reports where client_id = v_client;
  if v_n <> 0 then raise exception 'recepción no ve informes'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_revoke_report(v_report.id);
    raise exception 'de fuera no se revoca';
  exception when insufficient_privilege then null;
  end;

  -- Revocar deja el enlace sin datos, y regenerar estrena otro.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_revoke_report(v_report.id);
  if public.report_by_code(v_code) is not null then raise exception 'revocado no muestra datos'; end if;
  v_report := public.studio_save_report(v_session.id, v_client, '{"title": "Otra vez"}'::jsonb);
  if v_report.code = v_code then raise exception 'el enlace revocado no vuelve'; end if;
  if public.report_by_code(v_code) is not null then raise exception 'el viejo sigue muerto'; end if;

  execute 'reset role';
  raise notice 'session_reports OK';
end;
$tests$;
rollback;
