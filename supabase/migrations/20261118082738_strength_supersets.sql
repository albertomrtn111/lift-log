-- Superseries en los programas de fuerza online (NXT-121).
--
-- Los ejercicios seguidos de un mismo día con la misma superset_key forman un bloque
-- (superserie de 2, triserie de 3 o serie gigante de 4). La letra (C1, C2…) no se
-- guarda: se calcula al mostrar el día. Un ejercicio que se queda solo con su clave
-- se muestra como normal. Dentro del bloque, rest_seconds de cada ejercicio es el
-- paso al siguiente (0 = sin descanso) y el del último, el descanso tras la ronda.
-- Las series del atleta no cambian: siguen siendo por ejercicio.
--
-- Modo Sala no se toca (tablas studio_*).

alter table public.training_exercises
  add column if not exists superset_key text;

alter table public.training_exercises
  drop constraint if exists training_exercises_superset_key_check;
alter table public.training_exercises
  add constraint training_exercises_superset_key_check
  check (superset_key is null or char_length(superset_key) between 1 and 40);

comment on column public.training_exercises.superset_key is
  'Clave del bloque de superserie dentro del día. Ejercicios seguidos del mismo día con la misma clave forman el bloque (2 a 4). Null = ejercicio suelto.';

-- Comprueba los bloques de un programa después de escribirlo: quita la clave a los
-- ejercicios que se quedan solos y rechaza bloques partidos o de más de 4.
create or replace function public.nexttrain_check_strength_supersets(p_program_id uuid)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_problem text;
begin
  with groups as (
    select e.day_id, e.superset_key, count(*) as n
    from public.training_exercises e
    where e.program_id = p_program_id and e.superset_key is not null
    group by e.day_id, e.superset_key
  )
  update public.training_exercises e set superset_key = null
  from groups g
  where e.program_id = p_program_id and e.day_id = g.day_id and e.superset_key = g.superset_key and g.n = 1;

  with ranked as (
    select e.day_id, e.superset_key, e.exercise_name,
      row_number() over (partition by e.day_id order by e.order_index, e.created_at, e.id) as pos
    from public.training_exercises e
    where e.program_id = p_program_id
  ), groups as (
    select r.day_id, r.superset_key, count(*) as n, max(r.pos) - min(r.pos) + 1 as span,
      string_agg(r.exercise_name, ', ' order by r.pos) as names
    from ranked r
    where r.superset_key is not null
    group by r.day_id, r.superset_key
  )
  select case
      when g.n > 4 then 'Una superserie admite como mucho 4 ejercicios: ' || g.names || '.'
      else 'Los ejercicios de una superserie tienen que ir seguidos en el día: ' || g.names || '.'
    end
    into v_problem
  from groups g
  where g.n > 4 or g.span <> g.n
  limit 1;

  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function public.nexttrain_check_strength_supersets(uuid) from public, anon;
grant execute on function public.nexttrain_check_strength_supersets(uuid) to authenticated;

-- Creación desde el MCP: igual que la versión vigente, más `superset` por ejercicio.
create or replace function public.create_nexttrain_strength_program(p_coach_id uuid, p_client_id uuid, p_payload jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_program public.training_programs%rowtype;
  v_from date := (p_payload->>'effective_from')::date;
  v_weeks integer := (p_payload->>'weeks')::integer;
  v_status text := coalesce(p_payload->>'status', 'draft');
  v_day jsonb;
  v_exercise jsonb;
  v_catalog public.exercise_catalog%rowtype;
  v_unresolved text[] := '{}';
  v_day_id uuid;
  v_day_index integer := 0;
  v_exercise_index integer;
  v_exercise_count integer := 0;
  v_archived_ids uuid[] := '{}';
begin
  if auth.uid() is null or not exists (
    select 1 from public.coach_memberships m
    where m.coach_id = p_coach_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin', 'coach')
  ) then
    raise exception 'No tienes acceso de entrenador a este espacio.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id) then
    raise exception 'Cliente no encontrado en este espacio.' using errcode = '42501';
  end if;
  if nullif(btrim(p_payload->>'name'), '') is null then raise exception 'Indica un nombre para el programa.'; end if;
  if v_from is null then raise exception 'Indica la fecha de inicio del programa.'; end if;
  if v_weeks is null or v_weeks not between 1 and 52 then raise exception 'El programa debe durar entre 1 y 52 semanas.'; end if;
  if v_status not in ('draft', 'active') then raise exception 'Estado de programa inválido.'; end if;
  if jsonb_typeof(p_payload->'days') is distinct from 'array' or jsonb_array_length(p_payload->'days') = 0 then
    raise exception 'Indica al menos un día de entrenamiento.';
  end if;
  if v_status = 'active' and v_from > public.nexttrain_coach_today(p_coach_id) then
    raise exception 'Guarda los programas futuros como borrador y actívalos al empezar.';
  end if;

  -- Todos los ejercicios deben existir en la biblioteca antes de escribir nada.
  for v_exercise in
    select e.value from jsonb_array_elements(p_payload->'days') d,
      jsonb_array_elements(case when jsonb_typeof(d.value->'exercises') = 'array' then d.value->'exercises' else '[]'::jsonb end) e
  loop
    v_catalog := public.resolve_catalog_exercise(nullif(v_exercise->>'catalog_exercise_id', '')::uuid, v_exercise->>'name');
    if v_catalog.id is null then
      v_unresolved := v_unresolved || coalesce(nullif(btrim(v_exercise->>'name'), ''), 'sin nombre');
    end if;
  end loop;
  if cardinality(v_unresolved) > 0 then
    raise exception 'Estos ejercicios no están en la biblioteca: %. Usa list_exercise_catalog y envía el nombre exacto o catalog_exercise_id.',
      array_to_string(v_unresolved, ', ');
  end if;

  if v_status = 'active' then
    -- Serializa activaciones simultáneas del mismo cliente.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text || ':strength', 0));
    with archived as (
      update public.training_programs set status = 'archived'
      where coach_id = p_coach_id and client_id = p_client_id and status = 'active'
      returning id
    ) select coalesce(array_agg(id), '{}') into v_archived_ids from archived;
  end if;

  insert into public.training_programs (coach_id, client_id, name, weeks, total_weeks, status, effective_from, effective_to)
  values (p_coach_id, p_client_id, btrim(p_payload->>'name'), v_weeks, v_weeks, v_status, v_from, v_from + v_weeks * 7 - 1)
  returning * into v_program;

  -- Mismas columnas que getDefaultTrainingColumns() en src/lib/training/defaultColumns.ts.
  insert into public.training_columns (coach_id, program_id, key, label, data_type, scope, editable_by, order_index, required, options)
  select p_coach_id, v_program.id, c.key, c.label, c.data_type, c.scope, c.editable_by, c.order_index, false, '{}'::jsonb
  from (values
    ('exercise', 'Ejercicio', 'text', 'exercise', 'coach', 1),
    ('sets', 'Series', 'number', 'week', 'coach', 2),
    ('reps', 'Reps', 'text', 'week', 'coach', 3),
    ('rir', 'RIR', 'text', 'week', 'coach', 4),
    ('rest', 'Descanso', 'text', 'week', 'coach', 5),
    ('tips', 'Tips', 'text', 'week', 'coach', 6),
    ('weight', 'Peso', 'number', 'week', 'client', 7),
    ('reps_done', 'Reps hechas', 'number', 'week', 'client', 8),
    ('notes', 'Notas', 'text', 'week', 'both', 9)
  ) as c(key, label, data_type, scope, editable_by, order_index);

  for v_day in select value from jsonb_array_elements(p_payload->'days') loop
    v_day_index := v_day_index + 1;
    if (v_day->>'weekday')::integer not between 1 and 7 then raise exception 'El día de la semana debe estar entre 1 y 7.'; end if;
    if jsonb_typeof(v_day->'exercises') is distinct from 'array' or jsonb_array_length(v_day->'exercises') = 0 then
      raise exception 'Cada día necesita al menos un ejercicio.';
    end if;
    insert into public.training_days (coach_id, program_id, name, day_name, order_index, day_order, default_weekday)
    values (p_coach_id, v_program.id, v_day->>'name', v_day->>'name', v_day_index, v_day_index, (v_day->>'weekday')::integer)
    returning id into v_day_id;

    v_exercise_index := 0;
    for v_exercise in select value from jsonb_array_elements(v_day->'exercises') loop
      v_exercise_index := v_exercise_index + 1;
      v_catalog := public.resolve_catalog_exercise(nullif(v_exercise->>'catalog_exercise_id', '')::uuid, v_exercise->>'name');
      -- jsonb_populate_record convierte cada valor al tipo real de la columna.
      insert into public.training_exercises (coach_id, program_id, day_id, order_index, exercise_name, catalog_exercise_id,
        sets, reps, rir, rest_seconds, notes, muscle_group, superset_key)
      select p_coach_id, v_program.id, v_day_id, v_exercise_index, v_catalog.name, v_catalog.id,
        r.sets, r.reps, r.rir, r.rest_seconds, r.notes, public.catalog_group_muscle_group(v_catalog.primary_group),
        nullif(btrim(v_exercise->>'superset'), '')
      from jsonb_populate_record(null::public.training_exercises, jsonb_build_object(
        'sets', v_exercise->'sets', 'reps', v_exercise->'reps', 'rir', v_exercise->'rir',
        'rest_seconds', v_exercise->'rest_seconds', 'notes', v_exercise->'notes')) r;
      v_exercise_count := v_exercise_count + 1;
    end loop;
  end loop;

  perform public.nexttrain_check_strength_supersets(v_program.id);

  return pg_catalog.to_jsonb(v_program) || jsonb_build_object('day_count', v_day_index, 'exercise_count', v_exercise_count,
    'archived_program_ids', v_archived_ids);
end;
$function$;

revoke all on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) to authenticated;

-- Edición de días desde el MCP: igual que la versión vigente, más `superset` por
-- ejercicio (omitido se conserva, null lo saca del bloque).
create or replace function public.update_nexttrain_strength_program_days(p_coach_id uuid, p_client_id uuid, p_program_id uuid, p_payload jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_program public.training_programs%rowtype;
  v_catalog_enabled boolean := pg_catalog.to_regprocedure('public.resolve_catalog_exercise(uuid,text)') is not null
    and pg_catalog.to_regprocedure('public.catalog_group_muscle_group(text)') is not null;
  v_day jsonb;
  v_exercise jsonb;
  v_day_id uuid;
  v_exercise_id uuid;
  v_day_index integer := 0;
  v_exercise_index integer;
  v_exercise_count integer := 0;
  v_day_ids uuid[] := '{}';
  v_exercise_ids uuid[] := '{}';
  v_removed_exercise_ids uuid[];
  v_removed_day_ids uuid[];
  v_blocked text;
  v_missing text[] := '{}';
  v_current public.training_exercises%rowtype;
  v_typed public.training_exercises%rowtype;
  v_name text;
  v_catalog_id uuid;
  v_muscle_group text;
  v_resolved_id uuid;
  v_resolved_name text;
  v_resolved_group text;
  v_old_weekday integer;
  v_removed_sessions integer := 0;
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.coach_memberships m
    where m.coach_id = p_coach_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin', 'coach')
  ) then
    raise exception 'No tienes acceso de entrenador a este espacio.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id) then
    raise exception 'Cliente no encontrado en este espacio.' using errcode = '42501';
  end if;

  -- Misma clave que la creación y update_nexttrain_strength_program.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text || ':strength', 0));
  select * into v_program from public.training_programs tp
    where tp.id = p_program_id and tp.coach_id = p_coach_id and tp.client_id = p_client_id
    for update;
  if v_program.id is null then
    raise exception 'Programa no encontrado en este cliente.' using errcode = 'P0001';
  end if;
  if v_program.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then
    raise exception 'El programa cambió; vuelve a leer get_program_history.' using errcode = 'P0001';
  end if;

  -- Validación de la forma y de los identificadores antes de escribir.
  if jsonb_typeof(p_payload->'days') is distinct from 'array' or jsonb_array_length(p_payload->'days') not between 1 and 7 then
    raise exception 'Indica entre 1 y 7 días de entrenamiento.' using errcode = 'P0001';
  end if;
  for v_day in select value from jsonb_array_elements(p_payload->'days') loop
    if nullif(btrim(v_day->>'name'), '') is null then raise exception 'Cada día necesita un nombre.' using errcode = 'P0001'; end if;
    if (v_day->>'weekday')::integer is null or (v_day->>'weekday')::integer not between 1 and 7 then
      raise exception 'El día de la semana debe estar entre 1 y 7.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_day->'exercises') is distinct from 'array' or jsonb_array_length(v_day->'exercises') not between 1 and 30 then
      raise exception 'Cada día necesita entre 1 y 30 ejercicios.' using errcode = 'P0001';
    end if;
    if v_day ? 'id' and v_day->>'id' is not null then
      v_day_id := (v_day->>'id')::uuid;
      if v_day_id = any(v_day_ids) then raise exception 'Un día aparece repetido.' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.training_days d where d.id = v_day_id and d.program_id = p_program_id) then
        raise exception 'Hay un día que no pertenece a este programa.' using errcode = 'P0001';
      end if;
      v_day_ids := v_day_ids || v_day_id;
    end if;
    for v_exercise in select value from jsonb_array_elements(v_day->'exercises') loop
      if nullif(btrim(v_exercise->>'name'), '') is null and v_exercise->>'id' is null then
        raise exception 'Cada ejercicio nuevo necesita un nombre.' using errcode = 'P0001';
      end if;
      if v_exercise ? 'id' and v_exercise->>'id' is not null then
        v_exercise_id := (v_exercise->>'id')::uuid;
        if v_exercise_id = any(v_exercise_ids) then raise exception 'Un ejercicio aparece repetido.' using errcode = 'P0001'; end if;
        if not exists (select 1 from public.training_exercises e where e.id = v_exercise_id and e.program_id = p_program_id) then
          raise exception 'Hay un ejercicio que no pertenece a este programa.' using errcode = 'P0001';
        end if;
        v_exercise_ids := v_exercise_ids || v_exercise_id;
      end if;
    end loop;
  end loop;

  select coalesce(array_agg(e.id), '{}') into v_removed_exercise_ids from public.training_exercises e
    where e.program_id = p_program_id and not (e.id = any(v_exercise_ids));
  select coalesce(array_agg(d.id), '{}') into v_removed_day_ids from public.training_days d
    where d.program_id = p_program_id and not (d.id = any(v_day_ids));

  -- Nunca se pierden resultados del atleta.
  select string_agg(distinct e.exercise_name, ', ') into v_blocked from public.training_exercises e
    where e.id = any(v_removed_exercise_ids) and (
      exists (select 1 from public.training_exercise_logs l where l.exercise_id = e.id)
      or exists (select 1 from public.training_exercise_sets s where s.exercise_id = e.id and (
        s.completed is true or (s.is_override is true and (s.weight_kg is not null or s.reps is not null or s.rir is not null or nullif(btrim(s.notes), '') is not null)))));
  if v_blocked is not null then
    raise exception 'No se pueden quitar ejercicios con resultados registrados: %. Mantenlos con su id o crea un programa nuevo.', v_blocked using errcode = 'P0001';
  end if;
  select string_agg(distinct d.name, ', ') into v_blocked from public.training_days d
    where d.id = any(v_removed_day_ids) and (
      exists (select 1 from public.scheduled_strength_sessions s where s.day_id = d.id and s.is_completed is true)
      -- Los registros guardan también el día: un ejercicio movido seguiría apuntando aquí.
      or exists (select 1 from public.training_exercise_logs l where l.day_id = d.id));
  if v_blocked is not null then
    raise exception 'No se pueden quitar días con sesiones completadas o resultados registrados: %. Mantenlos con su id o crea un programa nuevo.', v_blocked using errcode = 'P0001';
  end if;

  for v_day in select value from jsonb_array_elements(p_payload->'days') loop
    v_day_index := v_day_index + 1;
    if v_day->>'id' is not null then
      v_day_id := (v_day->>'id')::uuid;
      select d.default_weekday into v_old_weekday from public.training_days d where d.id = v_day_id;
      -- Las sesiones programadas no completadas quedan en el día de la semana anterior: se borran
      -- y la plantilla las sustituye, como al regenerar el calendario en la app.
      if v_old_weekday is distinct from (v_day->>'weekday')::integer then
        delete from public.scheduled_strength_sessions s
          where s.day_id = v_day_id and s.program_id = p_program_id and s.is_completed is not true;
        get diagnostics v_count = row_count;
        v_removed_sessions := v_removed_sessions + v_count;
      end if;
      update public.training_days set name = btrim(v_day->>'name'), day_name = btrim(v_day->>'name'),
        order_index = v_day_index, day_order = v_day_index, default_weekday = (v_day->>'weekday')::integer
        where id = v_day_id;
    else
      insert into public.training_days (coach_id, program_id, name, day_name, order_index, day_order, default_weekday)
      values (p_coach_id, p_program_id, btrim(v_day->>'name'), btrim(v_day->>'name'), v_day_index, v_day_index, (v_day->>'weekday')::integer)
      returning id into v_day_id;
    end if;

    v_exercise_index := 0;
    for v_exercise in select value from jsonb_array_elements(v_day->'exercises') loop
      v_exercise_index := v_exercise_index + 1;
      v_current := null;
      if v_exercise->>'id' is not null then
        select * into v_current from public.training_exercises e where e.id = (v_exercise->>'id')::uuid;
      end if;
      -- jsonb_populate_record convierte cada valor al tipo real de la columna.
      select * into v_typed from jsonb_populate_record(null::public.training_exercises, jsonb_build_object(
        'sets', v_exercise->'sets', 'reps', v_exercise->'reps', 'rir', v_exercise->'rir',
        'rest_seconds', v_exercise->'rest_seconds', 'notes', v_exercise->'notes',
        'catalog_exercise_id', v_exercise->'catalog_exercise_id', 'muscle_group', v_exercise->'muscle_group'));

      v_name := coalesce(nullif(btrim(v_exercise->>'name'), ''), v_current.exercise_name);
      if v_current.id is not null and v_name = v_current.exercise_name
        and (v_typed.catalog_exercise_id is null or v_typed.catalog_exercise_id is not distinct from v_current.catalog_exercise_id) then
        -- Ejercicio sin cambios de identidad: se conserva tal cual, aunque sea anterior a la biblioteca.
        v_catalog_id := v_current.catalog_exercise_id;
        v_muscle_group := case when v_catalog_enabled then v_current.muscle_group
          else coalesce(v_typed.muscle_group, v_current.muscle_group, 'otros') end;
      elsif v_catalog_enabled then
        v_resolved_id := null;
        execute 'select c.id, c.name, public.catalog_group_muscle_group(c.primary_group) from public.resolve_catalog_exercise($1, $2) c where c.id is not null'
          into v_resolved_id, v_resolved_name, v_resolved_group using v_typed.catalog_exercise_id, v_name;
        if v_resolved_id is null then
          v_missing := v_missing || v_name;
          continue;
        end if;
        v_name := v_resolved_name;
        v_catalog_id := v_resolved_id;
        v_muscle_group := v_resolved_group;
      else
        -- Sin biblioteca no se puede comprobar un catalog_exercise_id nuevo: el nombre manda.
        v_catalog_id := null;
        v_muscle_group := coalesce(v_typed.muscle_group, v_current.muscle_group, 'otros');
      end if;

      if v_current.id is not null then
        -- Los campos omitidos se conservan; null los vacía.
        update public.training_exercises set
          day_id = v_day_id, order_index = v_exercise_index, exercise_name = v_name,
          catalog_exercise_id = v_catalog_id, muscle_group = v_muscle_group,
          sets = case when v_exercise ? 'sets' then v_typed.sets else sets end,
          reps = case when v_exercise ? 'reps' then v_typed.reps else reps end,
          rir = case when v_exercise ? 'rir' then v_typed.rir else rir end,
          rest_seconds = case when v_exercise ? 'rest_seconds' then v_typed.rest_seconds else rest_seconds end,
          notes = case when v_exercise ? 'notes' then v_typed.notes else notes end,
          superset_key = case when v_exercise ? 'superset' then nullif(btrim(v_exercise->>'superset'), '') else superset_key end
          where id = v_current.id;
        -- Las celdas de prescripción siguen al ejercicio si cambia de día.
        if v_current.day_id is distinct from v_day_id then
          update public.training_cells set day_id = v_day_id where exercise_id = v_current.id;
        end if;
      else
        insert into public.training_exercises (coach_id, program_id, day_id, order_index, exercise_name, catalog_exercise_id,
          muscle_group, sets, reps, rir, rest_seconds, notes, superset_key)
        values (p_coach_id, p_program_id, v_day_id, v_exercise_index, v_name, v_catalog_id,
          v_muscle_group, v_typed.sets, v_typed.reps, v_typed.rir, v_typed.rest_seconds, v_typed.notes,
          nullif(btrim(v_exercise->>'superset'), ''));
      end if;
      v_exercise_count := v_exercise_count + 1;
    end loop;
  end loop;

  if pg_catalog.array_length(v_missing, 1) > 0 then
    raise exception 'Estos ejercicios no están en la biblioteca: %. Usa list_exercise_catalog y envía el nombre exacto o catalog_exercise_id.',
      pg_catalog.array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;

  -- Quitar lo que ya no está: primero lo que cuelga de cada ejercicio, como deleteExerciseAction.
  delete from public.training_cells where exercise_id = any(v_removed_exercise_ids);
  delete from public.training_exercise_sets where exercise_id = any(v_removed_exercise_ids);
  delete from public.training_exercises where id = any(v_removed_exercise_ids);
  delete from public.scheduled_strength_sessions s
    where s.day_id = any(v_removed_day_ids) and s.program_id = p_program_id and s.is_completed is not true;
  get diagnostics v_count = row_count;
  v_removed_sessions := v_removed_sessions + v_count;
  delete from public.training_days where id = any(v_removed_day_ids);

  perform public.nexttrain_check_strength_supersets(p_program_id);

  update public.training_programs set updated_at = now() where id = p_program_id returning * into v_program;

  return pg_catalog.to_jsonb(v_program) || jsonb_build_object(
    'day_count', v_day_index, 'exercise_count', v_exercise_count,
    'removed_day_count', coalesce(pg_catalog.array_length(v_removed_day_ids, 1), 0),
    'removed_exercise_count', coalesce(pg_catalog.array_length(v_removed_exercise_ids, 1), 0),
    'removed_scheduled_sessions', v_removed_sessions,
    'catalog_enforced', v_catalog_enabled);
end;
$function$;

revoke all on function public.update_nexttrain_strength_program_days(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.update_nexttrain_strength_program_days(uuid, uuid, uuid, jsonb) to authenticated;
