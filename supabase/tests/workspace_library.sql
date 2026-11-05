-- Prueba de la biblioteca con entradas temporales.
-- Requiere 20261105170000_workspace_library.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_owner uuid; v_coach uuid; v_outsider uuid; v_space uuid; v_other_space uuid := gen_random_uuid();
  v_program uuid; v_day uuid; v_row uuid; v_template uuid;
  v_a uuid; v_b uuid; v_entry_a uuid; v_result jsonb; v_n integer;
begin
  select p.coach_id, p.id, d.id into v_space, v_program, v_day
  from public.training_programs p join public.training_days d on d.program_id = p.id limit 1;
  select cm.user_id into v_owner from public.coach_memberships cm
  where cm.coach_id = v_space and cm.role = 'owner' and cm.status = 'active';
  insert into public.coaches (id, name, subscription_tier) values (v_other_space, 'Rollback biblioteca', 'starter');
  select p.id into v_coach from public.profiles p where p.id not in (select user_id from public.coach_memberships) limit 1;
  select p.id into v_outsider from public.profiles p
  where p.id not in (select user_id from public.coach_memberships) and p.id <> v_coach limit 1;
  if v_coach is null or v_outsider is null then raise exception 'faltan usuarios para la prueba'; end if;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_coach, 'coach', 'active');

  select id into v_a from public.exercise_catalog where name = 'Press de banca plano con barra';
  select id into v_b from public.exercise_catalog where name = 'Press de banca plano con mancuernas';
  insert into public.training_exercises (coach_id, program_id, day_id, exercise_name, catalog_exercise_id)
    values (v_space, v_program, v_day, 'Rollback', v_a) returning id into v_row;
  insert into public.training_templates (coach_id, name, type, structure)
    values (v_space, 'Rollback', 'strength', jsonb_build_object('x', v_a)) returning id into v_template;

  execute 'set local role authenticated';

  -- Un profesional añade, pero no cambia ni quita.
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  insert into public.workspace_exercises (coach_id, catalog_exercise_id) values (v_space, v_a) returning id into v_entry_a;
  update public.workspace_exercises set short_name = 'No' where id = v_entry_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'un profesional no renombra'; end if;
  delete from public.workspace_exercises where id = v_entry_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'un profesional no quita'; end if;
  begin
    perform public.remove_workspace_exercise(v_entry_a);
    raise exception 'un profesional no quita por la función';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.workspace_exercise_usage(v_entry_a);
    raise exception 'un profesional no ve el uso';
  exception when insufficient_privilege then null;
  end;

  -- Otro espacio no ve nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.workspace_exercises where id = v_entry_a) then raise exception 'otro espacio no lee'; end if;
  begin
    insert into public.workspace_exercises (coach_id, catalog_exercise_id) values (v_space, v_b);
    raise exception 'otro espacio no añade';
  exception when insufficient_privilege then null;
  end;

  -- El propietario gestiona.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  update public.workspace_exercises set short_name = 'Banca', default_sets = 3, default_reps = '8-10' where id = v_entry_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'el propietario renombra'; end if;
  insert into public.workspace_blocks (coach_id, block_key, display_name, sort_order) values (v_space, 'empuje_horizontal', 'Empujes', 5);

  v_result := public.workspace_exercise_usage(v_entry_a);
  if jsonb_array_length(v_result->'clients') < 1 or (v_result->>'templates')::int < 1 then
    raise exception 'el uso debe ver clientes y plantillas: %', v_result;
  end if;

  -- Quitar sin elegir otro no toca los datos.
  v_result := public.remove_workspace_exercise(v_entry_a);
  if (select catalog_exercise_id from public.training_exercises where id = v_row) <> v_a then raise exception 'quitar no mueve datos'; end if;

  -- Pasar los datos a otro ejercicio.
  insert into public.workspace_exercises (coach_id, catalog_exercise_id) values (v_space, v_a) returning id into v_entry_a;
  begin
    perform public.remove_workspace_exercise(v_entry_a, v_a);
    raise exception 'no se pasa a sí mismo';
  exception when invalid_parameter_value then null;
  end;
  v_result := public.remove_workspace_exercise(v_entry_a, v_b);
  if (select catalog_exercise_id from public.training_exercises where id = v_row) <> v_b then raise exception 'debe pasar los datos'; end if;
  if (select exercise_name from public.training_exercises where id = v_row) <> 'Rollback' then raise exception 'conserva el nombre'; end if;
  if (select structure::text from public.training_templates where id = v_template) like '%' || v_a::text || '%' then raise exception 'plantilla'; end if;
  if not exists (select 1 from public.workspace_exercises where coach_id = v_space and catalog_exercise_id = v_b) then raise exception 'el destino entra en la biblioteca'; end if;
  if exists (select 1 from public.workspace_exercises where id = v_entry_a) then raise exception 'la entrada se quita'; end if;

  -- La fusión mueve las bibliotecas sin duplicar.
  execute 'reset role';
  insert into public.platform_admins (user_id) values (v_owner) on conflict do nothing;
  insert into public.workspace_exercises (coach_id, catalog_exercise_id) values (v_space, v_a);
  insert into public.workspace_exercises (coach_id, catalog_exercise_id) values (v_other_space, v_a);
  perform public.merge_catalog_exercise(v_a, v_b);
  if (select count(*) from public.workspace_exercises where coach_id = v_space and catalog_exercise_id = v_b) <> 1 then raise exception 'un espacio con los dos se queda con uno'; end if;
  if not exists (select 1 from public.workspace_exercises where coach_id = v_other_space and catalog_exercise_id = v_b) then raise exception 'la entrada pasa al bueno'; end if;
  if exists (select 1 from public.workspace_exercises where catalog_exercise_id = v_a) then raise exception 'no queda entrada del duplicado'; end if;
end;
$tests$;
rollback;
