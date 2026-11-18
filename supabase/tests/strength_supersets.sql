-- Prueba de integración de las superseries (migración 20261118100000_strength_supersets)
-- con un cliente temporal y el rol authenticated. Termina con ROLLBACK explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_program uuid := gen_random_uuid();
  v_day uuid := gen_random_uuid();
  v_bench uuid := gen_random_uuid();
  v_curl uuid := gen_random_uuid();
  v_triceps uuid := gen_random_uuid();
  v_version timestamptz;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;

  insert into public.clients (id, coach_id, user_id, full_name, status) values (v_client, v_coach, v_user, 'Superseries rollback test', 'active');
  insert into public.training_programs (id, coach_id, client_id, name, weeks, total_weeks, status, effective_from, effective_to, updated_at)
    values (v_program, v_coach, v_client, 'Bloque superseries', 4, 4, 'draft', current_date, current_date + 27, now() - interval '1 day');
  insert into public.training_days (id, coach_id, program_id, name, day_name, order_index, day_order, default_weekday)
    values (v_day, v_coach, v_program, 'Torso', 'Torso', 1, 1, 2);
  insert into public.training_exercises (id, coach_id, program_id, day_id, order_index, exercise_name, muscle_group, sets, reps, rest_seconds) values
    (v_bench, v_coach, v_program, v_day, 1, 'Press banca', 'pecho', 4, '8', 150),
    (v_curl, v_coach, v_program, v_day, 2, 'Curl de bíceps', 'bíceps', 4, '12', 60),
    (v_triceps, v_coach, v_program, v_day, 3, 'Extensión de tríceps', 'tríceps', 3, '15', 60);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  -- 1. Enlazar Curl y Tríceps; el descanso se guarda tal cual llega.
  select updated_at into v_version from public.training_programs where id = v_program;
  perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, jsonb_build_object(
    'expected_updated_at', v_version, 'days', jsonb_build_array(jsonb_build_object('id', v_day, 'name', 'Torso', 'weekday', 2,
      'exercises', jsonb_build_array(
        jsonb_build_object('id', v_bench),
        jsonb_build_object('id', v_curl, 'superset', 'C', 'rest_seconds', 0),
        jsonb_build_object('id', v_triceps, 'superset', 'C', 'rest_seconds', 90))))));
  if (select superset_key from public.training_exercises where id = v_curl) is distinct from 'C'
    or (select superset_key from public.training_exercises where id = v_triceps) is distinct from 'C'
    or (select superset_key from public.training_exercises where id = v_bench) is not null
    or (select rest_seconds from public.training_exercises where id = v_curl) <> 0 then
    raise exception 'No se guardó la superserie.';
  end if;
  v_assertions := v_assertions + 1;

  -- 2. Omitir superset conserva el bloque.
  select updated_at into v_version from public.training_programs where id = v_program;
  perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, jsonb_build_object(
    'expected_updated_at', v_version, 'days', jsonb_build_array(jsonb_build_object('id', v_day, 'name', 'Torso', 'weekday', 2,
      'exercises', jsonb_build_array(jsonb_build_object('id', v_bench), jsonb_build_object('id', v_curl, 'sets', 3), jsonb_build_object('id', v_triceps))))));
  if (select superset_key from public.training_exercises where id = v_curl) is distinct from 'C' then
    raise exception 'Omitir superset borró la clave.';
  end if;
  v_assertions := v_assertions + 1;

  -- 3. Un bloque partido se rechaza y no se guarda nada.
  select updated_at into v_version from public.training_programs where id = v_program;
  begin
    perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, jsonb_build_object(
      'expected_updated_at', v_version, 'days', jsonb_build_array(jsonb_build_object('id', v_day, 'name', 'Torso', 'weekday', 2,
        'exercises', jsonb_build_array(jsonb_build_object('id', v_curl), jsonb_build_object('id', v_bench), jsonb_build_object('id', v_triceps))))));
    raise exception 'Se aceptó una superserie partida.';
  exception when others then
    if sqlerrm not like 'Los ejercicios de una superserie tienen que ir seguidos en el día:%' then raise; end if;
  end;
  if (select order_index from public.training_exercises where id = v_bench) <> 1 then
    raise exception 'El rechazo dejó cambios guardados.';
  end if;
  v_assertions := v_assertions + 1;

  -- 4. null saca del bloque y el que queda solo pierde la clave.
  select updated_at into v_version from public.training_programs where id = v_program;
  perform public.update_nexttrain_strength_program_days(v_coach, v_client, v_program, jsonb_build_object(
    'expected_updated_at', v_version, 'days', jsonb_build_array(jsonb_build_object('id', v_day, 'name', 'Torso', 'weekday', 2,
      'exercises', jsonb_build_array(jsonb_build_object('id', v_bench), jsonb_build_object('id', v_curl), jsonb_build_object('id', v_triceps, 'superset', null))))));
  if (select superset_key from public.training_exercises where id = v_curl) is not null
    or (select superset_key from public.training_exercises where id = v_triceps) is not null then
    raise exception 'El ejercicio que se quedó solo conserva la clave.';
  end if;
  v_assertions := v_assertions + 1;

  -- 5. Más de 4 en un bloque se rechaza (comprobado directamente).
  execute 'reset role';
  update public.training_exercises set superset_key = 'G' where day_id = v_day;
  insert into public.training_exercises (coach_id, program_id, day_id, order_index, exercise_name, muscle_group, superset_key) values
    (v_coach, v_program, v_day, 4, 'Remo', 'espalda', 'G'),
    (v_coach, v_program, v_day, 5, 'Jalón', 'espalda', 'G');
  begin
    perform public.nexttrain_check_strength_supersets(v_program);
    raise exception 'Se aceptó un bloque de 5.';
  exception when others then
    if sqlerrm not like 'Una superserie admite como mucho 4 ejercicios:%' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 6. La columna rechaza claves vacías.
  begin
    update public.training_exercises set superset_key = '' where id = v_bench;
    raise exception 'Se aceptó una clave vacía.';
  exception when check_violation then null;
  end;
  v_assertions := v_assertions + 1;

  raise notice 'strength_supersets: % verificaciones correctas', v_assertions;
end;
$tests$;
rollback;
