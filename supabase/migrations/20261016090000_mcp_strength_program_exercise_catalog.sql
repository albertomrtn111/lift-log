-- create_nexttrain_strength_program solo admite ejercicios de la biblioteca
-- (exercise_catalog). Cada ejercicio se resuelve por catalog_exercise_id, por
-- nombre exacto o por alias histórico (exercise_catalog_aliases) y se guarda con
-- el nombre, el enlace y el grupo muscular del catálogo. Si alguno no existe,
-- no se crea nada y el error lista los nombres pendientes.

-- Misma normalización que las claves de exercise_catalog_aliases.
create or replace function public.exercise_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.translate(pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(p_name, '\s+', ' ', 'g'))),
    'áéíóúüñàèìòù', 'aeiouunaeiou')
$function$;

-- Mismo mapeo que catalogGroupToMuscleGroup() en src/lib/training/exercise-catalog.ts.
create or replace function public.catalog_group_muscle_group(p_group text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case p_group
    when 'Abdomen' then 'abdomen' when 'Aductores' then 'aductores' when 'Bíceps' then 'bíceps'
    when 'Cuádriceps' then 'cuádriceps' when 'Espalda' then 'espalda' when 'Gemelos' then 'gemelos'
    when 'Glúteos' then 'glúteo' when 'Hombros' then 'hombro' when 'Isquiotibiales' then 'femorales'
    when 'Pecho' then 'pecho' when 'Tríceps' then 'tríceps' else 'otros' end
$function$;

-- Ejercicio activo del catálogo: por id si se indica; si no, por nombre exacto y después por alias.
create or replace function public.resolve_catalog_exercise(p_catalog_exercise_id uuid, p_name text)
returns public.exercise_catalog
language sql
stable
security invoker
set search_path = ''
as $function$
  select c.*
  from public.exercise_catalog c
  where c.is_active and (
    (p_catalog_exercise_id is not null and c.id = p_catalog_exercise_id)
    or (p_catalog_exercise_id is null and (
      public.exercise_name_key(c.name) = public.exercise_name_key(p_name)
      or c.id = (select a.catalog_exercise_id from public.exercise_catalog_aliases a
                 where a.alias_key = public.exercise_name_key(p_name))
    ))
  )
  -- El nombre exacto gana al alias.
  order by (public.exercise_name_key(c.name) = public.exercise_name_key(p_name)) desc
  limit 1
$function$;

revoke all on function public.resolve_catalog_exercise(uuid, text) from public, anon;
grant execute on function public.resolve_catalog_exercise(uuid, text) to authenticated;

create or replace function public.create_nexttrain_strength_program(
  p_coach_id uuid, p_client_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
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
      and m.status = 'active' and m.role in ('owner', 'coach')
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
  if v_status = 'active' and v_from > current_date then
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
        sets, reps, rir, rest_seconds, notes, muscle_group)
      select p_coach_id, v_program.id, v_day_id, v_exercise_index, v_catalog.name, v_catalog.id,
        r.sets, r.reps, r.rir, r.rest_seconds, r.notes, public.catalog_group_muscle_group(v_catalog.primary_group)
      from jsonb_populate_record(null::public.training_exercises, jsonb_build_object(
        'sets', v_exercise->'sets', 'reps', v_exercise->'reps', 'rir', v_exercise->'rir',
        'rest_seconds', v_exercise->'rest_seconds', 'notes', v_exercise->'notes')) r;
      v_exercise_count := v_exercise_count + 1;
    end loop;
  end loop;

  return pg_catalog.to_jsonb(v_program) || jsonb_build_object('day_count', v_day_index, 'exercise_count', v_exercise_count,
    'archived_program_ids', v_archived_ids);
end;
$function$;

revoke all on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) to authenticated;
