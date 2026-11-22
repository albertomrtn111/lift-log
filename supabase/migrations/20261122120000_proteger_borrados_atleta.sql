-- NXT-149. Borrar ya no se lleva lo que registró el atleta.
--
-- Antes, con la sesión del coach se podía borrar cualquier cosa con registros del
-- atleta y la cascada se lo llevaba todo para siempre: un programa archivado con
-- sus series, una revisión con respuestas y fotos, una sesión de cardio hecha o
-- una métrica personalizada con su historial.
--
-- 1. Programas: training_programs.hidden_at. Un programa archivado con series del
--    atleta ya no se borra: se oculta del historial y se puede recuperar.
-- 2. Métricas: metric_definitions.archived_at. Una métrica con valores en las
--    revisiones se archiva (y se desactiva) en vez de borrarse.
-- 3. Papelera (deleted_records): las revisiones y sesiones de cardio con datos del
--    atleta se guardan enteras antes de borrarlas y se pueden recuperar con
--    nexttrain_restore_deleted_record. La web lo hace con
--    nexttrain_trash_checkin y nexttrain_trash_cardio_session, en una sola
--    transacción.
-- 4. Recuentos para los avisos (cuántas series, semanas, fotos, valores...).
-- 5. Protección en la base: con la sesión de un usuario (authenticated o anon), un
--    borrado directo de algo con registros del atleta falla con un mensaje claro:
--    - training_programs: si tiene series, registros o sesiones completadas.
--    - training_days, training_exercises, training_columns, training_exercise_sets:
--      si el programa está archivado y lo que se quita tiene series del atleta
--      (el atleta puede seguir quitando sus propias series). En programas activos
--      o en borrador manda el aviso de NXT-124 en la web.
--    - checkins: si tiene respuestas, medidas, fotos, peso o revisión del coach.
--    - cardio_sessions: si el atleta ya la ha hecho o registrado algo.
--    - metric_definitions: si tiene valores en alguna revisión.
--    Las cascadas (las ejecuta el dueño de la tabla), las funciones SECURITY
--    DEFINER (borrar el cliente de ejemplo, la papelera) y el servidor
--    (service_role) no cambian, como en guard_athlete_own_columns (NXT-143).
--
-- Compatible con la web desplegada (main e383d29): no cambia ninguna lectura ni
-- escritura que haga hoy; lo único que deja de funcionar es borrar algo con
-- registros del atleta, que da un error en vez de borrarlo. Idempotente.

-- 1 y 2. Columnas nuevas ----------------------------------------------------------

alter table public.training_programs add column if not exists hidden_at timestamptz;
comment on column public.training_programs.hidden_at is
  'NXT-149: oculto del historial del coach en vez de borrado porque tiene series del atleta. Null = visible.';

alter table public.metric_definitions add column if not exists archived_at timestamptz;
comment on column public.metric_definitions.archived_at is
  'NXT-149: archivada en vez de borrada porque tiene valores en revisiones. Se guarda con is_active = false.';

-- 3. Papelera ---------------------------------------------------------------------

create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  record_type text not null check (record_type in ('checkin', 'cardio_session')),
  record_id uuid not null,
  payload jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid
);
comment on table public.deleted_records is
  'NXT-149: copia completa de lo borrado con datos del atleta (revisiones, cardio). Se recupera con nexttrain_restore_deleted_record.';

create index if not exists deleted_records_client_idx on public.deleted_records (client_id, record_type, deleted_at desc);
create index if not exists deleted_records_record_idx on public.deleted_records (record_id);

alter table public.deleted_records enable row level security;
revoke all on public.deleted_records from anon;
revoke insert, update, delete, truncate on public.deleted_records from authenticated;
grant select on public.deleted_records to authenticated;
grant all on public.deleted_records to service_role;

drop policy if exists deleted_records_team_select on public.deleted_records;
create policy deleted_records_team_select on public.deleted_records
  for select to authenticated
  using (client_id in (select public.training_client_ids()));

-- 4. Recuentos ----------------------------------------------------------------------
-- Devuelven null si quien pregunta no tiene acceso a ese atleta.

-- Series del atleta en un programa, un día o un ejercicio (mismo criterio que
-- NXT-124: completada o con peso, reps, RIR o nota), registros antiguos y sesiones
-- completadas.
create or replace function public.nexttrain_strength_records(
  p_program_id uuid,
  p_day_id uuid default null,
  p_exercise_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sets integer;
  v_log_sets integer;
  v_logs integer;
  v_weeks integer;
  v_sessions integer;
begin
  if not exists (
    select 1 from public.training_programs p
    where p.id = p_program_id and p.client_id in (select public.training_client_ids())
  ) then
    return null;
  end if;

  with logged as (
    select s.week_index
    from public.training_exercise_sets s
    join public.training_exercises e on e.id = s.exercise_id
    where e.program_id = p_program_id
      and (p_day_id is null or e.day_id = p_day_id)
      and (p_exercise_id is null or e.id = p_exercise_id)
      and (s.completed is true or s.weight_kg is not null or s.reps is not null or s.rir is not null
           or pg_catalog.btrim(coalesce(s.notes, '')) <> '')
  ), logs as (
    select l.week_index,
           case when pg_catalog.jsonb_typeof(l.sets) = 'array' and pg_catalog.jsonb_array_length(l.sets) > 0
                then pg_catalog.jsonb_array_length(l.sets) else 1 end as n
    from public.training_exercise_logs l
    where l.program_id = p_program_id
      and (p_day_id is null or l.day_id = p_day_id)
      and (p_exercise_id is null or l.exercise_id = p_exercise_id)
  )
  select (select count(*) from logged),
         (select coalesce(sum(n), 0) from logs),
         (select count(*) from logs),
         (select count(distinct w) from (select week_index as w from logged union all select week_index from logs) x where w is not null)
    into v_sets, v_log_sets, v_logs, v_weeks;

  select count(*) into v_sessions
  from public.scheduled_strength_sessions ss
  where ss.program_id = p_program_id
    and ss.is_completed is true
    and p_exercise_id is null
    and (p_day_id is null or ss.day_id = p_day_id);

  return pg_catalog.jsonb_build_object(
    'sets', v_sets + v_log_sets,
    'weeks', v_weeks,
    'completed_sessions', v_sessions,
    'logs', v_logs,
    'has_records', (v_sets + v_logs + v_sessions) > 0
  );
end;
$$;

-- Lo que tiene una revisión: respuestas, medidas (métricas), fotos, peso y la
-- revisión del coach.
create or replace function public.nexttrain_checkin_records(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checkin public.checkins%rowtype;
  v_payload jsonb;
  v_answers integer;
  v_measures integer;
  v_columns integer;
  v_photos integer;
  v_weight boolean;
  v_review boolean;
begin
  select * into v_checkin from public.checkins c
  where c.id = p_checkin_id and c.client_id in (select public.training_client_ids());
  if not found then
    return null;
  end if;

  v_payload := case when pg_catalog.jsonb_typeof(v_checkin.raw_payload) = 'object' then v_checkin.raw_payload else '{}'::jsonb end;

  select count(*) filter (where pg_catalog.left(e.key, 7) <> 'metric_'),
         count(*) filter (where pg_catalog.left(e.key, 7) = 'metric_')
    into v_answers, v_measures
  from pg_catalog.jsonb_each(v_payload) e
  where pg_catalog.jsonb_typeof(e.value) <> 'null'
    and e.value not in ('""'::jsonb, '[]'::jsonb, '{}'::jsonb);

  v_columns := (v_checkin.steps_avg is not null)::integer
    + (v_checkin.training_adherence_pct is not null)::integer
    + (v_checkin.nutrition_adherence_pct is not null)::integer
    + (v_checkin.sleep_avg_h is not null)::integer
    + (v_checkin.energy is not null)::integer
    + (v_checkin.hunger is not null)::integer
    + (v_checkin.stress is not null)::integer
    + (v_checkin.performance is not null)::integer
    + (pg_catalog.btrim(coalesce(v_checkin.injuries, '')) <> '')::integer
    + (pg_catalog.btrim(coalesce(v_checkin.notes, '')) <> '')::integer;

  select count(*) into v_photos from public.checkin_media m where m.checkin_id = v_checkin.id;
  v_weight := v_checkin.weight_kg is not null or v_checkin.weight_avg_kg is not null;
  v_review := exists (select 1 from public.reviews r where r.checkin_id = v_checkin.id)
    or pg_catalog.btrim(coalesce(v_checkin.coach_feedback, '')) <> '';

  return pg_catalog.jsonb_build_object(
    'submitted', v_checkin.submitted_at is not null,
    'answers', v_answers + v_columns,
    'measures', v_measures,
    'photos', v_photos,
    'weight', v_weight,
    'review', v_review,
    'has_records', v_checkin.submitted_at is not null or v_answers + v_columns + v_measures + v_photos > 0 or v_weight or v_review
  );
end;
$$;

-- Valores de una métrica en las revisiones de todos los atletas del espacio.
create or replace function public.nexttrain_metric_usage(p_metric_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('values', count(c.id), 'athletes', count(distinct c.client_id))
  from public.metric_definitions m
  left join public.checkins c
    on c.coach_id = m.coach_id
   and pg_catalog.jsonb_typeof(c.raw_payload) = 'object'
   and pg_catalog.jsonb_typeof(c.raw_payload -> ('metric_' || m.id::text)) is not null
   and pg_catalog.jsonb_typeof(c.raw_payload -> ('metric_' || m.id::text)) <> 'null'
   and (c.raw_payload -> ('metric_' || m.id::text)) <> '""'::jsonb
  where m.id = p_metric_id and public.is_coach_member(m.coach_id)
  group by m.id;
$$;

revoke all on function public.nexttrain_strength_records(uuid, uuid, uuid) from public, anon;
revoke all on function public.nexttrain_checkin_records(uuid) from public, anon;
revoke all on function public.nexttrain_metric_usage(uuid) from public, anon;
grant execute on function public.nexttrain_strength_records(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.nexttrain_checkin_records(uuid) to authenticated, service_role;
grant execute on function public.nexttrain_metric_usage(uuid) to authenticated, service_role;

-- 3 (cont.). Papelera: borrar con copia y recuperar -----------------------------------

create or replace function public.nexttrain_trash_checkin(p_checkin_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkin public.checkins%rowtype;
  v_trash uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para borrar.' using errcode = '42501';
  end if;

  select * into v_checkin from public.checkins c
  where c.id = p_checkin_id and c.client_id in (select public.training_client_ids())
  for update;
  if not found then
    raise exception 'No se ha encontrado la revisión.' using errcode = 'P0002';
  end if;

  insert into public.deleted_records (coach_id, client_id, record_type, record_id, payload, summary, deleted_by)
  values (
    v_checkin.coach_id, v_checkin.client_id, 'checkin', v_checkin.id,
    pg_catalog.jsonb_build_object(
      'checkin', pg_catalog.to_jsonb(v_checkin),
      'reviews', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) from public.reviews r where r.checkin_id = v_checkin.id), '[]'::jsonb),
      'media', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m)) from public.checkin_media m where m.checkin_id = v_checkin.id), '[]'::jsonb)
    ),
    coalesce(public.nexttrain_checkin_records(v_checkin.id), '{}'::jsonb),
    auth.uid()
  )
  returning id into v_trash;

  delete from public.checkins where id = v_checkin.id;
  return v_trash;
end;
$$;

create or replace function public.nexttrain_trash_cardio_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cardio_sessions%rowtype;
  v_trash uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para borrar.' using errcode = '42501';
  end if;

  select * into v_session from public.cardio_sessions s
  where s.id = p_session_id and s.client_id in (select public.training_client_ids())
  for update;
  if not found then
    raise exception 'No se ha encontrado la sesión.' using errcode = 'P0002';
  end if;

  insert into public.deleted_records (coach_id, client_id, record_type, record_id, payload, summary, deleted_by)
  values (
    v_session.coach_id, v_session.client_id, 'cardio_session', v_session.id,
    pg_catalog.jsonb_build_object(
      'session', pg_catalog.to_jsonb(v_session),
      -- Las actividades de Strava se quedan (la cascada solo quita el enlace); se
      -- guarda el enlace para volver a ponerlo al recuperar.
      'strava_links', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', sa.id, 'cardio_session_id', sa.cardio_session_id, 'matched_planned_session_id', sa.matched_planned_session_id))
        from public.strava_activities sa
        where sa.cardio_session_id = v_session.id or sa.matched_planned_session_id = v_session.id
      ), '[]'::jsonb)
    ),
    pg_catalog.jsonb_build_object(
      'completed', coalesce(v_session.is_completed, false),
      'distance_km', v_session.actual_distance_km,
      'duration_min', v_session.actual_duration_min,
      'rpe', v_session.rpe,
      'feedback', pg_catalog.btrim(coalesce(v_session.feedback_notes, '')) <> '',
      'strava', v_session.strava_activity_id is not null
    ),
    auth.uid()
  )
  returning id into v_trash;

  delete from public.cardio_sessions where id = v_session.id;
  return v_trash;
end;
$$;

create or replace function public.nexttrain_restore_deleted_record(p_trash_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.deleted_records%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para recuperar.' using errcode = '42501';
  end if;

  select * into v_row from public.deleted_records d
  where d.id = p_trash_id and d.client_id in (select public.training_client_ids())
  for update;
  if not found then
    raise exception 'No se ha encontrado lo borrado.' using errcode = 'P0002';
  end if;
  if v_row.restored_at is not null then
    raise exception 'Ya se había recuperado.' using errcode = 'P0001';
  end if;

  if v_row.record_type = 'checkin' then
    if exists (select 1 from public.checkins where id = v_row.record_id) then
      raise exception 'Esa revisión ya está en la ficha del atleta.' using errcode = 'P0001';
    end if;
    insert into public.checkins
      select * from pg_catalog.jsonb_populate_record(null::public.checkins, v_row.payload -> 'checkin');
    insert into public.reviews
      select * from pg_catalog.jsonb_populate_recordset(null::public.reviews, coalesce(v_row.payload -> 'reviews', '[]'::jsonb));
    insert into public.checkin_media
      select * from pg_catalog.jsonb_populate_recordset(null::public.checkin_media, coalesce(v_row.payload -> 'media', '[]'::jsonb));
  elsif v_row.record_type = 'cardio_session' then
    if exists (select 1 from public.cardio_sessions where id = v_row.record_id) then
      raise exception 'Esa sesión ya está en el calendario.' using errcode = 'P0001';
    end if;
    insert into public.cardio_sessions
      select * from pg_catalog.jsonb_populate_record(null::public.cardio_sessions, v_row.payload -> 'session');
    update public.strava_activities sa set cardio_session_id = v_row.record_id
    where sa.cardio_session_id is null
      and sa.client_id = v_row.client_id
      and sa.id in (
        select (x ->> 'id')::uuid from pg_catalog.jsonb_array_elements(coalesce(v_row.payload -> 'strava_links', '[]'::jsonb)) x
        where x ->> 'cardio_session_id' = v_row.record_id::text);
    update public.strava_activities sa set matched_planned_session_id = v_row.record_id
    where sa.matched_planned_session_id is null
      and sa.client_id = v_row.client_id
      and sa.id in (
        select (x ->> 'id')::uuid from pg_catalog.jsonb_array_elements(coalesce(v_row.payload -> 'strava_links', '[]'::jsonb)) x
        where x ->> 'matched_planned_session_id' = v_row.record_id::text);
  else
    raise exception 'No se puede recuperar este tipo de dato.' using errcode = 'P0001';
  end if;

  update public.deleted_records set restored_at = now(), restored_by = auth.uid() where id = v_row.id;
  return pg_catalog.jsonb_build_object('record_type', v_row.record_type, 'record_id', v_row.record_id, 'client_id', v_row.client_id);
end;
$$;

revoke all on function public.nexttrain_trash_checkin(uuid) from public, anon;
revoke all on function public.nexttrain_trash_cardio_session(uuid) from public, anon;
revoke all on function public.nexttrain_restore_deleted_record(uuid) from public, anon;
grant execute on function public.nexttrain_trash_checkin(uuid) to authenticated, service_role;
grant execute on function public.nexttrain_trash_cardio_session(uuid) to authenticated, service_role;
grant execute on function public.nexttrain_restore_deleted_record(uuid) to authenticated, service_role;

-- 5. Protección en la base -----------------------------------------------------------
-- Funciones de trigger SECURITY INVOKER: current_user es el rol de quien borra. En
-- una cascada es el dueño de la tabla y en una función SECURITY DEFINER, su dueño.

create or replace function public.nexttrain_guard_program_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if coalesce((public.nexttrain_strength_records(old.id) ->> 'has_records')::boolean, true) then
    raise exception 'Este programa tiene series registradas por el atleta y no se puede borrar. Ocúltalo desde el historial de programas: se podrá recuperar.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

-- Días, ejercicios, columnas y series de un programa archivado.
create or replace function public.nexttrain_guard_archived_strength_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_status text;
  v_has boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;

  if tg_table_name = 'training_exercise_sets' then
    -- Solo si la serie tiene algo registrado; el atleta puede quitar las suyas.
    if not (old.completed is true or old.weight_kg is not null or old.reps is not null or old.rir is not null
            or pg_catalog.btrim(coalesce(old.notes, '')) <> '') then
      return old;
    end if;
    select e.program_id into v_program_id from public.training_exercises e where e.id = old.exercise_id;
    if exists (
      select 1 from public.training_programs p join public.clients c on c.id = p.client_id
      where p.id = v_program_id and auth.uid() is not null and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
    ) then
      return old;
    end if;
  else
    v_program_id := old.program_id;
  end if;

  select p.status into v_status from public.training_programs p where p.id = v_program_id;
  if v_status is distinct from 'archived' then
    return old;
  end if;

  if tg_table_name = 'training_days' then
    v_has := coalesce((public.nexttrain_strength_records(v_program_id, old.id, null) ->> 'has_records')::boolean, true);
  elsif tg_table_name = 'training_exercises' then
    v_has := coalesce((public.nexttrain_strength_records(v_program_id, null, old.id) ->> 'has_records')::boolean, true);
  elsif tg_table_name = 'training_exercise_sets' then
    v_has := true;
  else
    v_has := coalesce((public.nexttrain_strength_records(v_program_id) ->> 'has_records')::boolean, true);
  end if;

  if v_has then
    raise exception 'Este programa está archivado y tiene series registradas por el atleta: no se pueden quitar. Duplica el programa si quieres cambiarlo.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create or replace function public.nexttrain_guard_checkin_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if coalesce((public.nexttrain_checkin_records(old.id) ->> 'has_records')::boolean, true) then
    raise exception 'Esta revisión tiene respuestas, fotos o tu revisión. Elimínala desde la ficha del atleta: quedará en la papelera y se podrá recuperar.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create or replace function public.nexttrain_guard_cardio_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if coalesce(old.is_completed, false)
     or old.performed_date is not null
     or old.actual_distance_km is not null
     or old.actual_duration_min is not null
     or pg_catalog.btrim(coalesce(old.actual_avg_pace, '')) <> ''
     or old.avg_heart_rate is not null
     or old.max_heart_rate is not null
     or old.rpe is not null
     or pg_catalog.btrim(coalesce(old.feedback_notes, '')) <> ''
     or old.strava_activity_id is not null then
    raise exception 'Esta sesión ya tiene datos del atleta. Elimínala desde el calendario: quedará en la papelera y se podrá recuperar.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create or replace function public.nexttrain_guard_metric_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if coalesce((public.nexttrain_metric_usage(old.id) ->> 'values')::integer, 1) > 0 then
    raise exception 'Esta métrica tiene valores en revisiones de atletas y no se puede borrar. Desactívala o archívala para dejar de pedirla.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_training_programs_guard_delete on public.training_programs;
create trigger trg_training_programs_guard_delete
  before delete on public.training_programs
  for each row execute function public.nexttrain_guard_program_delete();

drop trigger if exists trg_training_days_guard_delete on public.training_days;
create trigger trg_training_days_guard_delete
  before delete on public.training_days
  for each row execute function public.nexttrain_guard_archived_strength_delete();

drop trigger if exists trg_training_exercises_guard_delete on public.training_exercises;
create trigger trg_training_exercises_guard_delete
  before delete on public.training_exercises
  for each row execute function public.nexttrain_guard_archived_strength_delete();

drop trigger if exists trg_training_columns_guard_delete on public.training_columns;
create trigger trg_training_columns_guard_delete
  before delete on public.training_columns
  for each row execute function public.nexttrain_guard_archived_strength_delete();

drop trigger if exists trg_training_exercise_sets_guard_delete on public.training_exercise_sets;
create trigger trg_training_exercise_sets_guard_delete
  before delete on public.training_exercise_sets
  for each row execute function public.nexttrain_guard_archived_strength_delete();

drop trigger if exists trg_checkins_guard_delete on public.checkins;
create trigger trg_checkins_guard_delete
  before delete on public.checkins
  for each row execute function public.nexttrain_guard_checkin_delete();

drop trigger if exists trg_cardio_sessions_guard_delete on public.cardio_sessions;
create trigger trg_cardio_sessions_guard_delete
  before delete on public.cardio_sessions
  for each row execute function public.nexttrain_guard_cardio_delete();

drop trigger if exists trg_metric_definitions_guard_delete on public.metric_definitions;
create trigger trg_metric_definitions_guard_delete
  before delete on public.metric_definitions
  for each row execute function public.nexttrain_guard_metric_delete();
