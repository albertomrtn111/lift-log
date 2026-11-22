-- NXT-150: cambiar la asistencia de una clase ya no borra series.
--
-- Antes, en las clases de grupo, studio_sync_sets borraba todas las series de quien no
-- estuviera como «Vino», también las registradas una a una (cargas por serie, My Jump, VBT).
-- Lo hacía al cambiar la asistencia y en cualquier edición posterior de la clase, así que
-- también cuando la agenda marcaba «No vino» por una cita anulada o borrada en FisioTrack.
--
-- Ahora esas series se apartan a studio_session_sets_hidden y vuelven tal cual al marcar
-- «Vino». La tabla de siempre, studio_session_sets, sigue teniendo solo las series que
-- cuentan, así que informes, progreso, analítica (v_strength_set_facts), MCP, app del
-- atleta y exportaciones no cambian ni tienen que filtrar nada.
--
-- Además:
--   · El cambio de asistencia entra en el «Deshacer» del editor (antes quedaba bloqueado).
--   · La agenda no marca «No vino» a quien ya tiene series registradas en esa clase, y deja
--     de reescribir cada 5 minutos a quien ya estaba como «No vino».
--
-- Orden de despliegue: se puede aplicar antes que la web nueva. No cambia ninguna firma ni
-- tipo de vuelta (las llamadas de la web y del MCP actuales siguen igual), todo es
-- create or replace dentro de la transacción de la migración, y la web de antes no lee la
-- tabla nueva.

-- 1. Series apartadas de quien no está como «Vino».
create table if not exists public.studio_session_sets_hidden (
    id uuid primary key,
    item_id uuid not null references public.studio_session_items(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    set_index integer not null check (set_index >= 1),
    load_kg numeric,
    reps integer,
    time_seconds integer,
    rir numeric,
    rpe numeric,
    velocity_ms numeric,
    rep_detail jsonb,
    source text,
    is_detailed boolean not null default false,
    recorded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    hidden_at timestamptz not null default now(),
    constraint studio_session_sets_hidden_item_person_set_key unique (item_id, client_id, set_index)
);

create index if not exists studio_session_sets_hidden_client_idx
    on public.studio_session_sets_hidden (client_id);

alter table public.studio_session_sets_hidden enable row level security;

-- El equipo ve que hay series guardadas; el atleta no (no cuentan). Solo escriben las funciones.
drop policy if exists studio_session_sets_hidden_read on public.studio_session_sets_hidden;
create policy studio_session_sets_hidden_read on public.studio_session_sets_hidden
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

revoke all on public.studio_session_sets_hidden from anon;
revoke insert, update, delete, truncate, references, trigger on public.studio_session_sets_hidden from authenticated;

-- 2. Recolocar series: en los grupos, apartar en vez de borrar, y devolver al volver.
create or replace function public.studio_sync_sets(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_item public.studio_session_items%rowtype;
    v_group_id uuid;
    v_person record;
begin
    select * into v_item from public.studio_session_items i where i.id = p_item_id;
    select s.group_id into v_group_id from public.studio_sessions s where s.id = v_item.session_id;

    if v_group_id is null then
        if exists (select 1 from public.studio_session_sets s where s.item_id = p_item_id and s.is_detailed) then
            return;
        end if;
        delete from public.studio_session_sets s where s.item_id = p_item_id;
        if not v_item.is_done then
            return;
        end if;
        insert into public.studio_session_sets (item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, recorded_by)
        select
            v_item.id, v_item.client_id, n, v_item.load_kg,
            nullif(substring(coalesce(v_item.reps, '') from '^\s*(\d+)'), '')::integer,
            v_item.time_seconds, v_item.rir, v_item.rpe, auth.uid()
        from generate_series(1, coalesce(v_item.sets, 1)) n;
        return;
    end if;

    -- Quien no está como «Vino»: sus series se apartan tal cual, no se borran.
    -- Lo apartado antes de esa persona en este ejercicio se sustituye por lo de ahora.
    delete from public.studio_session_sets_hidden h
    where h.item_id = p_item_id
      and h.client_id in (
          select s.client_id from public.studio_session_sets s
          where s.item_id = p_item_id
            and not exists (
                select 1 from public.studio_session_attendance a
                where a.session_id = v_item.session_id and a.client_id = s.client_id and a.status = 'attended'
            )
      );

    with moved as (
        delete from public.studio_session_sets s
        where s.item_id = p_item_id
          and not exists (
              select 1 from public.studio_session_attendance a
              where a.session_id = v_item.session_id and a.client_id = s.client_id and a.status = 'attended'
          )
        returning s.*
    )
    insert into public.studio_session_sets_hidden (
        id, item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
        velocity_ms, rep_detail, source, is_detailed, recorded_by, created_at
    )
    select m.id, m.item_id, m.client_id, m.set_index, m.load_kg, m.reps, m.time_seconds, m.rir, m.rpe,
        m.velocity_ms, m.rep_detail, m.source, m.is_detailed, m.recorded_by, m.created_at
    from moved m;

    for v_person in
        select a.client_id, p.load_kg, p.reps, p.time_seconds, p.rir, p.rpe
        from public.studio_session_attendance a
        left join public.studio_item_people p on p.item_id = p_item_id and p.client_id = a.client_id
        where a.session_id = v_item.session_id and a.status = 'attended'
    loop
        -- Vuelve a estar como «Vino»: recupera lo apartado, salvo que ya tenga series registradas.
        if exists (
            select 1 from public.studio_session_sets_hidden h
            where h.item_id = p_item_id and h.client_id = v_person.client_id
        ) and not exists (
            select 1 from public.studio_session_sets s
            where s.item_id = p_item_id and s.client_id = v_person.client_id and s.is_detailed
        ) then
            delete from public.studio_session_sets s where s.item_id = p_item_id and s.client_id = v_person.client_id;
            with back as (
                delete from public.studio_session_sets_hidden h
                where h.item_id = p_item_id and h.client_id = v_person.client_id
                returning h.*
            )
            insert into public.studio_session_sets (
                id, item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
                velocity_ms, rep_detail, source, is_detailed, recorded_by, created_at
            )
            select b.id, b.item_id, b.client_id, b.set_index, b.load_kg, b.reps, b.time_seconds, b.rir, b.rpe,
                b.velocity_ms, b.rep_detail, b.source, b.is_detailed, b.recorded_by, b.created_at
            from back b;
        end if;

        if exists (
            select 1 from public.studio_session_sets s
            where s.item_id = p_item_id and s.client_id = v_person.client_id and s.is_detailed
        ) then
            continue;
        end if;
        delete from public.studio_session_sets s where s.item_id = p_item_id and s.client_id = v_person.client_id;
        if v_item.is_done then
            insert into public.studio_session_sets (item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, recorded_by)
            select
                v_item.id, v_person.client_id, n, coalesce(v_person.load_kg, v_item.load_kg),
                nullif(substring(coalesce(v_person.reps, v_item.reps, '') from '^\s*(\d+)'), '')::integer,
                coalesce(v_person.time_seconds, v_item.time_seconds),
                coalesce(v_person.rir, v_item.rir), coalesce(v_person.rpe, v_item.rpe), auth.uid()
            from generate_series(1, coalesce(v_item.sets, 1)) n;
        end if;
    end loop;
end;
$function$;

-- 3. La foto de un ejercicio (para deshacer) lleva también lo apartado.
create or replace function public.studio_item_snapshot(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
    select to_jsonb(i) || jsonb_build_object(
        'tags', (select coalesce(jsonb_agg(it.tag_id), '[]'::jsonb) from public.studio_item_tags it where it.item_id = i.id),
        'people', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.studio_item_people p where p.item_id = i.id),
        'set_rows', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.studio_session_sets s where s.item_id = i.id),
        'hidden_set_rows', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.studio_session_sets_hidden h where h.item_id = i.id)
    )
    from public.studio_session_items i
    where i.id = p_item_id;
$function$;

-- 4. Recuperar un ejercicio: también lo apartado. Las fotos de antes no lo traen y no lo tocan.
create or replace function public.studio_restore_item(p_data jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_item public.studio_session_items%rowtype;
begin
    v_item := jsonb_populate_record(null::public.studio_session_items, p_data - 'tags' - 'set_rows' - 'people' - 'hidden_set_rows');

    insert into public.studio_session_items (
        id, session_id, client_id, coach_id, section_id, workspace_exercise_id, catalog_exercise_id,
        routine_id, request_id,
        sort_order, sets, reps, time_seconds, load_kg, rir, rpe, velocity_ms, next_load, circuit, note,
        is_done, done_at, version, updated_by
    )
    values (
        v_item.id, v_item.session_id, v_item.client_id, v_item.coach_id,
        (select x.id from public.studio_session_sections x where x.id = v_item.section_id),
        (select w.id from public.workspace_exercises w where w.id = v_item.workspace_exercise_id),
        -- Si el ejercicio se ha fusionado entre medias, vuelve con el que lo sustituye.
        (select coalesce(c.merged_into, c.id) from public.exercise_catalog c where c.id = v_item.catalog_exercise_id),
        (select r.id from public.studio_routines r where r.id = v_item.routine_id),
        (select r.id from public.studio_requests r where r.id = v_item.request_id),
        v_item.sort_order, v_item.sets, v_item.reps, v_item.time_seconds, v_item.load_kg, v_item.rir, v_item.rpe,
        v_item.velocity_ms, v_item.next_load, v_item.circuit, v_item.note, v_item.is_done, v_item.done_at,
        v_item.version + 1, auth.uid()
    )
    on conflict (id) do update
    set section_id = excluded.section_id,
        sort_order = excluded.sort_order,
        sets = excluded.sets,
        reps = excluded.reps,
        time_seconds = excluded.time_seconds,
        load_kg = excluded.load_kg,
        rir = excluded.rir,
        rpe = excluded.rpe,
        velocity_ms = excluded.velocity_ms,
        next_load = excluded.next_load,
        circuit = excluded.circuit,
        note = excluded.note,
        is_done = excluded.is_done,
        done_at = excluded.done_at,
        version = public.studio_session_items.version + 1,
        updated_by = excluded.updated_by,
        updated_at = now();

    delete from public.studio_session_sets s where s.item_id = v_item.id;
    insert into public.studio_session_sets (
        id, item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
        velocity_ms, rep_detail, source, is_detailed, recorded_by
    )
    select r.id, r.item_id, r.client_id, r.set_index, r.load_kg, r.reps, r.time_seconds, r.rir, r.rpe,
        r.velocity_ms, r.rep_detail, r.source, r.is_detailed, r.recorded_by
    from jsonb_populate_recordset(null::public.studio_session_sets, coalesce(p_data->'set_rows', '[]'::jsonb)) r;

    if p_data ? 'hidden_set_rows' then
        delete from public.studio_session_sets_hidden h where h.item_id = v_item.id;
        insert into public.studio_session_sets_hidden (
            id, item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
            velocity_ms, rep_detail, source, is_detailed, recorded_by, created_at, hidden_at
        )
        select r.id, v_item.id, r.client_id, r.set_index, r.load_kg, r.reps, r.time_seconds, r.rir, r.rpe,
            r.velocity_ms, r.rep_detail, r.source, coalesce(r.is_detailed, false),
            (select p.id from public.profiles p where p.id = r.recorded_by),
            coalesce(r.created_at, now()), coalesce(r.hidden_at, now())
        from jsonb_populate_recordset(null::public.studio_session_sets_hidden, p_data->'hidden_set_rows') r
        where exists (select 1 from public.clients c where c.id = r.client_id);
    end if;

    delete from public.studio_item_people p where p.item_id = v_item.id;
    insert into public.studio_item_people (
        item_id, client_id, load_kg, reps, time_seconds, rir, rpe, velocity_ms, next_load, updated_by, updated_at
    )
    select p.item_id, p.client_id, p.load_kg, p.reps, p.time_seconds, p.rir, p.rpe, p.velocity_ms,
        p.next_load, p.updated_by, p.updated_at
    from jsonb_populate_recordset(null::public.studio_item_people, coalesce(p_data->'people', '[]'::jsonb)) p;
    perform public.studio_sync_sets(v_item.id);

    if p_data ? 'tags' then
        delete from public.studio_item_tags it where it.item_id = v_item.id;
        insert into public.studio_item_tags (item_id, tag_id)
        select v_item.id, t.id
        from public.studio_tags t
        where t.id in (select e.value::uuid from jsonb_array_elements_text(p_data->'tags') e (value));
    end if;
end;
$function$;

-- 5. Pasar lista: igual que antes, pero queda en el historial y se puede deshacer.
-- La fila del historial usa un id fijo por clase y persona, para que deshacer sepa si alguien
-- la ha cambiado después. Lleva attendee_id (no client_id) para que el historial sea del grupo.
create or replace function public.studio_set_attendance(p_session_id uuid, p_client_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_session public.studio_sessions%rowtype;
    v_before public.studio_session_attendance%rowtype;
    v_after public.studio_session_attendance%rowtype;
    v_item_id uuid;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.group_id is null then
        raise exception 'La asistencia es de las sesiones de grupo.' using errcode = '22023';
    end if;
    perform public.studio_require_group(v_session.group_id);
    if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = v_session.coach_id) then
        raise exception 'Ese cliente no es de este espacio.' using errcode = '22023';
    end if;

    select * into v_before
    from public.studio_session_attendance a
    where a.session_id = p_session_id and a.client_id = p_client_id;

    insert into public.studio_session_attendance (session_id, client_id, status, origin, marked_by)
    values (p_session_id, p_client_id, p_status, 'manual', auth.uid())
    on conflict (session_id, client_id) do update
    set status = excluded.status, origin = 'manual', marked_by = excluded.marked_by, marked_at = now()
    returning * into v_after;

    for v_item_id in select i.id from public.studio_session_items i where i.session_id = p_session_id loop
        perform public.studio_sync_sets(v_item_id);
    end loop;

    if v_before.session_id is null or v_before.status <> v_after.status or v_before.origin <> v_after.origin then
        perform public.studio_log(
            v_session.coach_id, 'studio_session_attendance',
            md5(p_session_id::text || ':' || p_client_id::text)::uuid,
            case when v_before.session_id is null then null else jsonb_build_object(
                'session_id', p_session_id, 'group_id', v_session.group_id, 'attendee_id', p_client_id,
                'status', v_before.status, 'origin', v_before.origin,
                'marked_by', v_before.marked_by, 'marked_at', v_before.marked_at
            ) end,
            jsonb_build_object(
                'session_id', p_session_id, 'group_id', v_session.group_id, 'attendee_id', p_client_id,
                'status', v_after.status, 'origin', v_after.origin,
                'marked_by', v_after.marked_by, 'marked_at', v_after.marked_at
            ),
            null
        );
    end if;
end;
$function$;

-- 6. Deshacer: sabe devolver la asistencia (y con ella, las series).
create or replace function public.studio_undo_last(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_coach_id uuid := public.studio_require_scope(p_client_id);
    v_batch uuid;
    v_new_batch uuid := gen_random_uuid();
    v_row public.studio_change_log%rowtype;
    v_session_id uuid;
    v_entry jsonb;
    v_item_id uuid;
begin
    -- Un deshacer por cliente a la vez.
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));

    select l.batch_id into v_batch
    from public.studio_change_log l
    where l.scope_id = p_client_id
      and l.actor_id = auth.uid()
      and l.undo_state is null
      and l.undo_of is null
      and l.created_at > now() - interval '7 days'
    order by l.id desc
    limit 1;

    if v_batch is null then
        return jsonb_build_object('status', 'nothing');
    end if;

    if exists (
        -- Alguien cambió esas filas después, y ese cambio sigue en pie.
        select 1
        from public.studio_change_log l
        join public.studio_change_log later
            on later.row_id = l.row_id and later.table_name = l.table_name and later.id > l.id
        where l.batch_id = v_batch
          and later.batch_id <> v_batch
          and later.undo_of is null
          and later.undo_state is distinct from 'undone'
    ) or exists (
        -- La sesión de esa fila ya no está, y este lote no la recupera.
        select 1
        from public.studio_change_log l
        where l.batch_id = v_batch
          and l.table_name <> 'studio_sessions'
          and not exists (
              select 1 from public.studio_sessions s
              where s.id = case
                  when l.table_name = 'studio_session_layout' then l.row_id
                  else coalesce(l.after_data->>'session_id', l.before_data->>'session_id')::uuid
              end
          )
    ) or exists (
        -- Una sesión creada en este lote tiene ya cosas de otros lotes.
        select 1
        from public.studio_change_log l
        join public.studio_session_items i on i.session_id = l.row_id
        where l.batch_id = v_batch
          and l.table_name = 'studio_sessions'
          and l.before_data is null
          and not exists (
              select 1 from public.studio_change_log own
              where own.batch_id = v_batch and own.row_id = i.id
          )
    ) then
        update public.studio_change_log l set undo_state = 'blocked' where l.batch_id = v_batch;
        return jsonb_build_object('status', 'blocked');
    end if;

    for v_row in
        select * from public.studio_change_log l where l.batch_id = v_batch order by l.id desc
    loop
        if v_row.table_name = 'studio_session_items' then
            if v_row.before_data is null then
                delete from public.studio_session_items i where i.id = v_row.row_id;
            else
                perform public.studio_restore_item(v_row.before_data);
            end if;
            v_session_id := coalesce(v_row.after_data->>'session_id', v_row.before_data->>'session_id')::uuid;
            perform public.studio_refresh_status(v_session_id);

        elsif v_row.table_name = 'studio_sessions' then
            if v_row.before_data is null then
                delete from public.studio_sessions s where s.id = v_row.row_id;
            else
                perform public.studio_restore_session(v_row.before_data);
            end if;

        elsif v_row.table_name = 'studio_session_sections' then
            if v_row.before_data is null then
                delete from public.studio_session_sections x where x.id = v_row.row_id;
            else
                insert into public.studio_session_sections (id, session_id, client_id, title, parent_title, sort_order)
                select x.id, x.session_id, x.client_id, x.title, x.parent_title, x.sort_order
                from jsonb_populate_record(null::public.studio_session_sections, v_row.before_data - 'item_ids') x
                on conflict (id) do update set title = excluded.title, sort_order = excluded.sort_order;

                update public.studio_session_items i
                set section_id = v_row.row_id
                where i.id in (
                    select e.value::uuid
                    from jsonb_array_elements_text(coalesce(v_row.before_data->'item_ids', '[]'::jsonb)) e (value)
                );
            end if;

        elsif v_row.table_name = 'studio_session_layout' then
            for v_entry in select e.value from jsonb_array_elements(v_row.before_data->'sections') e (value) loop
                update public.studio_session_sections x
                set sort_order = (v_entry->>'sort_order')::integer
                where x.id = (v_entry->>'id')::uuid;
            end loop;
            for v_entry in select e.value from jsonb_array_elements(v_row.before_data->'items') e (value) loop
                update public.studio_session_items i
                set sort_order = (v_entry->>'sort_order')::integer,
                    section_id = (select x.id from public.studio_session_sections x where x.id = (v_entry->>'section_id')::uuid)
                where i.id = (v_entry->>'id')::uuid;
            end loop;

        elsif v_row.table_name = 'studio_session_attendance' then
            -- Los avisos antiguos (sin attendee_id) nacieron bloqueados y no llegan aquí.
            v_session_id := coalesce(v_row.after_data->>'session_id', v_row.before_data->>'session_id')::uuid;
            if v_row.before_data is null then
                delete from public.studio_session_attendance a
                where a.session_id = v_session_id
                  and a.client_id = (v_row.after_data->>'attendee_id')::uuid;
            else
                insert into public.studio_session_attendance (session_id, client_id, status, origin, marked_by, marked_at)
                select v_session_id, c.id, v_row.before_data->>'status', v_row.before_data->>'origin',
                    (select p.id from public.profiles p where p.id = (v_row.before_data->>'marked_by')::uuid),
                    coalesce((v_row.before_data->>'marked_at')::timestamptz, now())
                from public.clients c
                where c.id = (v_row.before_data->>'attendee_id')::uuid
                on conflict (session_id, client_id) do update
                set status = excluded.status, origin = excluded.origin,
                    marked_by = excluded.marked_by, marked_at = excluded.marked_at;
            end if;
            for v_item_id in select i.id from public.studio_session_items i where i.session_id = v_session_id loop
                perform public.studio_sync_sets(v_item_id);
            end loop;
        end if;

        perform public.studio_log(v_coach_id, v_row.table_name, v_row.row_id, v_row.after_data, v_row.before_data, v_new_batch);
    end loop;

    update public.studio_change_log l set undo_state = 'undone' where l.batch_id = v_batch;
    update public.studio_change_log l set undo_of = v_batch where l.batch_id = v_new_batch;

    return jsonb_build_object('status', 'undone');
end;
$function$;

-- 7. Agenda: una cita anulada o borrada marca «No vino» solo si esa persona no tiene series
-- registradas en la clase, y solo si no lo estaba ya. Al marcarla, sus series se apartan al
-- momento (antes se quedaban hasta la siguiente edición de la clase, que las borraba).
create or replace function public.agenda_apply(p_coach_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_zone constant text := 'Europe/Madrid';
    v_weekdays constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    v_row record;
    v_slot record;
    v_client_id uuid;
    v_session_id uuid;
    v_group_id uuid;
    v_item_id uuid;
    v_local timestamp;
    v_key text;
    v_name text;
    v_clients integer := 0;
    v_sessions integer := 0;
    v_classes integer := 0;
    v_changed integer := 0;
begin
    -- Alta automática: quien tiene cita de un servicio con sesión ya es cliente del centro.
    for v_row in
        select distinct p.id, p.full_name, p.email, p.phone, p.birth_date
        from public.external_patients p
        join public.agenda_appointments a on a.external_patient_id = p.id and a.deleted_at is null
        left join public.agenda_services s on s.id = a.service_id
        where p.coach_id = p_coach_id
          and p.client_id is null
          and coalesce(s.creates_session, true)
    loop
        select c.id into v_client_id
        from public.clients c
        where c.coach_id = p_coach_id
          and v_row.email is not null
          and lower(c.email) = lower(v_row.email)
        limit 1;

        if v_client_id is null then
            insert into public.clients (coach_id, full_name, email, phone, birthday, status)
            values (p_coach_id, v_row.full_name, v_row.email, v_row.phone, v_row.birth_date, 'active')
            returning id into v_client_id;
            v_clients := v_clients + 1;
        end if;
        update public.external_patients p set client_id = v_client_id where p.id = v_row.id;
    end loop;

    update public.agenda_appointments a
    set client_id = p.client_id
    from public.external_patients p
    where a.external_patient_id = p.id
      and a.coach_id = p_coach_id
      and a.client_id is distinct from p.client_id;

    -- Citas que ya tienen sesión y han cambiado.
    for v_row in
        select a.*, s.client_id as session_client, s.group_id as session_group, s.status as session_status,
               exists (select 1 from public.studio_session_items i where i.session_id = s.id) as has_items,
               exists (select 1 from public.studio_session_items i where i.session_id = s.id and i.is_done) as has_done
        from public.agenda_appointments a
        join public.studio_sessions s on s.id = a.session_id
        where a.coach_id = p_coach_id
    loop
        v_local := v_row.starts_at at time zone v_zone;

        if v_row.session_group is not null then
            if v_row.deleted_at is not null or v_row.status = 'canceled' then
                update public.studio_session_attendance x
                set status = 'absent', marked_at = now()
                where x.session_id = v_row.session_id and x.client_id = v_row.client_id and x.origin = 'agenda'
                  and x.status <> 'absent'
                  -- Si ya tiene series registradas en la clase, vino: la agenda no lo cambia.
                  and not exists (
                      select 1
                      from public.studio_session_sets z
                      join public.studio_session_items i on i.id = z.item_id
                      where i.session_id = x.session_id and z.client_id = x.client_id and z.is_detailed
                  );
                if found then
                    for v_item_id in select i.id from public.studio_session_items i where i.session_id = v_row.session_id loop
                        perform public.studio_sync_sets(v_item_id);
                    end loop;
                end if;
            end if;
        elsif v_row.deleted_at is not null then
            if not v_row.has_items then
                delete from public.studio_sessions s where s.id = v_row.session_id;
                v_changed := v_changed + 1;
            end if;
        elsif v_row.status = 'canceled' then
            if not v_row.has_done and v_row.session_status = 'planned' then
                update public.studio_sessions s set status = 'cancelled', updated_at = now() where s.id = v_row.session_id;
                v_changed := v_changed + 1;
            end if;
        elsif v_row.session_status = 'planned' then
            update public.studio_sessions s
            set session_date = v_local::date,
                start_time = v_local::time,
                professional_id = coalesce(v_row.professional_id, s.professional_id),
                updated_at = now()
            where s.id = v_row.session_id
              and (s.session_date, s.start_time) is distinct from (v_local::date, v_local::time);
            if found then
                v_changed := v_changed + 1;
            end if;
        end if;
    end loop;

    -- Citas sin sesión, por franja: misma hora y mismo profesional.
    for v_slot in
        select
            a.starts_at, a.external_staff_id,
            count(*) filter (where coalesce(sv.group_mode, 'auto') <> 'individual') as class_size,
            min(m.external_name) as staff_name
        from public.agenda_appointments a
        left join public.agenda_services sv on sv.id = a.service_id
        left join public.external_staff_map m
            on m.coach_id = a.coach_id and m.provider = a.provider and m.external_id = a.external_staff_id
        where a.coach_id = p_coach_id
          and a.session_id is null
          and a.deleted_at is null
          and a.status <> 'canceled'
          and a.client_id is not null
          and coalesce(sv.creates_session, true)
        group by a.starts_at, a.external_staff_id
    loop
        v_local := v_slot.starts_at at time zone v_zone;
        v_group_id := null;

        if v_slot.class_size >= 2 then
            v_key := coalesce(v_slot.external_staff_id, 'sin-profesional') || ':' || extract(isodow from v_local)::integer
                || ':' || to_char(v_local, 'HH24:MI');
            select g.id into v_group_id from public.training_groups g where g.coach_id = p_coach_id and g.auto_key = v_key;
            if v_group_id is null then
                v_name := coalesce(v_slot.staff_name, 'Clase') || ' · '
                    || v_weekdays[extract(isodow from v_local)::integer] || ' ' || to_char(v_local, 'HH24:MI');
                insert into public.training_groups (coach_id, name, kind, schedule, auto_key)
                values (
                    p_coach_id, v_name, 'schedule',
                    jsonb_build_array(jsonb_build_object(
                        'weekday', extract(isodow from v_local)::integer - 1, 'time', to_char(v_local, 'HH24:MI')
                    )),
                    v_key
                )
                returning id into v_group_id;
            end if;

            select s.id into v_session_id
            from public.studio_sessions s
            where s.group_id = v_group_id and s.session_date = v_local::date and s.start_time = v_local::time;
            if v_session_id is null then
                insert into public.studio_sessions (coach_id, group_id, session_date, start_time, professional_id, origin, location_id)
                select p_coach_id, v_group_id, v_local::date, v_local::time, max(a.professional_id::text)::uuid, 'agenda', max(a.location_id::text)::uuid
                from public.agenda_appointments a
                where a.coach_id = p_coach_id and a.starts_at = v_slot.starts_at
                  and a.external_staff_id is not distinct from v_slot.external_staff_id
                returning id into v_session_id;
                v_classes := v_classes + 1;
            end if;
        end if;

        for v_row in
            select a.*, coalesce(sv.group_mode, 'auto') as group_mode, sv.name as service_name
            from public.agenda_appointments a
            left join public.agenda_services sv on sv.id = a.service_id
            where a.coach_id = p_coach_id
              and a.session_id is null
              and a.deleted_at is null
              and a.status <> 'canceled'
              and a.client_id is not null
              and a.starts_at = v_slot.starts_at
              and a.external_staff_id is not distinct from v_slot.external_staff_id
              and coalesce(sv.creates_session, true)
        loop
            if v_group_id is not null and v_row.group_mode <> 'individual' then
                insert into public.training_group_members (group_id, client_id, origin)
                values (v_group_id, v_row.client_id, 'agenda')
                on conflict (group_id, client_id) do update set left_on = null;

                insert into public.studio_session_attendance (session_id, client_id, status, origin)
                values (v_session_id, v_row.client_id, 'attended', 'agenda')
                on conflict (session_id, client_id) do nothing;

                update public.agenda_appointments a set session_id = v_session_id where a.id = v_row.id;
                continue;
            end if;

            -- Una sesión hecha a mano ese día, sin cita, se queda con la cita.
            select s.id into v_client_id
            from public.studio_sessions s
            where s.client_id = v_row.client_id
              and s.session_date = v_local::date
              and s.status = 'planned'
              and not exists (select 1 from public.agenda_appointments x where x.session_id = s.id)
            limit 1;

            if v_client_id is null then
                insert into public.studio_sessions (coach_id, client_id, session_date, start_time, professional_id, name, origin, location_id)
                values (
                    p_coach_id, v_row.client_id, v_local::date, v_local::time, v_row.professional_id,
                    v_row.service_name, 'agenda', v_row.location_id
                )
                returning id into v_client_id;
                v_sessions := v_sessions + 1;
            end if;
            update public.agenda_appointments a set session_id = v_client_id where a.id = v_row.id;
        end loop;
    end loop;

    return jsonb_build_object('clients', v_clients, 'sessions', v_sessions, 'classes', v_classes, 'changed', v_changed);
end;
$function$;

-- create or replace conserva dueño y permisos; se dejan explícitos por si se aplica en limpio.
revoke all on function public.studio_sync_sets(uuid) from public, anon, authenticated;
revoke all on function public.studio_item_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.studio_restore_item(jsonb) from public, anon, authenticated;
revoke all on function public.agenda_apply(uuid) from public, anon, authenticated;
grant execute on function public.agenda_apply(uuid) to service_role;
revoke all on function public.studio_set_attendance(uuid, uuid, text) from public, anon;
grant execute on function public.studio_set_attendance(uuid, uuid, text) to authenticated;
revoke all on function public.studio_undo_last(uuid) from public, anon;
grant execute on function public.studio_undo_last(uuid) to authenticated;
