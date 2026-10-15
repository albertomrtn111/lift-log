-- Programa, días, ejercicios y columnas por defecto se crean en una sola
-- transacción con el usuario OAuth y las RLS existentes. Un error revierte todo:
-- no quedan días ni ejercicios huérfanos. Activar archiva antes el programa
-- activo anterior, como la app (unique_active_program_per_client).
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
      -- jsonb_populate_record convierte cada valor al tipo real de la columna.
      insert into public.training_exercises (coach_id, program_id, day_id, order_index, exercise_name,
        sets, reps, rir, rest_seconds, notes, muscle_group)
      select p_coach_id, v_program.id, v_day_id, v_exercise_index, r.exercise_name,
        r.sets, r.reps, r.rir, r.rest_seconds, r.notes, r.muscle_group
      from jsonb_populate_record(null::public.training_exercises, jsonb_build_object(
        'exercise_name', v_exercise->>'name', 'sets', v_exercise->'sets', 'reps', v_exercise->'reps',
        'rir', v_exercise->'rir', 'rest_seconds', v_exercise->'rest_seconds', 'notes', v_exercise->'notes',
        'muscle_group', coalesce(v_exercise->>'muscle_group', 'otros'))) r;
      v_exercise_count := v_exercise_count + 1;
    end loop;
  end loop;

  return pg_catalog.to_jsonb(v_program) || jsonb_build_object('day_count', v_day_index, 'exercise_count', v_exercise_count,
    'archived_program_ids', v_archived_ids);
end;
$function$;

revoke all on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_nexttrain_strength_program(uuid, uuid, jsonb) to authenticated;

-- Último check-in enviado de cada cliente, sin depender de un límite global
-- que deje fuera a clientes con check-ins antiguos.
create or replace function public.nexttrain_latest_checkins(p_coach_id uuid, p_client_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(jsonb_agg(latest), '[]'::jsonb)
  from (
    select distinct on (c.client_id)
      c.client_id, c.submitted_at, c.weight_avg_kg, c.training_adherence_pct, c.nutrition_adherence_pct,
      c.sleep_avg_h, c.energy, c.stress, c.injuries
    from public.checkins c
    where c.coach_id = p_coach_id and c.client_id = any(p_client_ids) and c.submitted_at is not null
    order by c.client_id, c.submitted_at desc
  ) latest
$function$;

revoke all on function public.nexttrain_latest_checkins(uuid, uuid[]) from public, anon;
grant execute on function public.nexttrain_latest_checkins(uuid, uuid[]) to authenticated;

-- Cubre nexttrain_latest_checkins y las consultas por cliente ordenadas por fecha.
create index if not exists idx_checkins_coach_client_submitted_at
  on public.checkins (coach_id, client_id, submitted_at desc)
  where submitted_at is not null;
