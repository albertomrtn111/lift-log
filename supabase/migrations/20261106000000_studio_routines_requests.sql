-- Modo Sala F1-5: rutinas, encargos y añadir ejercicios en bloque.
--
-- Pegar, usar una rutina, dejar un encargo y traer una plantilla acaban en lo mismo: varios
-- ejercicios que entran en una sesión como un solo lote, para que deshacer los quite juntos.

create table public.studio_routines (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    -- Sin cliente, es de todo el espacio.
    client_id uuid references public.clients (id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 80),
    kind text not null default 'other' check (kind in ('mobility', 'activation', 'other')),
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index studio_routines_coach_idx on public.studio_routines (coach_id);

create table public.studio_routine_items (
    id uuid primary key default gen_random_uuid(),
    routine_id uuid not null references public.studio_routines (id) on delete cascade,
    catalog_exercise_id uuid not null references public.exercise_catalog (id) on delete restrict,
    sort_order integer not null default 0,
    sets integer check (sets is null or sets between 1 and 30),
    reps text check (reps is null or length(reps) <= 40),
    time_seconds integer check (time_seconds is null or time_seconds >= 0),
    load_kg numeric(6, 2) check (load_kg is null or load_kg >= 0),
    rir numeric(3, 1) check (rir is null or rir between 0 and 10),
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    note text check (note is null or length(note) <= 2000)
);

create index studio_routine_items_routine_idx on public.studio_routine_items (routine_id);
create index studio_routine_items_catalog_idx on public.studio_routine_items (catalog_exercise_id);

create table public.studio_requests (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    from_user uuid references public.profiles (id) on delete set null,
    -- Sin destinatario, es para cualquiera.
    to_user uuid references public.profiles (id) on delete set null,
    title text not null check (length(btrim(title)) between 1 and 120),
    message text check (message is null or length(message) <= 2000),
    status text not null default 'pending' check (status in ('pending', 'done')),
    done_by uuid references public.profiles (id) on delete set null,
    done_at timestamptz,
    created_at timestamptz not null default now()
);

create index studio_requests_client_idx on public.studio_requests (client_id, status);
create index studio_requests_session_idx on public.studio_requests (session_id);

alter table public.studio_session_items
    add column routine_id uuid references public.studio_routines (id) on delete set null,
    add column request_id uuid references public.studio_requests (id) on delete set null;

alter table public.studio_routines enable row level security;
alter table public.studio_routine_items enable row level security;
alter table public.studio_requests enable row level security;

-- Solo lectura: las escrituras van por las funciones. Recepción y atletas no ven nada de esto.
create policy studio_routines_read on public.studio_routines
    for select to authenticated
    using (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    );

create policy studio_routine_items_read on public.studio_routine_items
    for select to authenticated
    using (exists (select 1 from public.studio_routines r where r.id = routine_id));

create policy studio_requests_read on public.studio_requests
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

-- Un ejercicio fusionado arrastra las rutinas al que lo sustituye.
create or replace function public.studio_routines_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.studio_routine_items r
    set catalog_exercise_id = new.merged_into
    where r.catalog_exercise_id = new.id;
    return new;
end;
$$;

create trigger exercise_catalog_merged_routines
    after update of merged_into on public.exercise_catalog
    for each row
    when (new.merged_into is not null and new.merged_into is distinct from old.merged_into)
    execute function public.studio_routines_follow_merge();

-- Avisa en vivo de algo que no entra en deshacer: queda fuera de la pila de quien lo hizo.
create or replace function public.studio_log_event(
    p_coach_id uuid, p_client_id uuid, p_table text, p_row_id uuid, p_after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.studio_change_log (coach_id, client_id, table_name, row_id, after_data, actor_id, batch_id, undo_state)
    values (p_coach_id, p_client_id, p_table, p_row_id, p_after, auth.uid(), gen_random_uuid(), 'blocked');
$$;

-- Igual que antes, conservando de qué rutina o encargo venía la celda.
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
        routine_id, request_id,
        sort_order, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, note,
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

-- Añade varios ejercicios en un solo lote. Cada uno lleva sus campos y, si quiere, section_title.
create or replace function public.studio_add_items(
    p_session_id uuid,
    p_items jsonb,
    p_routine_id uuid default null,
    p_request_id uuid default null,
    p_origin text default null,
    p_batch_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_batch uuid := coalesce(p_batch_id, gen_random_uuid());
    v_entry jsonb;
    v_item public.studio_session_items%rowtype;
    v_title text;
    v_section_id uuid;
    v_added integer := 0;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);

    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'No hay ejercicios que añadir.' using errcode = '22023';
    end if;
    if p_routine_id is not null and not exists (
        select 1 from public.studio_routines r where r.id = p_routine_id and r.coach_id = v_session.coach_id
    ) then
        raise exception 'Esa rutina no es de este espacio.' using errcode = '22023';
    end if;
    if p_request_id is not null and not exists (
        select 1 from public.studio_requests r where r.id = p_request_id and r.session_id = p_session_id
    ) then
        raise exception 'Ese encargo no es de esta sesión.' using errcode = '22023';
    end if;

    for v_entry in select e.value from jsonb_array_elements(p_items) e (value) loop
        v_title := nullif(btrim(v_entry->>'section_title'), '');
        v_section_id := null;
        if v_title is not null then
            select x.id into v_section_id
            from public.studio_session_sections x
            where x.session_id = p_session_id and x.title = v_title
            order by x.sort_order
            limit 1;
            if v_section_id is null then
                v_section_id := (public.studio_save_section(p_session_id, null, v_title, v_batch)).id;
            end if;
            v_entry := v_entry || jsonb_build_object('section_id', v_section_id);
        end if;

        v_item := public.studio_save_item(p_session_id, null, null, v_entry - 'section_title', v_batch);
        if p_routine_id is not null or p_request_id is not null then
            update public.studio_session_items i
            set routine_id = p_routine_id, request_id = p_request_id
            where i.id = v_item.id;
        end if;
        v_added := v_added + 1;
    end loop;

    if p_origin in ('copy', 'template') then
        update public.studio_sessions s set origin = p_origin where s.id = p_session_id;
    end if;

    return v_added;
end;
$$;

-- Crea o cambia una rutina y deja exactamente estos ejercicios.
create or replace function public.studio_save_routine(
    p_coach_id uuid,
    p_routine_id uuid,
    p_name text,
    p_kind text,
    p_client_id uuid,
    p_items jsonb
)
returns public.studio_routines
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_routine public.studio_routines%rowtype;
begin
    if not public.is_coach_member(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'No puedes gestionar las rutinas de este espacio.' using errcode = '42501';
    end if;
    if p_client_id is not null and public.studio_require_client(p_client_id) <> p_coach_id then
        raise exception 'Ese cliente no es de este espacio.' using errcode = '42501';
    end if;
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'Una rutina necesita al menos un ejercicio.' using errcode = '22023';
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_items) e (value)
        where not exists (
            select 1 from public.exercise_catalog c
            where c.id = (e.value->>'catalog_exercise_id')::uuid and c.is_active
        )
    ) then
        raise exception 'Ese ejercicio no está en el catálogo.' using errcode = '22023';
    end if;

    if p_routine_id is null then
        insert into public.studio_routines (coach_id, client_id, name, kind, created_by)
        values (p_coach_id, p_client_id, btrim(p_name), p_kind, auth.uid())
        returning * into v_routine;
    else
        update public.studio_routines r
        set client_id = p_client_id, name = btrim(p_name), kind = p_kind, updated_at = now()
        where r.id = p_routine_id and r.coach_id = p_coach_id
        returning * into v_routine;
        if v_routine.id is null then
            raise exception 'Rutina no encontrada.' using errcode = '42501';
        end if;
        delete from public.studio_routine_items i where i.routine_id = v_routine.id;
    end if;

    insert into public.studio_routine_items (
        routine_id, catalog_exercise_id, sort_order, sets, reps, time_seconds, load_kg, rir, rpe, note
    )
    select
        v_routine.id, (e.value->>'catalog_exercise_id')::uuid, e.ord * 10,
        (e.value->>'sets')::integer, nullif(btrim(e.value->>'reps'), ''), (e.value->>'time_seconds')::integer,
        (e.value->>'load_kg')::numeric, (e.value->>'rir')::numeric, (e.value->>'rpe')::numeric,
        nullif(btrim(e.value->>'note'), '')
    from jsonb_array_elements(p_items) with ordinality e (value, ord);

    return v_routine;
end;
$$;

-- Lo que ya se añadió a sesiones se queda; solo pierde la marca de la rutina.
create or replace function public.studio_delete_routine(p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_routine public.studio_routines%rowtype;
begin
    select * into v_routine from public.studio_routines r where r.id = p_routine_id;
    if v_routine.id is null or not public.is_coach_member(v_routine.coach_id)
       or not public.coach_has_feature(v_routine.coach_id, 'studio_mode') then
        raise exception 'Rutina no encontrada.' using errcode = '42501';
    end if;
    if v_routine.client_id is not null then
        perform public.studio_require_client(v_routine.client_id);
    end if;
    delete from public.studio_routines r where r.id = p_routine_id;
end;
$$;

-- Un profesional deja mensaje y ejercicios para la sesión de otro, o para quien la dé.
create or replace function public.studio_create_request(
    p_session_id uuid,
    p_to_user uuid,
    p_title text,
    p_message text,
    p_items jsonb default '[]'::jsonb,
    p_batch_id uuid default null
)
returns public.studio_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
    v_request public.studio_requests%rowtype;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);
    perform public.studio_require_professional(v_session.coach_id, p_to_user);

    insert into public.studio_requests (coach_id, client_id, session_id, from_user, to_user, title, message)
    values (
        v_session.coach_id, v_session.client_id, p_session_id, auth.uid(), p_to_user,
        btrim(p_title), nullif(btrim(p_message), '')
    )
    returning * into v_request;

    if jsonb_array_length(p_items) > 0 then
        perform public.studio_add_items(p_session_id, p_items, null, v_request.id, null, p_batch_id);
    end if;

    perform public.studio_log_event(v_session.coach_id, v_session.client_id, 'studio_requests', v_request.id, to_jsonb(v_request));
    return v_request;
end;
$$;

create or replace function public.studio_set_request_status(p_request_id uuid, p_status text)
returns public.studio_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.studio_requests%rowtype;
begin
    select * into v_request from public.studio_requests r where r.id = p_request_id for update;
    if v_request.id is null then
        raise exception 'Encargo no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_request.client_id);

    update public.studio_requests r
    set status = p_status,
        done_by = case when p_status = 'done' then auth.uid() end,
        done_at = case when p_status = 'done' then now() end
    where r.id = p_request_id
    returning * into v_request;

    perform public.studio_log_event(v_request.coach_id, v_request.client_id, 'studio_requests', v_request.id, to_jsonb(v_request));
    return v_request;
end;
$$;

revoke all on function public.studio_routines_follow_merge() from public, anon, authenticated;
revoke all on function public.studio_log_event(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.studio_add_items(uuid, jsonb, uuid, uuid, text, uuid) from public, anon;
revoke all on function public.studio_save_routine(uuid, uuid, text, text, uuid, jsonb) from public, anon;
revoke all on function public.studio_delete_routine(uuid) from public, anon;
revoke all on function public.studio_create_request(uuid, uuid, text, text, jsonb, uuid) from public, anon;
revoke all on function public.studio_set_request_status(uuid, text) from public, anon;

grant execute on function public.studio_add_items(uuid, jsonb, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.studio_save_routine(uuid, uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.studio_delete_routine(uuid) to authenticated;
grant execute on function public.studio_create_request(uuid, uuid, text, text, jsonb, uuid) to authenticated;
grant execute on function public.studio_set_request_status(uuid, text) to authenticated;
