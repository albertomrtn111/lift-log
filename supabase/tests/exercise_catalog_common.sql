-- Prueba del catálogo común con ejercicios temporales.
-- Requiere 20261105160000_exercise_catalog_common.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_user uuid;
  v_space uuid;
  v_source uuid;
  v_target uuid;
  v_variant uuid;
  v_program uuid;
  v_day uuid;
  v_row uuid;
  v_template uuid;
  v_result jsonb;
begin
  if exists (select 1 from public.exercise_catalog where is_active and block_key is null) then
    raise exception 'todo ejercicio activo necesita bloque';
  end if;
  if (select count(*) from public.exercise_blocks) <> 30 then raise exception 'deben ser 30 bloques'; end if;
  if (select counts_for_volume from public.muscle_groups where name = 'No aplica') then
    raise exception 'No aplica no cuenta para el volumen';
  end if;

  select p.coach_id, p.id, d.id into v_space, v_program, v_day
  from public.training_programs p join public.training_days d on d.program_id = p.id limit 1;
  select cm.user_id into v_user
  from public.coach_memberships cm
  where cm.coach_id = v_space and cm.role = 'owner' and cm.status = 'active' limit 1;

  insert into public.exercise_catalog (name, primary_group, block_key)
    values ('Rollback press raro', 'Pecho', 'empuje_horizontal') returning id into v_source;
  insert into public.exercise_catalog (name, primary_group, block_key)
    values ('Rollback press bueno', 'Pecho', 'empuje_horizontal') returning id into v_target;
  insert into public.exercise_catalog (name, primary_group, block_key, variant_of, possible_duplicate_of)
    values ('Rollback press variante', 'Pecho', 'empuje_horizontal', v_source, v_source) returning id into v_variant;
  update public.exercise_catalog set possible_duplicate_of = v_target where id = v_source;
  insert into public.exercise_catalog_aliases (alias_key, alias, catalog_exercise_id)
    values ('rollback alias viejo', 'Rollback alias viejo', v_source);

  insert into public.training_exercises (coach_id, program_id, day_id, exercise_name, catalog_exercise_id)
    values (v_space, v_program, v_day, 'Rollback press raro', v_source) returning id into v_row;
  insert into public.training_templates (coach_id, name, type, structure)
    values (v_space, 'Rollback plantilla', 'strength', jsonb_build_object('days', jsonb_build_array(
      jsonb_build_object('exercises', jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_source))))))
    returning id into v_template;

  -- El aviso: nombre idéntico sin tildes en cualquier bloque; parecido solo en el mismo.
  if not exists (select 1 from public.find_similar_catalog_exercises('PRÉSS  de banca plano con barra', 'biceps') where exact) then
    raise exception 'el nombre idéntico se avisa en todo el catálogo';
  end if;
  if not exists (select 1 from public.find_similar_catalog_exercises('Press banca plano barra', 'empuje_horizontal')) then
    raise exception 'debe encontrar el parecido dentro del bloque';
  end if;
  if exists (select 1 from public.find_similar_catalog_exercises('Press banca plano barra', 'biceps')) then
    raise exception 'el parecido no sale de su bloque';
  end if;
  if not exists (select 1 from public.find_similar_catalog_exercises('rollback alias viejo', null) where id = v_source and exact) then
    raise exception 'los alias también cuentan';
  end if;

  -- Sin ser del equipo de NexTrain no se fusiona.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    perform public.merge_catalog_exercise(v_source, v_target);
    raise exception 'un entrenador no debe fusionar';
  exception when insufficient_privilege then null;
  end;

  insert into public.platform_admins (user_id) values (v_user) on conflict do nothing;
  v_result := public.merge_catalog_exercise(v_source, v_target);
  if (v_result->>'exercises')::int <> 1 or (v_result->>'templates')::int <> 1 then
    raise exception 'recuento de la fusión: %', v_result;
  end if;

  if (select catalog_exercise_id from public.training_exercises where id = v_row) <> v_target then
    raise exception 'el historial debe pasar al ejercicio bueno';
  end if;
  if (select exercise_name from public.training_exercises where id = v_row) <> 'Rollback press raro' then
    raise exception 'la fila conserva su nombre original';
  end if;
  if (select structure::text from public.training_templates where id = v_template) like '%' || v_source::text || '%' then
    raise exception 'la plantilla debe apuntar al ejercicio bueno';
  end if;
  if (select catalog_exercise_id from public.exercise_catalog_aliases where alias_key = 'rollback alias viejo') <> v_target
     or (select catalog_exercise_id from public.exercise_catalog_aliases where alias_key = 'rollback press raro') <> v_target then
    raise exception 'alias y nombre antiguo pasan al ejercicio bueno';
  end if;
  if (select variant_of from public.exercise_catalog where id = v_variant) <> v_target
     or (select possible_duplicate_of from public.exercise_catalog where id = v_variant) <> v_target then
    raise exception 'las variantes pasan al ejercicio bueno';
  end if;
  if not exists (
    select 1 from public.exercise_catalog
    where id = v_source and not is_active and merged_into = v_target and merged_by = v_user and possible_duplicate_of is null
  ) then
    raise exception 'el duplicado queda fusionado e inactivo';
  end if;
  if (select c.id from public.resolve_catalog_exercise(null, 'Rollback press raro') c) <> v_target then
    raise exception 'el nombre antiguo debe resolver al ejercicio bueno';
  end if;

  begin
    perform public.merge_catalog_exercise(v_source, v_target);
    raise exception 'no se fusiona dos veces';
  exception when invalid_parameter_value then null;
  end;

  if has_function_privilege('anon', 'public.merge_catalog_exercise(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.find_similar_catalog_exercises(text, text, integer)', 'execute') then
    raise exception 'anon no debe ejecutar estas funciones';
  end if;
  raise notice 'exercise_catalog_common: todo correcto';
end;
$tests$;
rollback;
