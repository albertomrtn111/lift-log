-- Modo Sala F1-4: cambios en vivo, quién está mirando y deshacer.
--
-- El registro de cambios es la fuente de los tres: toda escritura deja una fila, así que basta
-- escucharlo para saber que algo ha cambiado, y deshacer aplica el «antes» de un lote. Por eso
-- cada fila guarda ahora el cliente y, en los ejercicios, también sus series y etiquetas.

alter table public.studio_change_log
    add column client_id uuid references public.clients (id) on delete cascade,
    add column undo_state text check (undo_state in ('undone', 'blocked')),
    add column undo_of uuid;

update public.studio_change_log l
set client_id = coalesce(
    (l.after_data->>'client_id')::uuid,
    (l.before_data->>'client_id')::uuid,
    (select s.client_id from public.studio_sessions s where s.id = l.row_id)
);

create index studio_change_log_undo_idx on public.studio_change_log (client_id, actor_id, id desc);
create index studio_change_log_row_idx on public.studio_change_log (row_id, id);
create index studio_change_log_batch_idx on public.studio_change_log (batch_id);

-- Igual que las sesiones: cada profesional solo ve lo de los clientes que puede ver.
drop policy studio_change_log_read on public.studio_change_log;
create policy studio_change_log_read on public.studio_change_log
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'studio_change_log'
       ) then
        alter publication supabase_realtime add table public.studio_change_log;
    end if;
end $$;

-- Presencia: canal privado por cliente, solo para quien puede ver su entrenamiento.
create or replace function public.studio_can_join_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if p_topic !~ '^studio:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
    end if;
    return public.can_see_training(substr(p_topic, 8)::uuid);
end;
$$;

revoke all on function public.studio_can_join_topic(text) from public, anon;
grant execute on function public.studio_can_join_topic(text) to authenticated;

create policy studio_presence_read on realtime.messages
    for select to authenticated
    using (extension = 'presence' and public.studio_can_join_topic((select realtime.topic())));

create policy studio_presence_write on realtime.messages
    for insert to authenticated
    with check (extension = 'presence' and public.studio_can_join_topic((select realtime.topic())));

create or replace function public.studio_log(
    p_coach_id uuid, p_table text, p_row_id uuid, p_before jsonb, p_after jsonb, p_batch_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.studio_change_log (coach_id, client_id, table_name, row_id, before_data, after_data, actor_id, batch_id)
    values (
        p_coach_id,
        coalesce(
            (p_after->>'client_id')::uuid,
            (p_before->>'client_id')::uuid,
            (select s.client_id from public.studio_sessions s where s.id = p_row_id)
        ),
        p_table, p_row_id, p_before, p_after, auth.uid(), coalesce(p_batch_id, gen_random_uuid())
    );
$$;

-- Una celda con sus series y etiquetas: lo que hace falta para dejarla como estaba.
create or replace function public.studio_item_snapshot(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select to_jsonb(i) || jsonb_build_object(
        'tags', (select coalesce(jsonb_agg(it.tag_id), '[]'::jsonb) from public.studio_item_tags it where it.item_id = i.id),
        'set_rows', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.studio_session_sets s where s.item_id = i.id)
    )
    from public.studio_session_items i
    where i.id = p_item_id;
$$;

create or replace function public.studio_restore_item(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.studio_session_items%rowtype;
begin
    v_item := jsonb_populate_record(null::public.studio_session_items, p_data - 'tags' - 'set_rows');

    insert into public.studio_session_items (
        id, session_id, client_id, coach_id, section_id, workspace_exercise_id, catalog_exercise_id,
        sort_order, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, note,
        is_done, done_at, version, updated_by
    )
    values (
        v_item.id, v_item.session_id, v_item.client_id, v_item.coach_id,
        (select x.id from public.studio_session_sections x where x.id = v_item.section_id),
        (select w.id from public.workspace_exercises w where w.id = v_item.workspace_exercise_id),
        -- Si el ejercicio se ha fusionado entre medias, vuelve con el que lo sustituye.
        (select coalesce(c.merged_into, c.id) from public.exercise_catalog c where c.id = v_item.catalog_exercise_id),
        v_item.sort_order, v_item.sets, v_item.reps, v_item.time_seconds, v_item.load_kg, v_item.rir, v_item.rpe,
        v_item.next_load, v_item.circuit, v_item.note, v_item.is_done, v_item.done_at, v_item.version + 1, auth.uid()
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
        next_load = excluded.next_load,
        circuit = excluded.circuit,
        note = excluded.note,
        is_done = excluded.is_done,
        done_at = excluded.done_at,
        version = public.studio_session_items.version + 1,
        updated_by = excluded.updated_by,
        updated_at = now();

    delete from public.studio_session_sets s where s.item_id = v_item.id;
    insert into public.studio_session_sets (id, item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, is_detailed, recorded_by)
    select r.id, r.item_id, r.client_id, r.set_index, r.load_kg, r.reps, r.time_seconds, r.rir, r.rpe, r.is_detailed, r.recorded_by
    from jsonb_populate_recordset(null::public.studio_session_sets, coalesce(p_data->'set_rows', '[]'::jsonb)) r;
    perform public.studio_sync_sets(v_item.id);

    if p_data ? 'tags' then
        delete from public.studio_item_tags it where it.item_id = v_item.id;
        insert into public.studio_item_tags (item_id, tag_id)
        select v_item.id, t.id
        from public.studio_tags t
        where t.id in (select e.value::uuid from jsonb_array_elements_text(p_data->'tags') e (value));
    end if;
end;
$$;

create or replace function public.studio_restore_session(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_item jsonb;
begin
    v_session := jsonb_populate_record(null::public.studio_sessions, p_data - 'items' - 'sections' - 'wellness_score');

    insert into public.studio_sessions (
        id, coach_id, location_id, client_id, session_date, start_time, duration_min, professional_id, name,
        status, origin, sort_order, wellness_sleep, wellness_fatigue, wellness_stress, wellness_soreness,
        arrival_note, rpe, version, created_by, created_at
    )
    values (
        v_session.id, v_session.coach_id,
        (select l.id from public.locations l where l.id = v_session.location_id),
        v_session.client_id, v_session.session_date, v_session.start_time, v_session.duration_min,
        (select p.id from public.profiles p where p.id = v_session.professional_id),
        v_session.name, v_session.status, v_session.origin, v_session.sort_order,
        v_session.wellness_sleep, v_session.wellness_fatigue, v_session.wellness_stress, v_session.wellness_soreness,
        v_session.arrival_note, v_session.rpe, v_session.version + 1, v_session.created_by, v_session.created_at
    )
    on conflict (id) do update
    set session_date = excluded.session_date,
        start_time = excluded.start_time,
        duration_min = excluded.duration_min,
        professional_id = excluded.professional_id,
        name = excluded.name,
        status = excluded.status,
        sort_order = excluded.sort_order,
        wellness_sleep = excluded.wellness_sleep,
        wellness_fatigue = excluded.wellness_fatigue,
        wellness_stress = excluded.wellness_stress,
        wellness_soreness = excluded.wellness_soreness,
        arrival_note = excluded.arrival_note,
        rpe = excluded.rpe,
        version = public.studio_sessions.version + 1,
        updated_at = now();

    insert into public.studio_session_sections (id, session_id, client_id, title, parent_title, sort_order)
    select x.id, x.session_id, x.client_id, x.title, x.parent_title, x.sort_order
    from jsonb_populate_recordset(null::public.studio_session_sections, coalesce(p_data->'sections', '[]'::jsonb)) x
    on conflict (id) do nothing;

    for v_item in select e.value from jsonb_array_elements(coalesce(p_data->'items', '[]'::jsonb)) e (value) loop
        perform public.studio_restore_item(v_item);
    end loop;
end;
$$;

create or replace function public.studio_delete_session(
    p_session_id uuid, p_version integer, p_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_sessions%rowtype;
    v_items jsonb;
    v_sections jsonb;
begin
    select * into v_before from public.studio_sessions s where s.id = p_session_id for update;
    if v_before.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

    select coalesce(jsonb_agg(public.studio_item_snapshot(i.id)), '[]'::jsonb) into v_items
    from public.studio_session_items i where i.session_id = p_session_id;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sections
    from public.studio_session_sections x where x.session_id = p_session_id;

    delete from public.studio_sessions s where s.id = p_session_id;

    perform public.studio_log(
        v_before.coach_id, 'studio_sessions', p_session_id,
        to_jsonb(v_before) || jsonb_build_object('items', v_items, 'sections', v_sections), null, p_batch_id
    );
end;
$$;

-- Crea (sin p_item_id) o cambia una celda. Cambiar una celda realizada regenera sus series heredadas.
create or replace function public.studio_save_item(
    p_session_id uuid,
    p_item_id uuid,
    p_version integer,
    p_fields jsonb,
    p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_before public.studio_session_items%rowtype;
    v_after public.studio_session_items%rowtype;
    v_snapshot jsonb;
    v_catalog_id uuid;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);

    if p_fields->>'section_id' is not null and not exists (
        select 1 from public.studio_session_sections x
        where x.id = (p_fields->>'section_id')::uuid and x.session_id = p_session_id
    ) then
        raise exception 'Ese subbloque no es de esta sesión.' using errcode = '22023';
    end if;

    if p_item_id is null then
        v_catalog_id := (p_fields->>'catalog_exercise_id')::uuid;
        if not exists (select 1 from public.exercise_catalog c where c.id = v_catalog_id and c.is_active) then
            raise exception 'Ese ejercicio no está en el catálogo.' using errcode = '22023';
        end if;
        insert into public.studio_session_items (
            session_id, client_id, coach_id, catalog_exercise_id, workspace_exercise_id, updated_by, sort_order
        )
        values (
            p_session_id, v_session.client_id, v_session.coach_id, v_catalog_id,
            (select w.id from public.workspace_exercises w
             where w.coach_id = v_session.coach_id and w.catalog_exercise_id = v_catalog_id),
            auth.uid(),
            (select coalesce(max(i.sort_order), 0) + 10 from public.studio_session_items i where i.session_id = p_session_id)
        )
        returning id into p_item_id;
    else
        select * into v_before from public.studio_session_items i
        where i.id = p_item_id and i.session_id = p_session_id for update;
        if v_before.id is null then
            raise exception 'Ejercicio no encontrado.' using errcode = '42501';
        end if;
        perform public.studio_check_version(p_version, v_before.version);
        v_snapshot := public.studio_item_snapshot(p_item_id);
    end if;

    update public.studio_session_items i
    set section_id = case when p_fields ? 'section_id' then (p_fields->>'section_id')::uuid else i.section_id end,
        sort_order = case when p_fields ? 'sort_order' then (p_fields->>'sort_order')::integer else i.sort_order end,
        sets = case when p_fields ? 'sets' then (p_fields->>'sets')::integer else i.sets end,
        reps = case when p_fields ? 'reps' then nullif(btrim(p_fields->>'reps'), '') else i.reps end,
        time_seconds = case when p_fields ? 'time_seconds' then (p_fields->>'time_seconds')::integer else i.time_seconds end,
        load_kg = case when p_fields ? 'load_kg' then (p_fields->>'load_kg')::numeric else i.load_kg end,
        rir = case when p_fields ? 'rir' then (p_fields->>'rir')::numeric else i.rir end,
        rpe = case when p_fields ? 'rpe' then (p_fields->>'rpe')::numeric else i.rpe end,
        next_load = case when p_fields ? 'next_load' then p_fields->>'next_load' else i.next_load end,
        circuit = case when p_fields ? 'circuit'
            then array(select jsonb_array_elements_text(p_fields->'circuit')) else i.circuit end,
        note = case when p_fields ? 'note' then nullif(btrim(p_fields->>'note'), '') else i.note end,
        version = i.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where i.id = p_item_id
    returning * into v_after;

    if p_fields ? 'tags' then
        perform public.studio_set_item_tags(v_session.coach_id, p_item_id, p_fields->'tags');
    end if;

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_log(v_session.coach_id, 'studio_session_items', p_item_id, v_snapshot, to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$$;

create or replace function public.studio_delete_item(p_item_id uuid, p_version integer, p_batch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_session_items%rowtype;
    v_snapshot jsonb;
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

    v_snapshot := public.studio_item_snapshot(p_item_id);
    delete from public.studio_session_items i where i.id = p_item_id;
    perform public.studio_refresh_status(v_before.session_id);
    perform public.studio_log(v_before.coach_id, 'studio_session_items', p_item_id, v_snapshot, null, p_batch_id);
end;
$$;

-- Un toque en la celda: marca o desmarca el ejercicio como realizado.
create or replace function public.studio_set_item_done(
    p_item_id uuid, p_version integer, p_done boolean, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_session_items%rowtype;
    v_after public.studio_session_items%rowtype;
    v_snapshot jsonb;
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);
    v_snapshot := public.studio_item_snapshot(p_item_id);

    update public.studio_session_items i
    set is_done = p_done,
        done_at = case when p_done then coalesce(i.done_at, now()) end,
        version = i.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where i.id = p_item_id
    returning * into v_after;

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_refresh_status(v_after.session_id);
    perform public.studio_log(v_after.coach_id, 'studio_session_items', p_item_id, v_snapshot, to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$$;

-- Por series: cada serie con sus valores; lo vacío hereda lo general. Quedan como detalladas.
-- Con una lista vacía se vuelve a las series heredadas.
create or replace function public.studio_save_sets(
    p_item_id uuid, p_version integer, p_sets jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_session_items%rowtype;
    v_after public.studio_session_items%rowtype;
    v_snapshot jsonb;
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);
    v_snapshot := public.studio_item_snapshot(p_item_id);

    delete from public.studio_session_sets s where s.item_id = p_item_id;

    insert into public.studio_session_sets (
        item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, is_detailed, recorded_by
    )
    select
        v_before.id, v_before.client_id, row_number() over (order by e.ord),
        coalesce((e.value->>'load_kg')::numeric, v_before.load_kg),
        coalesce((e.value->>'reps')::integer, nullif(substring(coalesce(v_before.reps, '') from '^\s*(\d+)'), '')::integer),
        coalesce((e.value->>'time_seconds')::integer, v_before.time_seconds),
        coalesce((e.value->>'rir')::numeric, v_before.rir),
        coalesce((e.value->>'rpe')::numeric, v_before.rpe),
        true, auth.uid()
    from jsonb_array_elements(p_sets) with ordinality e (value, ord);

    update public.studio_session_items i
    set is_done = case when jsonb_array_length(p_sets) > 0 then true else i.is_done end,
        done_at = case when jsonb_array_length(p_sets) > 0 then coalesce(i.done_at, now()) else i.done_at end,
        version = i.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where i.id = p_item_id
    returning * into v_after;

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_refresh_status(v_after.session_id);
    perform public.studio_log(v_after.coach_id, 'studio_session_items', p_item_id, v_snapshot, to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$$;

-- Deshace el último lote de quien llama con este cliente, si nadie ha tocado esas filas después.
-- Un lote bloqueado no se reintenta: el siguiente deshacer pasa al anterior.
create or replace function public.studio_undo_last(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
    v_batch uuid;
    v_new_batch uuid := gen_random_uuid();
    v_row public.studio_change_log%rowtype;
    v_session_id uuid;
    v_entry jsonb;
begin
    -- Un deshacer por cliente a la vez.
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));

    select l.batch_id into v_batch
    from public.studio_change_log l
    where l.client_id = p_client_id
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
        end if;

        perform public.studio_log(v_coach_id, v_row.table_name, v_row.row_id, v_row.after_data, v_row.before_data, v_new_batch);
    end loop;

    update public.studio_change_log l set undo_state = 'undone' where l.batch_id = v_batch;
    update public.studio_change_log l set undo_of = v_batch where l.batch_id = v_new_batch;

    return jsonb_build_object('status', 'undone');
end;
$$;

revoke all on function public.studio_item_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.studio_restore_item(jsonb) from public, anon, authenticated;
revoke all on function public.studio_restore_session(jsonb) from public, anon, authenticated;

revoke all on function public.studio_undo_last(uuid) from public, anon;
grant execute on function public.studio_undo_last(uuid) to authenticated;
