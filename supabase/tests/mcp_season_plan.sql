-- Prueba de integración de create/update_nexttrain_season_plan con un cliente
-- temporal y el rol authenticated. Termina con ROLLBACK explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_monday date := (date_trunc('week', current_date) + interval '7 days')::date;
  v_season jsonb;
  v_second jsonb;
  v_result jsonb;
  v_payload jsonb;
  v_version timestamptz;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  insert into public.clients (id, coach_id, user_id, full_name, status)
    values (v_client, v_coach, v_user, 'MCP season rollback test', 'active');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  -- 1. Creación completa: base, progresión por semana, tipo, notas y fases.
  v_payload := jsonb_build_object(
    'name', 'Temporada test', 'start_date', v_monday, 'weeks', 12, 'primary_unit', 'time',
    'disciplines', jsonb_build_array('run', 'bike', 'strength'), 'status', 'active',
    'base_targets', jsonb_build_array(
      jsonb_build_object('discipline', 'run', 'value', 180),
      jsonb_build_object('discipline', 'strength', 'value', 2)),
    'week_changes', jsonb_build_array(
      jsonb_build_object('week_start', v_monday + 21, 'week_type', 'descarga', 'notes', 'Semana suave',
        'targets', jsonb_build_array(jsonb_build_object('discipline', 'run', 'value', 120),
                                     jsonb_build_object('discipline', 'bike', 'value', 90.4)))),
    'phases', jsonb_build_array(
      jsonb_build_object('name', 'Base', 'phase_type', 'base', 'start_date', v_monday, 'end_date', v_monday + 41),
      jsonb_build_object('name', 'Específico', 'phase_type', 'especifico', 'start_date', v_monday + 42, 'end_date', v_monday + 83)));
  v_season := public.create_nexttrain_season_plan(v_coach, v_client, v_payload);
  if (v_season->>'week_count')::integer <> 12 or (v_season->>'phase_count')::integer <> 2
    or (v_season->>'end_date')::date <> v_monday + 83 or (v_season->>'target_count')::integer <> 25 then
    raise exception 'La temporada no se creó completa: %', v_season;
  end if;
  v_assertions := v_assertions + 1;

  -- 2. Columnas según magnitud: carrera en minutos, fuerza en sesiones, redondeo como la app.
  if not exists (select 1 from public.season_week_targets t join public.season_weeks w on w.id = t.season_week_id
      where w.season_plan_id = (v_season->>'id')::uuid and w.week_start = v_monday + 21
        and t.discipline = 'bike' and t.target_minutes = 90 and t.target_km is null)
    or not exists (select 1 from public.season_week_targets t join public.season_weeks w on w.id = t.season_week_id
      where w.season_plan_id = (v_season->>'id')::uuid and w.week_start = v_monday
        and t.discipline = 'strength' and t.target_sessions = 2 and t.target_minutes is null)
    or not exists (select 1 from public.season_weeks where season_plan_id = (v_season->>'id')::uuid
        and week_start = v_monday + 21 and week_type = 'descarga' and notes = 'Semana suave') then
    raise exception 'Objetivos, tipo o notas guardados mal.';
  end if;
  v_assertions := v_assertions + 1;

  -- 3. Segunda temporada activa sin replace_active: error y nada creado.
  begin
    perform public.create_nexttrain_season_plan(v_coach, v_client, v_payload || '{"name":"Otra"}');
    raise exception 'Se aceptó una segunda temporada activa.';
  exception when others then
    if sqlerrm not like 'Este atleta ya tiene una temporada activa.%' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 4. Objetivo de una disciplina que no está en la temporada: error atómico.
  begin
    perform public.create_nexttrain_season_plan(v_coach, v_client, v_payload || jsonb_build_object('status', 'draft',
      'base_targets', jsonb_build_array(jsonb_build_object('discipline', 'swim', 'value', 60))));
    raise exception 'Se aceptó una disciplina ajena.';
  exception when others then
    if sqlerrm not like 'La disciplina swim no está en la temporada.%' then raise; end if;
  end;
  if (select count(*) from public.season_plans where client_id = v_client) <> 1 then
    raise exception 'Quedó una temporada a medias.';
  end if;
  v_assertions := v_assertions + 1;

  -- 5. Fases solapadas: error.
  begin
    perform public.create_nexttrain_season_plan(v_coach, v_client, v_payload || jsonb_build_object('status', 'draft',
      'phases', jsonb_build_array(
        jsonb_build_object('name', 'A', 'phase_type', 'base', 'start_date', v_monday, 'end_date', v_monday + 20),
        jsonb_build_object('name', 'B', 'phase_type', 'construccion', 'start_date', v_monday + 14, 'end_date', v_monday + 30))));
    raise exception 'Se aceptaron fases solapadas.';
  exception when others then
    if sqlerrm <> 'Las fases no pueden solaparse.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 6. Espacio ajeno.
  begin
    perform public.create_nexttrain_season_plan(gen_random_uuid(), v_client, v_payload);
    raise exception 'Se aceptó un espacio ajeno.';
  exception when insufficient_privilege then null;
  end;
  v_assertions := v_assertions + 1;

  -- 7. Versión antigua.
  begin
    perform public.update_nexttrain_season_plan(v_coach, v_client, (v_season->>'id')::uuid,
      jsonb_build_object('expected_updated_at', '2000-01-01T00:00:00Z', 'name', 'X'));
    raise exception 'Se aceptó una versión antigua.';
  exception when others then
    if sqlerrm <> 'La temporada cambió; vuelve a leer get_season_plan.' then raise; end if;
  end;
  v_assertions := v_assertions + 1;

  -- 8. Quitar una disciplina borra sus objetivos; editar semanas (vaciar objetivo y notas).
  select updated_at into v_version from public.season_plans where id = (v_season->>'id')::uuid;
  v_result := public.update_nexttrain_season_plan(v_coach, v_client, (v_season->>'id')::uuid, jsonb_build_object(
    'expected_updated_at', v_version, 'disciplines', jsonb_build_array('run', 'strength'),
    'week_changes', jsonb_build_array(jsonb_build_object('week_start', v_monday + 21, 'notes', null,
      'targets', jsonb_build_array(jsonb_build_object('discipline', 'run', 'value', null))))));
  if (v_result->>'removed_targets')::integer <> 1 or (v_result->>'target_count')::integer <> 23
    or exists (select 1 from public.season_weeks where season_plan_id = (v_season->>'id')::uuid and week_start = v_monday + 21 and notes is not null) then
    raise exception 'Edición de disciplinas o semanas incorrecta: %', v_result;
  end if;
  v_assertions := v_assertions + 1;

  -- 9. Alargar añade semanas; acortar con fases fuera exige enviar phases.
  v_result := public.update_nexttrain_season_plan(v_coach, v_client, (v_season->>'id')::uuid,
    jsonb_build_object('expected_updated_at', (v_result->>'updated_at'), 'weeks', 14));
  if (v_result->>'week_count')::integer <> 14 or (v_result->>'end_date')::date <> v_monday + 97 then
    raise exception 'No se alargó la temporada: %', v_result;
  end if;
  begin
    perform public.update_nexttrain_season_plan(v_coach, v_client, (v_season->>'id')::uuid,
      jsonb_build_object('expected_updated_at', (v_result->>'updated_at'), 'weeks', 8));
    raise exception 'Se acortó dejando fases fuera.';
  exception when others then
    if sqlerrm not like 'Hay fases que terminan después de la nueva fecha final.%' then raise; end if;
  end;
  v_result := public.update_nexttrain_season_plan(v_coach, v_client, (v_season->>'id')::uuid, jsonb_build_object(
    'expected_updated_at', (v_result->>'updated_at'), 'weeks', 8,
    'phases', jsonb_build_array(jsonb_build_object('name', 'Todo', 'phase_type', 'base', 'start_date', v_monday, 'end_date', v_monday + 55))));
  if (v_result->>'week_count')::integer <> 8 or (v_result->>'removed_weeks')::integer <> 6 or (v_result->>'phase_count')::integer <> 1 then
    raise exception 'No se acortó bien: %', v_result;
  end if;
  v_assertions := v_assertions + 1;

  -- 10. Nueva temporada activa con replace_active archiva la anterior.
  v_second := public.create_nexttrain_season_plan(v_coach, v_client, v_payload || jsonb_build_object(
    'name', 'Temporada 2', 'replace_active', true, 'phases', '[]'::jsonb));
  if (v_second->'archived_season_ids') <> jsonb_build_array(v_season->>'id')
    or (select status from public.season_plans where id = (v_season->>'id')::uuid) <> 'archived'
    or (select count(*) from public.season_plans where client_id = v_client and status = 'active') <> 1 then
    raise exception 'replace_active no archivó la temporada anterior.';
  end if;
  v_assertions := v_assertions + 1;

  execute 'reset role';
  if v_assertions <> 10 then raise exception 'No se han completado las 10 verificaciones.'; end if;
end;
$tests$;
rollback;
select 10 as assertions_completed_before_rollback,
  not exists(select 1 from public.clients where full_name = 'MCP season rollback test') as temporary_data_rolled_back;
