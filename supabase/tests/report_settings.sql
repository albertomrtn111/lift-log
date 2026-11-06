-- Prueba de los ajustes de informes y de los avisos pospuestos, con un espacio temporal.
-- Requiere 20261106130000_report_settings.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_admin uuid; v_pro uuid; v_colleague uuid; v_client uuid; v_session public.studio_sessions; v_n integer; v_channel text;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_admin, v_pro, v_colleague
  from (select p.id from public.profiles p order by p.id limit 3) x;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_admin, 'admin', 'active'), (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_client;

  execute 'set local role authenticated';

  -- Solo el administrador cambia los ajustes.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_save_report_settings(v_space, 'Hola', null, null, 3, 'email', '{}');
    raise exception 'un profesional no';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.studio_save_report_settings(v_space, ' Hola {nombre} ', null, '', 6, 'email', '{"evolution": false}');
  perform public.studio_save_report_settings(v_space, 'Otra', 'Asunto', null, 6, 'email', '{"evolution": false}');
  select default_channel into v_channel from public.report_settings where coach_id = v_space and whatsapp_text = 'Otra' and email_subject = 'Asunto' and notice_hours = 6;
  if v_channel <> 'email' then raise exception 'ajustes'; end if;
  begin
    perform public.studio_save_report_settings(v_space, null, null, null, 100, 'email', '{}');
    raise exception 'ventana fuera de rango';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.studio_save_report_settings(v_space, null, null, null, 3, 'paloma', '{}');
    raise exception 'canal inventado';
  exception when invalid_parameter_value then null;
  end;

  -- Posponer es de cada profesional, y se puede repetir.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  v_session := public.studio_create_session(v_client, current_date);
  perform public.studio_snooze_report(v_session.id, v_client, 2);
  perform public.studio_snooze_report(v_session.id, v_client, 1);
  select count(*) into v_n from public.report_snoozes where session_id = v_session.id;
  if v_n <> 1 then raise exception 'pospuestos %', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.report_snoozes where session_id = v_session.id;
  if v_n <> 0 then raise exception 'es de cada uno'; end if;
  begin
    perform public.studio_snooze_report(v_session.id, v_client, 99);
    raise exception 'horas fuera de rango';
  exception when invalid_parameter_value then null;
  end;

  execute 'reset role';
  raise notice 'report_settings OK';
end;
$tests$;
rollback;
