-- Modo Sala F1-3: lo que le faltaba a la base de datos para editar sesiones.
--
-- Subbloques, orden de los ejercicios dentro de la sesión, duplicar y etiquetas de material o
-- variante. Como en F1-1, todo pasa por funciones que apuntan el cambio en el registro.

-- El profesional de una sesión tiene que ser del equipo del espacio.
create or replace function public.studio_require_professional(p_coach_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if p_user_id is not null and not exists (
        select 1 from public.coach_memberships m
        where m.coach_id = p_coach_id
          and m.user_id = p_user_id
          and m.status = 'active'
          and m.role in ('owner', 'admin', 'coach')
    ) then
        raise exception 'Ese profesional no es de este espacio.' using errcode = '22023';
    end if;
end;
$$;

-- Usos de cada etiqueta, también cuando un ejercicio se borra en cascada.
create or replace function public.studio_count_tag_uses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        update public.studio_tags t set uses = t.uses + 1 where t.id = new.tag_id;
        return new;
    end if;
    update public.studio_tags t set uses = greatest(t.uses - 1, 0) where t.id = old.tag_id;
    return old;
end;
$$;

create trigger studio_item_tags_count
    after insert or delete on public.studio_item_tags
    for each row execute function public.studio_count_tag_uses();

-- Deja en la celda exactamente estas etiquetas; las nuevas pasan a ser del espacio.
create or replace function public.studio_set_item_tags(p_coach_id uuid, p_item_id uuid, p_tags jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text;
    v_tag_id uuid;
    v_keep uuid[] := '{}';
begin
    for v_name in
        select regexp_replace(btrim(e.value), '\s+', ' ', 'g')
        from jsonb_array_elements_text(p_tags) e (value)
        where btrim(e.value) <> ''
    loop
        insert into public.studio_tags (coach_id, name, name_key)
        values (p_coach_id, v_name, public.exercise_name_key(v_name))
        on conflict (coach_id, name_key) do update set name = public.studio_tags.name
        returning id into v_tag_id;
        v_keep := array_append(v_keep, v_tag_id);
    end loop;

    delete from public.studio_item_tags it
    where it.item_id = p_item_id and not (it.tag_id = any (v_keep));

    insert into public.studio_item_tags (item_id, tag_id)
    select p_item_id, k.tag_id from unnest(v_keep) k (tag_id)
    on conflict do nothing;
end;
$$;

create or replace function public.studio_create_session(
    p_client_id uuid,
    p_session_date date,
    p_start_time time default null,
    p_professional_id uuid default null,
    p_name text default null,
    p_batch_id uuid default null
)
returns public.studio_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
    v_session public.studio_sessions%rowtype;
begin
    perform public.studio_require_professional(v_coach_id, p_professional_id);

    insert into public.studio_sessions (
        coach_id, location_id, client_id, session_date, start_time, professional_id, name, created_by
    )
    values (
        v_coach_id,
        (select l.id from public.locations l where l.coach_id = v_coach_id and l.is_active
         order by l.sort_order, l.created_at limit 1),
        p_client_id, p_session_date, p_start_time, coalesce(p_professional_id, auth.uid()),
        nullif(btrim(p_name), ''), auth.uid()
    )
    returning * into v_session;

    perform public.studio_log(v_coach_id, 'studio_sessions', v_session.id, null, to_jsonb(v_session), p_batch_id);
    return v_session;
end;
$$;

-- Cambia solo los campos presentes en p_patch.
create or replace function public.studio_update_session(
    p_session_id uuid, p_version integer, p_patch jsonb, p_batch_id uuid default null
)
returns public.studio_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_sessions%rowtype;
    v_after public.studio_sessions%rowtype;
begin
    select * into v_before from public.studio_sessions s where s.id = p_session_id for update;
    if v_before.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);
    if p_patch ? 'professional_id' then
        perform public.studio_require_professional(v_before.coach_id, (p_patch->>'professional_id')::uuid);
    end if;

    update public.studio_sessions s
    set session_date = case when p_patch ? 'session_date' then (p_patch->>'session_date')::date else s.session_date end,
        start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else s.start_time end,
        duration_min = case when p_patch ? 'duration_min' then (p_patch->>'duration_min')::integer else s.duration_min end,
        professional_id = case when p_patch ? 'professional_id' then (p_patch->>'professional_id')::uuid else s.professional_id end,
        name = case when p_patch ? 'name' then nullif(btrim(p_patch->>'name'), '') else s.name end,
        status = case when p_patch ? 'status' then p_patch->>'status' else s.status end,
        sort_order = case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::integer else s.sort_order end,
        wellness_sleep = case when p_patch ? 'wellness_sleep' then (p_patch->>'wellness_sleep')::smallint else s.wellness_sleep end,
        wellness_fatigue = case when p_patch ? 'wellness_fatigue' then (p_patch->>'wellness_fatigue')::smallint else s.wellness_fatigue end,
        wellness_stress = case when p_patch ? 'wellness_stress' then (p_patch->>'wellness_stress')::smallint else s.wellness_stress end,
        wellness_soreness = case when p_patch ? 'wellness_soreness' then (p_patch->>'wellness_soreness')::smallint else s.wellness_soreness end,
        arrival_note = case when p_patch ? 'arrival_note' then nullif(btrim(p_patch->>'arrival_note'), '') else s.arrival_note end,
        rpe = case when p_patch ? 'rpe' then (p_patch->>'rpe')::numeric else s.rpe end,
        version = s.version + 1,
        updated_at = now()
    where s.id = p_session_id
    returning * into v_after;

    -- Al reabrir una sesión anulada, su estado sale de sus ejercicios.
    if p_patch ? 'status' and p_patch->>'status' in ('planned', 'done') then
        perform public.studio_refresh_status(p_session_id);
        select * into v_after from public.studio_sessions s where s.id = p_session_id;
    end if;

    perform public.studio_log(v_before.coach_id, 'studio_sessions', p_session_id, to_jsonb(v_before), to_jsonb(v_after), p_batch_id);
    return v_after;
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
        returning * into v_before;
        p_item_id := v_before.id;
        v_before := null;
    else
        select * into v_before from public.studio_session_items i
        where i.id = p_item_id and i.session_id = p_session_id for update;
        if v_before.id is null then
            raise exception 'Ejercicio no encontrado.' using errcode = '42501';
        end if;
        perform public.studio_check_version(p_version, v_before.version);
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
    perform public.studio_log(
        v_session.coach_id, 'studio_session_items', p_item_id,
        case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_after), p_batch_id
    );
    return v_after;
end;
$$;

-- Crea (sin p_section_id) o renombra un subbloque.
create or replace function public.studio_save_section(
    p_session_id uuid, p_section_id uuid, p_title text, p_batch_id uuid default null
)
returns public.studio_session_sections
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_before public.studio_session_sections%rowtype;
    v_after public.studio_session_sections%rowtype;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);

    if p_section_id is null then
        insert into public.studio_session_sections (session_id, client_id, title, sort_order)
        values (
            p_session_id, v_session.client_id, btrim(p_title),
            (select coalesce(max(x.sort_order), 0) + 10 from public.studio_session_sections x where x.session_id = p_session_id)
        )
        returning * into v_after;
    else
        select * into v_before from public.studio_session_sections x
        where x.id = p_section_id and x.session_id = p_session_id;
        if v_before.id is null then
            raise exception 'Subbloque no encontrado.' using errcode = '42501';
        end if;
        update public.studio_session_sections x set title = btrim(p_title)
        where x.id = p_section_id
        returning * into v_after;
    end if;

    perform public.studio_log(
        v_session.coach_id, 'studio_session_sections', v_after.id,
        case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_after), p_batch_id
    );
    return v_after;
end;
$$;

-- Quita el título; sus ejercicios se quedan en la sesión, sin subbloque.
create or replace function public.studio_delete_section(p_section_id uuid, p_batch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_session_sections%rowtype;
    v_session public.studio_sessions%rowtype;
    v_items jsonb;
begin
    select * into v_before from public.studio_session_sections x where x.id = p_section_id;
    if v_before.id is null then
        raise exception 'Subbloque no encontrado.' using errcode = '42501';
    end if;
    select * into v_session from public.studio_sessions s where s.id = v_before.session_id for update;
    perform public.studio_require_client(v_session.client_id);

    select coalesce(jsonb_agg(i.id), '[]'::jsonb) into v_items
    from public.studio_session_items i where i.section_id = p_section_id;

    delete from public.studio_session_sections x where x.id = p_section_id;

    perform public.studio_log(
        v_session.coach_id, 'studio_session_sections', p_section_id,
        to_jsonb(v_before) || jsonb_build_object('item_ids', v_items), null, p_batch_id
    );
end;
$$;

-- Orden de la ficha de la sesión: subbloques y, en p_items, cada ejercicio con su subbloque.
-- No sube la versión de las celdas: el orden no pisa lo que otro esté escribiendo en ellas.
create or replace function public.studio_arrange_session(
    p_session_id uuid, p_section_ids uuid[], p_items jsonb, p_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_before jsonb;
    v_after jsonb;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);

    if exists (
        select 1 from jsonb_array_elements(p_items) e (value)
        where e.value->>'section_id' is not null
          and not exists (
              select 1 from public.studio_session_sections x
              where x.id = (e.value->>'section_id')::uuid and x.session_id = p_session_id
          )
    ) then
        raise exception 'Ese subbloque no es de esta sesión.' using errcode = '22023';
    end if;

    select jsonb_build_object(
        'sections', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sort_order', x.sort_order)), '[]'::jsonb)
                     from public.studio_session_sections x where x.session_id = p_session_id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'section_id', i.section_id, 'sort_order', i.sort_order)), '[]'::jsonb)
                  from public.studio_session_items i where i.session_id = p_session_id)
    ) into v_before;

    update public.studio_session_sections x
    set sort_order = o.ord * 10
    from unnest(p_section_ids) with ordinality o (id, ord)
    where x.id = o.id and x.session_id = p_session_id;

    update public.studio_session_items i
    set sort_order = e.ord * 10,
        section_id = (e.value->>'section_id')::uuid,
        updated_at = now()
    from jsonb_array_elements(p_items) with ordinality e (value, ord)
    where i.id = (e.value->>'id')::uuid and i.session_id = p_session_id;

    select jsonb_build_object(
        'sections', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sort_order', x.sort_order)), '[]'::jsonb)
                     from public.studio_session_sections x where x.session_id = p_session_id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'section_id', i.section_id, 'sort_order', i.sort_order)), '[]'::jsonb)
                  from public.studio_session_items i where i.session_id = p_session_id)
    ) into v_after;

    perform public.studio_log(v_session.coach_id, 'studio_session_layout', p_session_id, v_before, v_after, p_batch_id);
end;
$$;

-- Sesión nueva con los mismos ejercicios, series, repeticiones y pesos. Nace prevista y sin notas,
-- sin marcas de realizado, sin cómo llega y sin indicación de subir o bajar carga.
create or replace function public.studio_duplicate_session(
    p_session_id uuid,
    p_session_date date,
    p_start_time time default null,
    p_professional_id uuid default null,
    p_name text default null,
    p_batch_id uuid default null
)
returns public.studio_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_source public.studio_sessions%rowtype;
    v_new public.studio_sessions%rowtype;
    v_section public.studio_session_sections%rowtype;
    v_new_section public.studio_session_sections%rowtype;
    v_item public.studio_session_items%rowtype;
    v_new_item public.studio_session_items%rowtype;
    v_sections jsonb := '{}'::jsonb;
    v_batch uuid := coalesce(p_batch_id, gen_random_uuid());
begin
    select * into v_source from public.studio_sessions s where s.id = p_session_id;
    if v_source.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_source.client_id);

    v_new := public.studio_create_session(
        v_source.client_id, p_session_date, p_start_time, p_professional_id, p_name, v_batch
    );
    update public.studio_sessions s set origin = 'copy' where s.id = v_new.id returning * into v_new;

    for v_section in
        select * from public.studio_session_sections x where x.session_id = p_session_id order by x.sort_order
    loop
        insert into public.studio_session_sections (session_id, client_id, title, parent_title, sort_order)
        values (v_new.id, v_new.client_id, v_section.title, v_section.parent_title, v_section.sort_order)
        returning * into v_new_section;
        v_sections := v_sections || jsonb_build_object(v_section.id::text, v_new_section.id);
        perform public.studio_log(v_new.coach_id, 'studio_session_sections', v_new_section.id, null, to_jsonb(v_new_section), v_batch);
    end loop;

    for v_item in
        select * from public.studio_session_items i where i.session_id = p_session_id order by i.sort_order
    loop
        insert into public.studio_session_items (
            session_id, client_id, coach_id, section_id, workspace_exercise_id, catalog_exercise_id,
            sort_order, sets, reps, time_seconds, load_kg, rir, rpe, circuit, updated_by
        )
        values (
            v_new.id, v_new.client_id, v_new.coach_id, (v_sections->>v_item.section_id::text)::uuid,
            v_item.workspace_exercise_id, v_item.catalog_exercise_id, v_item.sort_order, v_item.sets, v_item.reps,
            v_item.time_seconds, v_item.load_kg, v_item.rir, v_item.rpe, v_item.circuit, auth.uid()
        )
        returning * into v_new_item;

        insert into public.studio_item_tags (item_id, tag_id)
        select v_new_item.id, it.tag_id from public.studio_item_tags it where it.item_id = v_item.id;

        perform public.studio_log(v_new.coach_id, 'studio_session_items', v_new_item.id, null, to_jsonb(v_new_item), v_batch);
    end loop;

    return v_new;
end;
$$;

revoke all on function public.studio_require_professional(uuid, uuid) from public, anon, authenticated;
revoke all on function public.studio_count_tag_uses() from public, anon, authenticated;
revoke all on function public.studio_set_item_tags(uuid, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.studio_save_section(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.studio_delete_section(uuid, uuid) from public, anon;
revoke all on function public.studio_arrange_session(uuid, uuid[], jsonb, uuid) from public, anon;
revoke all on function public.studio_duplicate_session(uuid, date, time, uuid, text, uuid) from public, anon;

grant execute on function public.studio_save_section(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.studio_delete_section(uuid, uuid) to authenticated;
grant execute on function public.studio_arrange_session(uuid, uuid[], jsonb, uuid) to authenticated;
grant execute on function public.studio_duplicate_session(uuid, date, time, uuid, text, uuid) to authenticated;
