-- Borradores de revisión y edición de cabecera y estado de programas de fuerza
-- desde el MCP. No se aplica automáticamente: revisar y aplicar a mano.

-- ---------------------------------------------------------------------------
-- 1. Borrador de revisión de un check-in
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: la política reviews_rw_member (is_coach_member) permite a los
-- miembros activos owner/coach leer y escribir las revisiones de su espacio. Además
-- se comprueba de forma explícita la membresía, el cliente y el check-in, y solo se
-- tocan summary y message_to_client de una revisión en borrador. Aprobar o enviar
-- al cliente sigue siendo exclusivo de la app.
create or replace function public.save_nexttrain_review_draft(
  p_coach_id uuid, p_client_id uuid, p_checkin_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_review public.reviews%rowtype;
  v_has_summary boolean := p_payload ? 'summary';
  v_has_message boolean := p_payload ? 'message_to_client';
  v_summary text := nullif(btrim(p_payload->>'summary'), '');
  v_message text := nullif(btrim(p_payload->>'message_to_client'), '');
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
  if not exists (
    select 1 from public.checkins ch
    where ch.id = p_checkin_id and ch.coach_id = p_coach_id and ch.client_id = p_client_id and ch.submitted_at is not null
  ) then
    raise exception 'Check-in enviado no encontrado en este cliente.' using errcode = 'P0001';
  end if;
  if not v_has_summary and not v_has_message then
    raise exception 'Indica summary o message_to_client.' using errcode = 'P0001';
  end if;
  if pg_catalog.length(coalesce(v_summary, '')) > 10000 or pg_catalog.length(coalesce(v_message, '')) > 10000 then
    raise exception 'El texto de la revisión es demasiado largo.' using errcode = 'P0001';
  end if;

  -- Serializa guardados simultáneos de la misma revisión.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_checkin_id::text || ':review', 0));
  select * into v_review from public.reviews r
    where r.checkin_id = p_checkin_id and r.coach_id = p_coach_id and r.client_id = p_client_id
    order by r.created_at desc limit 1
    for update;

  if v_review.id is null then
    if (p_payload->>'expected_summary') is not null or (p_payload->>'expected_message_to_client') is not null then
      raise exception 'La revisión cambió; vuelve a leer get_checkins.' using errcode = 'P0001';
    end if;
    -- Igual que la app al recibir el formulario (form-submit / createReviewForCheckin).
    insert into public.reviews (coach_id, client_id, checkin_id, status, ai_status, created_by, summary, message_to_client)
    values (p_coach_id, p_client_id, p_checkin_id, 'draft', 'pending', auth.uid(),
      case when v_has_summary then v_summary end, case when v_has_message then v_message end)
    returning * into v_review;
  else
    if v_review.status <> 'draft' then
      raise exception 'La revisión ya no está en borrador; edítala desde la app.' using errcode = 'P0001';
    end if;
    -- Concurrencia: los textos actuales deben ser los que se leyeron con get_checkins.
    if v_review.summary is distinct from (p_payload->>'expected_summary')
      or v_review.message_to_client is distinct from (p_payload->>'expected_message_to_client') then
      raise exception 'La revisión cambió; vuelve a leer get_checkins.' using errcode = 'P0001';
    end if;
    update public.reviews set
      summary = case when v_has_summary then v_summary else summary end,
      message_to_client = case when v_has_message then v_message else message_to_client end
    where id = v_review.id
    returning * into v_review;
  end if;

  return jsonb_build_object('id', v_review.id, 'checkin_id', v_review.checkin_id, 'client_id', v_review.client_id,
    'status', v_review.status, 'summary', v_review.summary, 'message_to_client', v_review.message_to_client,
    'ai_status', v_review.ai_status, 'created_at', v_review.created_at);
end;
$function$;

revoke all on function public.save_nexttrain_review_draft(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_nexttrain_review_draft(uuid, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cabecera y estado de un programa de fuerza
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER como create_nexttrain_strength_program: RLS y comprobación
-- explícita de membresía y cliente. Activar archiva antes el programa activo
-- anterior en la misma transacción (unique_active_program_per_client), igual
-- que la app. p_payload.today es el día actual en la zona del espacio.
create or replace function public.update_nexttrain_strength_program(
  p_coach_id uuid, p_client_id uuid, p_program_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_program public.training_programs%rowtype;
  v_today date := (p_payload->>'today')::date;
  v_status text;
  v_from date;
  v_weeks integer;
  v_dates_changed boolean;
  v_archived_ids uuid[] := '{}';
  v_removed integer := 0;
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
  if v_today is null then raise exception 'Falta la fecha actual del espacio.' using errcode = 'P0001'; end if;

  -- Serializa cambios de estado del mismo cliente, como la creación.
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

  v_status := coalesce(p_payload->>'status', v_program.status);
  if v_status not in ('draft', 'active', 'archived') then raise exception 'Estado de programa inválido.' using errcode = 'P0001'; end if;
  v_weeks := coalesce((p_payload->>'weeks')::integer, v_program.weeks, v_program.total_weeks);
  if v_weeks is null or v_weeks not between 1 and 52 then raise exception 'El programa debe durar entre 1 y 52 semanas.' using errcode = 'P0001'; end if;
  -- Como activateTrainingProgramAction: al activar un programa que no estaba activo empieza hoy, salvo que se indique otra fecha.
  v_from := coalesce((p_payload->>'effective_from')::date,
    case when v_status = 'active' and v_program.status <> 'active' then v_today end,
    v_program.effective_from);
  if v_from is null then raise exception 'Indica la fecha de inicio del programa.' using errcode = 'P0001'; end if;
  if v_status = 'active' and v_from > v_today then
    raise exception 'Guarda los programas futuros como borrador y actívalos al empezar.' using errcode = 'P0001';
  end if;
  if p_payload ? 'name' and nullif(btrim(p_payload->>'name'), '') is null then
    raise exception 'Indica un nombre para el programa.' using errcode = 'P0001';
  end if;

  if v_status = 'active' and v_program.status <> 'active' then
    with archived as (
      update public.training_programs set status = 'archived', updated_at = now()
      where coach_id = p_coach_id and client_id = p_client_id and status = 'active' and id <> p_program_id
      returning id
    ) select coalesce(array_agg(id), '{}') into v_archived_ids from archived;
  end if;

  v_dates_changed := v_from is distinct from v_program.effective_from or v_weeks is distinct from coalesce(v_program.weeks, v_program.total_weeks);
  if v_dates_changed then
    -- Como generateProgramSchedule en la app: las sesiones programadas no completadas
    -- quedan con fechas del calendario anterior y se borran; la plantilla las sustituye.
    with removed as (
      delete from public.scheduled_strength_sessions
      where program_id = p_program_id and coach_id = p_coach_id and client_id = p_client_id and is_completed is not true
      returning id
    ) select count(*) into v_removed from removed;
  end if;

  update public.training_programs set
    name = coalesce(nullif(btrim(p_payload->>'name'), ''), name),
    status = v_status,
    weeks = v_weeks,
    total_weeks = v_weeks,
    effective_from = v_from,
    effective_to = case when v_dates_changed or effective_to is null then v_from + v_weeks * 7 - 1 else effective_to end,
    updated_at = now()
  where id = p_program_id
  returning * into v_program;

  return pg_catalog.to_jsonb(v_program) || jsonb_build_object(
    'archived_program_ids', v_archived_ids, 'removed_scheduled_sessions', v_removed);
end;
$function$;

revoke all on function public.update_nexttrain_strength_program(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.update_nexttrain_strength_program(uuid, uuid, uuid, jsonb) to authenticated;
