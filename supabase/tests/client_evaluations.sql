-- Prueba de las evaluaciones con un espacio temporal.
-- Requiere 20261110110000_client_evaluations.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_reception uuid; v_outsider uuid; v_client uuid;
  v_row public.client_evaluations; v_n integer; v_failed boolean;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3] into v_pro, v_reception, v_outsider
  from (select p.id from public.profiles p order by p.id limit 3) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, status) values (v_space, 'Ana', 'active') returning id into v_client;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Una fecha: lo nuevo se suma y manda.
  v_row := public.evaluation_merge(v_client, date '2026-10-01', '{"cmj": 38.5, "bj_r": 210}'::jsonb, 'excel');
  if v_row.source <> 'excel' or v_row.coach_id <> v_space then raise exception 'nace del Excel y en su espacio'; end if;
  v_row := public.evaluation_merge(v_client, date '2026-10-01', '{"cmj": 39, "rsi": 2.1}'::jsonb);
  if v_row.results <> '{"cmj": 39, "bj_r": 210, "rsi": 2.1}'::jsonb or v_row.version <> 2 then raise exception 'se suma: %', v_row.results; end if;
  perform public.evaluation_merge(v_client, date '2026-11-01', '{"cmj": 41}'::jsonb);
  perform public.evaluation_merge(v_client, null, '{"cmj": 30}'::jsonb);
  perform public.evaluation_merge(v_client, null, '{"cmj": 31}'::jsonb);
  select count(*) into v_n from public.client_evaluations where client_id = v_client;
  if v_n <> 4 then raise exception 'una por fecha y las sin fecha aparte, hay %', v_n; end if;

  v_failed := false;
  begin
    perform public.evaluation_merge(v_client, date '2026-11-02', '{"cmj": "alto"}'::jsonb);
  exception when invalid_parameter_value then v_failed := true;
  end;
  if not v_failed then raise exception 'solo números'; end if;

  -- Editar directamente también valida.
  v_failed := false;
  begin
    update public.client_evaluations set results = '{"CMJ!": 1}'::jsonb where client_id = v_client and eval_date = date '2026-11-01';
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'claves limpias'; end if;

  insert into public.client_evaluation_profiles (client_id, coach_id, info) values (v_client, v_space, '{"deporte": "Pádel"}');
  insert into public.evaluation_tests (coach_id, test_key, name, unit, direction) values (v_space, 'x_salto_cajon', 'Salto al cajón', 'cm', 1);
  update public.evaluation_tests set hidden = true where coach_id = v_space and test_key = 'x_salto_cajon';

  -- Recepción no ve evaluaciones ni crea tests.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.client_evaluations where client_id = v_client;
  if v_n <> 0 then raise exception 'recepción no ve evaluaciones'; end if;
  v_failed := false;
  begin
    insert into public.evaluation_tests (coach_id, test_key, name) values (v_space, 'x_otro', 'Otro');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'recepción no crea tests'; end if;
  select count(*) into v_n from public.evaluation_tests where coach_id = v_space;
  if v_n <> 0 then raise exception 'recepción no entra en los tests'; end if;

  -- Fuera del espacio, nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_failed := false;
  begin
    perform public.evaluation_merge(v_client, date '2026-10-01', '{"cmj": 1}'::jsonb);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'fuera del espacio no se guarda'; end if;
  select count(*) into v_n from public.client_evaluation_profiles where client_id = v_client;
  if v_n <> 0 then raise exception 'fuera del espacio no se ve'; end if;

  raise notice 'client_evaluations OK';
end;
$tests$;
rollback;
