-- Prueba del editor de sesiones de sala con un espacio temporal.
-- Requiere 20261105233000_studio_editor.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_colleague uuid; v_reception uuid; v_outsider uuid;
  v_client uuid; v_a uuid; v_b uuid;
  v_session public.studio_sessions; v_other public.studio_sessions; v_copy public.studio_sessions;
  v_section public.studio_session_sections; v_section2 public.studio_session_sections;
  v_item public.studio_session_items; v_item2 public.studio_session_items;
  v_n integer; v_order uuid[];
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4]
    into v_pro, v_colleague, v_reception, v_outsider
  from (
    select p.id from public.profiles p order by p.id limit 4
  ) x;
  if v_outsider is null then raise exception 'faltan usuarios para la prueba'; end if;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Rollback atleta', 'rollback@example.com') returning id into v_client;
  select (array_agg(id))[1], (array_agg(id))[2] into v_a, v_b
  from (select id from public.exercise_catalog where is_active order by id limit 2) x;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- El profesional tiene que ser del equipo, y recepción no da sesiones.
  begin
    perform public.studio_create_session(v_client, current_date, null, v_outsider);
    raise exception 'un profesional de fuera no vale';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.studio_create_session(v_client, current_date, null, v_reception);
    raise exception 'recepción no da sesiones';
  exception when invalid_parameter_value then null;
  end;

  v_session := public.studio_create_session(v_client, current_date, '10:00', v_colleague, 'Fuerza A');
  if v_session.professional_id <> v_colleague then raise exception 'la sesión es del compañero elegido'; end if;
  begin
    perform public.studio_update_session(v_session.id, null, jsonb_build_object('professional_id', v_outsider));
    raise exception 'tampoco al cambiarla';
  exception when invalid_parameter_value then null;
  end;
  v_other := public.studio_create_session(v_client, current_date + 1);

  -- Etiquetas: se reutilizan aunque se escriban distinto, y cuentan sus usos.
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object(
    'catalog_exercise_id', v_a, 'sets', 3, 'reps', '10', 'load_kg', 40, 'rir', 2,
    'next_load', 'up', 'note', 'Cuidado con el hombro', 'circuit', jsonb_build_array('Remo'),
    'tags', jsonb_build_array('Banda roja', 'barra')
  ));
  v_item2 := public.studio_save_item(v_session.id, null, null, jsonb_build_object(
    'catalog_exercise_id', v_b, 'tags', jsonb_build_array(' banda  roja ')
  ));
  execute 'reset role';
  select count(*) into v_n from public.studio_tags where coach_id = v_space;
  if v_n <> 2 then raise exception 'esperaba 2 etiquetas, hay %', v_n; end if;
  select uses into v_n from public.studio_tags where coach_id = v_space and name_key = 'banda roja';
  if v_n <> 2 then raise exception 'banda roja tiene dos usos, hay %', v_n; end if;
  execute 'set local role authenticated';

  v_item2 := public.studio_save_item(v_session.id, v_item2.id, v_item2.version, jsonb_build_object('tags', '[]'::jsonb));
  execute 'reset role';
  select uses into v_n from public.studio_tags where coach_id = v_space and name_key = 'banda roja';
  if v_n <> 1 then raise exception 'quitar la etiqueta resta un uso'; end if;
  execute 'set local role authenticated';

  -- Subbloques: crear, renombrar, y no se mezclan entre sesiones.
  v_section := public.studio_save_section(v_session.id, null, ' Calentamiento ');
  v_section2 := public.studio_save_section(v_session.id, null, 'Fuerza');
  if v_section.title <> 'Calentamiento' or v_section2.sort_order <= v_section.sort_order then
    raise exception 'el subbloque nace limpio y al final';
  end if;
  v_section := public.studio_save_section(v_session.id, v_section.id, 'Entrada en calor');
  if v_section.title <> 'Entrada en calor' then raise exception 'renombrar el subbloque'; end if;
  begin
    perform public.studio_save_item(v_other.id, null, null, jsonb_build_object('catalog_exercise_id', v_a, 'section_id', v_section.id));
    raise exception 'un subbloque de otra sesión no vale';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.studio_arrange_session(v_other.id, '{}', jsonb_build_array(jsonb_build_object('id', v_item.id, 'section_id', v_section.id)));
    raise exception 'ordenar tampoco mezcla sesiones';
  exception when invalid_parameter_value then null;
  end;

  -- Orden: ejercicios y subbloques, sin subir la versión de la celda.
  perform public.studio_arrange_session(
    v_session.id,
    array[v_section2.id, v_section.id],
    jsonb_build_array(
      jsonb_build_object('id', v_item2.id, 'section_id', null),
      jsonb_build_object('id', v_item.id, 'section_id', v_section2.id)
    )
  );
  select array_agg(id order by sort_order) into v_order from public.studio_session_sections where session_id = v_session.id;
  if v_order[1] <> v_section2.id then raise exception 'el subbloque cambia de orden'; end if;
  select array_agg(id order by sort_order) into v_order from public.studio_session_items where session_id = v_session.id;
  if v_order[1] <> v_item2.id then raise exception 'el ejercicio cambia de orden'; end if;
  if (select version from public.studio_session_items where id = v_item.id) <> v_item.version
     or (select section_id from public.studio_session_items where id = v_item.id) <> v_section2.id then
    raise exception 'ordenar mueve de subbloque y no toca la versión';
  end if;

  -- Duplicar: ejercicios, series y pesos, sin notas ni nada de lo realizado.
  v_item := public.studio_set_item_done(v_item.id, v_item.version, true);
  v_copy := public.studio_duplicate_session(v_session.id, current_date + 7, null, null, 'Fuerza A bis');
  if v_copy.origin <> 'copy' or v_copy.status <> 'planned' or v_copy.professional_id <> v_pro or v_copy.name <> 'Fuerza A bis' then
    raise exception 'la copia nace prevista, como copia y del que la crea';
  end if;
  select * into v_item2 from public.studio_session_items where session_id = v_copy.id and catalog_exercise_id = v_a;
  if v_item2.sets <> 3 or v_item2.reps <> '10' or v_item2.load_kg <> 40 or v_item2.rir <> 2 or v_item2.circuit <> array['Remo'] then
    raise exception 'la copia lleva la prescripción';
  end if;
  if v_item2.note is not null or v_item2.is_done or v_item2.next_load is not null then
    raise exception 'la copia no lleva notas ni realizado';
  end if;
  select count(*) into v_n from public.studio_session_sets where item_id = v_item2.id;
  if v_n <> 0 then raise exception 'la copia no lleva series hechas'; end if;
  select count(*) into v_n from public.studio_session_items where session_id = v_copy.id;
  if v_n <> 2 then raise exception 'la copia lleva los dos ejercicios, hay %', v_n; end if;
  select count(*) into v_n from public.studio_item_tags where item_id = v_item2.id;
  if v_n <> 2 then raise exception 'la copia lleva las etiquetas'; end if;
  if (select s.title from public.studio_session_sections s where s.id = v_item2.section_id) <> 'Fuerza'
     or v_item2.section_id = v_section2.id then
    raise exception 'la copia tiene sus propios subbloques';
  end if;
  select count(distinct batch_id) into v_n from public.studio_change_log
  where coach_id = v_space and (row_id = v_copy.id or row_id = v_item2.id);
  if v_n <> 1 then raise exception 'duplicar es un solo lote'; end if;

  -- Quitar un subbloque deja sus ejercicios.
  perform public.studio_delete_section(v_section2.id);
  if (select section_id from public.studio_session_items where id = v_item.id) is not null then
    raise exception 'el ejercicio queda sin subbloque';
  end if;

  -- Recepción y gente de fuera no tocan nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_save_section(v_session.id, null, 'No');
    raise exception 'recepción no crea subbloques';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_duplicate_session(v_session.id, current_date);
    raise exception 'de fuera no se duplica';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_delete_section(v_section.id);
    raise exception 'de fuera no se borra';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_arrange_session(v_session.id, '{}', '[]'::jsonb);
    raise exception 'de fuera no se ordena';
  exception when insufficient_privilege then null;
  end;

  -- Las internas no se llaman desde fuera.
  begin
    perform public.studio_set_item_tags(v_space, v_item.id, '[]'::jsonb);
    raise exception 'la interna no se llama';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'studio_editor OK';
end;
$tests$;
rollback;
