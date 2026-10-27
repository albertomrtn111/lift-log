-- Plan de temporada desde el MCP: crear y editar en una sola transacción.
--
-- Mismo modelo que la pestaña Temporada de la app (season-actions.ts), con
-- tres diferencias que la app aún no necesita:
--   * La creación es atómica: temporada, semanas, objetivos y fases o nada
--     (la app inserta por pasos y borra si falla).
--   * Admite objetivos distintos por semana (progresión), tipo y notas de cada
--     semana y fases, además del volumen base igual para todas.
--   * Editar exige expected_updated_at (control optimista): cualquier cambio en
--     semanas, objetivos o fases actualiza updated_at de la temporada.
--
-- Los objetivos llegan como un valor en la magnitud de la disciplina y la
-- función elige la columna, igual que targetColumns() en la app:
--   fuerza → target_sessions; resto → target_minutes (unidad time) o
--   target_km (unidad distance).
--
-- Seguridad: SECURITY INVOKER (se aplican las RLS de las tablas) y además se
-- comprueba la membresía de entrenador y que el cliente sea del espacio.

create or replace function public.nexttrain_season_target_columns(
  p_discipline text, p_unit text, p_value numeric
) returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object(
    'target_minutes', case when p_discipline <> 'strength' and p_unit = 'time' then round(p_value)::integer end,
    'target_km', case when p_discipline <> 'strength' and p_unit = 'distance' then round(p_value, 1) end,
    'target_sessions', case when p_discipline = 'strength' then round(p_value)::integer end
  );
$function$;

-- Comprueba que el usuario es entrenador activo del espacio y que el cliente es suyo.
create or replace function public.nexttrain_require_coach_client(p_coach_id uuid, p_client_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
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
end;
$function$;

-- Inserta o borra objetivos de una semana. targets: [{discipline, value}] con value null para borrar.
create or replace function public.nexttrain_season_apply_targets(
  p_season public.season_plans, p_week_id uuid, p_targets jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_target jsonb;
  v_discipline text;
  v_value numeric;
  v_columns jsonb;
  v_changed integer := 0;
begin
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' then return 0; end if;
  for v_target in select * from jsonb_array_elements(p_targets) loop
    v_discipline := v_target->>'discipline';
    if v_discipline is null or not (v_discipline = any (p_season.disciplines)) then
      raise exception 'La disciplina % no está en la temporada.', coalesce(v_discipline, '(vacía)') using errcode = 'P0001';
    end if;
    if v_target->'value' is null or jsonb_typeof(v_target->'value') = 'null' then
      delete from public.season_week_targets where season_week_id = p_week_id and discipline = v_discipline;
    else
      v_value := (v_target->>'value')::numeric;
      if v_value < 0 or v_value > 100000 then
        raise exception 'Objetivo fuera de rango para %.', v_discipline using errcode = 'P0001';
      end if;
      v_columns := public.nexttrain_season_target_columns(v_discipline, p_season.primary_unit, v_value);
      insert into public.season_week_targets (season_week_id, discipline, target_minutes, target_km, target_sessions)
      values (p_week_id, v_discipline,
        (v_columns->>'target_minutes')::integer, (v_columns->>'target_km')::numeric, (v_columns->>'target_sessions')::integer)
      on conflict (season_week_id, discipline) do update set
        target_minutes = excluded.target_minutes, target_km = excluded.target_km, target_sessions = excluded.target_sessions;
    end if;
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end;
$function$;

-- Sustituye todas las fases. phases: [{name, phase_type, start_date, end_date, focus}]
create or replace function public.nexttrain_season_replace_phases(p_season public.season_plans, p_phases jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phase jsonb;
  v_index integer := 0;
begin
  delete from public.season_phases where season_plan_id = p_season.id;
  if p_phases is null or jsonb_typeof(p_phases) <> 'array' then return 0; end if;
  for v_phase in select * from jsonb_array_elements(p_phases) loop
    v_index := v_index + 1;
    if nullif(btrim(v_phase->>'name'), '') is null then
      raise exception 'Cada fase necesita un nombre.' using errcode = 'P0001';
    end if;
    if v_phase->>'phase_type' not in ('base', 'construccion', 'especifico', 'taper', 'competicion', 'transicion') then
      raise exception 'Tipo de fase no válido: %.', v_phase->>'phase_type' using errcode = 'P0001';
    end if;
    if (v_phase->>'start_date')::date > (v_phase->>'end_date')::date
      or (v_phase->>'start_date')::date < p_season.start_date or (v_phase->>'end_date')::date > p_season.end_date then
      raise exception 'La fase «%» debe estar dentro de la temporada (% a %).',
        v_phase->>'name', p_season.start_date, p_season.end_date using errcode = 'P0001';
    end if;
    insert into public.season_phases (season_plan_id, name, phase_type, start_date, end_date, focus, sort_order)
    values (p_season.id, btrim(v_phase->>'name'), v_phase->>'phase_type', (v_phase->>'start_date')::date,
      (v_phase->>'end_date')::date, nullif(btrim(v_phase->>'focus'), ''), v_index);
  end loop;
  if exists (
    select 1 from public.season_phases a join public.season_phases b
      on a.season_plan_id = b.season_plan_id and a.id < b.id
      and a.start_date <= b.end_date and b.start_date <= a.end_date
    where a.season_plan_id = p_season.id
  ) then
    raise exception 'Las fases no pueden solaparse.' using errcode = 'P0001';
  end if;
  return v_index;
end;
$function$;

-- Cambios de semanas: [{week_start, week_type?, notes?, targets?}]. notes: clave presente con null la vacía.
create or replace function public.nexttrain_season_apply_week_changes(p_season public.season_plans, p_changes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_change jsonb;
  v_week public.season_weeks%rowtype;
  v_count integer := 0;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then return 0; end if;
  for v_change in select * from jsonb_array_elements(p_changes) loop
    select * into v_week from public.season_weeks
      where season_plan_id = p_season.id and week_start = (v_change->>'week_start')::date;
    if v_week.id is null then
      raise exception 'La semana del % no pertenece a la temporada.', v_change->>'week_start' using errcode = 'P0001';
    end if;
    if v_change ? 'week_type' and v_change->>'week_type' not in ('carga', 'descarga', 'test', 'competicion', 'transicion') then
      raise exception 'Tipo de semana no válido: %.', v_change->>'week_type' using errcode = 'P0001';
    end if;
    update public.season_weeks set
      week_type = case when v_change ? 'week_type' then v_change->>'week_type' else week_type end,
      notes = case when v_change ? 'notes' then nullif(btrim(v_change->>'notes'), '') else notes end
    where id = v_week.id;
    perform public.nexttrain_season_apply_targets(p_season, v_week.id, v_change->'targets');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.nexttrain_season_summary(p_season_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.to_jsonb(sp) || jsonb_build_object(
    'week_count', (select count(*) from public.season_weeks w where w.season_plan_id = sp.id),
    'target_count', (select count(*) from public.season_week_targets t join public.season_weeks w on w.id = t.season_week_id where w.season_plan_id = sp.id),
    'phase_count', (select count(*) from public.season_phases p where p.season_plan_id = sp.id))
  from public.season_plans sp where sp.id = p_season_id;
$function$;

create or replace function public.create_nexttrain_season_plan(p_coach_id uuid, p_client_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_season public.season_plans%rowtype;
  v_start date := (p_payload->>'start_date')::date;
  v_weeks integer := (p_payload->>'weeks')::integer;
  v_unit text := coalesce(p_payload->>'primary_unit', 'time');
  v_status text := coalesce(p_payload->>'status', 'active');
  v_disciplines text[];
  v_event uuid := nullif(p_payload->>'target_event_id', '')::uuid;
  v_archived uuid[] := '{}';
  v_week_start date;
  v_week_id uuid;
  v_base jsonb := coalesce(p_payload->'base_targets', '[]'::jsonb);
begin
  perform public.nexttrain_require_coach_client(p_coach_id, p_client_id);

  if nullif(btrim(p_payload->>'name'), '') is null then raise exception 'Ponle un nombre a la temporada.' using errcode = 'P0001'; end if;
  if v_start is null or extract(isodow from v_start) <> 1 then
    raise exception 'La temporada empieza siempre en lunes.' using errcode = 'P0001';
  end if;
  if v_weeks is null or v_weeks not between 1 and 60 then raise exception 'La temporada debe tener entre 1 y 60 semanas.' using errcode = 'P0001'; end if;
  if v_unit not in ('time', 'distance') then raise exception 'Unidad no válida: usa time o distance.' using errcode = 'P0001'; end if;
  if v_status not in ('active', 'draft') then raise exception 'Una temporada nueva se crea activa o en borrador.' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct value), '{}') into v_disciplines from jsonb_array_elements_text(p_payload->'disciplines');
  if cardinality(v_disciplines) = 0 or not (v_disciplines <@ array['run', 'bike', 'swim', 'strength', 'other']) then
    raise exception 'Elige disciplinas válidas: run, bike, swim, strength u other.' using errcode = 'P0001';
  end if;
  if v_event is not null and not exists (
    select 1 from public.client_events e where e.id = v_event and e.coach_id = p_coach_id and e.client_id = p_client_id
  ) then
    raise exception 'El evento objetivo no es de este cliente.' using errcode = 'P0001';
  end if;

  -- Una sola temporada activa por cliente; serializa creaciones simultáneas.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text || ':season', 0));
  if v_status = 'active' and exists (select 1 from public.season_plans where client_id = p_client_id and status = 'active') then
    if coalesce((p_payload->>'replace_active')::boolean, false) is not true then
      raise exception 'Este atleta ya tiene una temporada activa. Archívala o usa replace_active.' using errcode = 'P0001';
    end if;
    with archived as (
      update public.season_plans set status = 'archived'
      where coach_id = p_coach_id and client_id = p_client_id and status = 'active'
      returning id
    ) select coalesce(array_agg(id), '{}') into v_archived from archived;
  end if;

  insert into public.season_plans (coach_id, client_id, name, start_date, end_date, target_event_id, primary_unit, disciplines, status, notes)
  values (p_coach_id, p_client_id, btrim(p_payload->>'name'), v_start, v_start + v_weeks * 7 - 1, v_event, v_unit,
    v_disciplines, v_status, nullif(btrim(p_payload->>'notes'), ''))
  returning * into v_season;

  for i in 0 .. v_weeks - 1 loop
    v_week_start := v_start + i * 7;
    insert into public.season_weeks (season_plan_id, week_start) values (v_season.id, v_week_start) returning id into v_week_id;
    -- Volumen base para todas las semanas; los cambios por semana lo sustituyen después.
    perform public.nexttrain_season_apply_targets(v_season, v_week_id,
      (select coalesce(jsonb_agg(t), '[]'::jsonb) from jsonb_array_elements(v_base) t where t->'value' is not null and jsonb_typeof(t->'value') <> 'null'));
  end loop;

  perform public.nexttrain_season_apply_week_changes(v_season, p_payload->'week_changes');
  perform public.nexttrain_season_replace_phases(v_season, p_payload->'phases');

  return public.nexttrain_season_summary(v_season.id) || jsonb_build_object('archived_season_ids', v_archived);
end;
$function$;

create or replace function public.update_nexttrain_season_plan(p_coach_id uuid, p_client_id uuid, p_season_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_season public.season_plans%rowtype;
  v_status text;
  v_disciplines text[];
  v_weeks integer;
  v_current_weeks integer;
  v_end date;
  v_event uuid;
  v_archived uuid[] := '{}';
  v_removed_targets integer := 0;
  v_removed_weeks integer := 0;
  v_week_id uuid;
begin
  perform public.nexttrain_require_coach_client(p_coach_id, p_client_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text || ':season', 0));

  select * into v_season from public.season_plans
    where id = p_season_id and coach_id = p_coach_id and client_id = p_client_id
    for update;
  if v_season.id is null then raise exception 'Temporada no encontrada en este cliente.' using errcode = 'P0001'; end if;
  if v_season.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then
    raise exception 'La temporada cambió; vuelve a leer get_season_plan.' using errcode = 'P0001';
  end if;

  -- Estado (activar archiva la activa anterior solo con replace_active)
  v_status := coalesce(p_payload->>'status', v_season.status);
  if v_status not in ('active', 'draft', 'archived') then raise exception 'Estado no válido.' using errcode = 'P0001'; end if;
  if v_status = 'active' and v_season.status <> 'active'
    and exists (select 1 from public.season_plans where client_id = p_client_id and status = 'active' and id <> p_season_id) then
    if coalesce((p_payload->>'replace_active')::boolean, false) is not true then
      raise exception 'Este atleta ya tiene otra temporada activa. Usa replace_active para archivarla.' using errcode = 'P0001';
    end if;
    with archived as (
      update public.season_plans set status = 'archived'
      where coach_id = p_coach_id and client_id = p_client_id and status = 'active' and id <> p_season_id
      returning id
    ) select coalesce(array_agg(id), '{}') into v_archived from archived;
  end if;

  -- Evento objetivo: clave presente con null lo quita
  v_event := v_season.target_event_id;
  if p_payload ? 'target_event_id' then
    v_event := nullif(p_payload->>'target_event_id', '')::uuid;
    if v_event is not null and not exists (
      select 1 from public.client_events e where e.id = v_event and e.coach_id = p_coach_id and e.client_id = p_client_id
    ) then
      raise exception 'El evento objetivo no es de este cliente.' using errcode = 'P0001';
    end if;
  end if;

  -- Disciplinas: quitar una borra sus objetivos
  v_disciplines := v_season.disciplines;
  if p_payload ? 'disciplines' then
    select coalesce(array_agg(distinct value), '{}') into v_disciplines from jsonb_array_elements_text(p_payload->'disciplines');
    if cardinality(v_disciplines) = 0 or not (v_disciplines <@ array['run', 'bike', 'swim', 'strength', 'other']) then
      raise exception 'Elige disciplinas válidas: run, bike, swim, strength u other.' using errcode = 'P0001';
    end if;
    with removed as (
      delete from public.season_week_targets t using public.season_weeks w
      where w.id = t.season_week_id and w.season_plan_id = p_season_id and not (t.discipline = any (v_disciplines))
      returning t.id
    ) select count(*) into v_removed_targets from removed;
  end if;

  if p_payload ? 'name' and nullif(btrim(p_payload->>'name'), '') is null then
    raise exception 'Ponle un nombre a la temporada.' using errcode = 'P0001';
  end if;

  -- Duración: alargar añade semanas de carga al final; acortar borra las últimas con sus objetivos
  select count(*) into v_current_weeks from public.season_weeks where season_plan_id = p_season_id;
  v_weeks := coalesce((p_payload->>'weeks')::integer, v_current_weeks);
  if v_weeks not between 1 and 60 then raise exception 'La temporada debe tener entre 1 y 60 semanas.' using errcode = 'P0001'; end if;
  v_end := v_season.start_date + v_weeks * 7 - 1;
  if v_weeks < v_current_weeks then
    with removed as (
      delete from public.season_weeks where season_plan_id = p_season_id and week_start > v_end returning id
    ) select count(*) into v_removed_weeks from removed;
  end if;

  update public.season_plans set
    name = coalesce(nullif(btrim(p_payload->>'name'), ''), name),
    notes = case when p_payload ? 'notes' then nullif(btrim(p_payload->>'notes'), '') else notes end,
    target_event_id = v_event,
    disciplines = v_disciplines,
    status = v_status,
    end_date = v_end,
    updated_at = now()
  where id = p_season_id
  returning * into v_season;

  for i in v_current_weeks .. v_weeks - 1 loop
    insert into public.season_weeks (season_plan_id, week_start) values (p_season_id, v_season.start_date + i * 7)
    returning id into v_week_id;
  end loop;

  perform public.nexttrain_season_apply_week_changes(v_season, p_payload->'week_changes');
  if p_payload ? 'phases' then
    perform public.nexttrain_season_replace_phases(v_season, p_payload->'phases');
  elsif exists (select 1 from public.season_phases where season_plan_id = p_season_id and end_date > v_end) then
    raise exception 'Hay fases que terminan después de la nueva fecha final. Envía también phases.' using errcode = 'P0001';
  end if;

  return public.nexttrain_season_summary(p_season_id) || jsonb_build_object(
    'archived_season_ids', v_archived, 'removed_weeks', v_removed_weeks, 'removed_targets', v_removed_targets);
end;
$function$;

revoke all on function public.nexttrain_season_target_columns(text, text, numeric) from public, anon;
revoke all on function public.nexttrain_require_coach_client(uuid, uuid) from public, anon;
revoke all on function public.nexttrain_season_apply_targets(public.season_plans, uuid, jsonb) from public, anon;
revoke all on function public.nexttrain_season_replace_phases(public.season_plans, jsonb) from public, anon;
revoke all on function public.nexttrain_season_apply_week_changes(public.season_plans, jsonb) from public, anon;
revoke all on function public.nexttrain_season_summary(uuid) from public, anon;
revoke all on function public.create_nexttrain_season_plan(uuid, uuid, jsonb) from public, anon;
revoke all on function public.update_nexttrain_season_plan(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.nexttrain_season_target_columns(text, text, numeric) to authenticated;
grant execute on function public.nexttrain_require_coach_client(uuid, uuid) to authenticated;
grant execute on function public.nexttrain_season_apply_targets(public.season_plans, uuid, jsonb) to authenticated;
grant execute on function public.nexttrain_season_replace_phases(public.season_plans, jsonb) to authenticated;
grant execute on function public.nexttrain_season_apply_week_changes(public.season_plans, jsonb) to authenticated;
grant execute on function public.nexttrain_season_summary(uuid) to authenticated;
grant execute on function public.create_nexttrain_season_plan(uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_nexttrain_season_plan(uuid, uuid, uuid, jsonb) to authenticated;
