-- Modo Sala F1-1: sesiones de sala.
--
-- Una sesión nace prevista y se registra en sala. La celda guarda lo prescrito; al marcar un
-- ejercicio como realizado se crean sus series. Solo cuentan las series de ejercicios realizados
-- en sesiones hechas. Todas las escrituras pasan por las funciones studio_*: guardan, suben la
-- versión y apuntan el cambio en una sola transacción.

create table public.studio_sessions (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    location_id uuid references public.locations (id) on delete set null,
    client_id uuid not null references public.clients (id) on delete cascade,
    session_date date not null,
    start_time time,
    duration_min integer check (duration_min is null or duration_min between 1 and 600),
    professional_id uuid references public.profiles (id) on delete set null,
    name text check (name is null or length(btrim(name)) between 1 and 120),
    status text not null default 'planned' check (status in ('planned', 'done', 'cancelled', 'no_show')),
    origin text not null default 'manual' check (origin in ('manual', 'copy', 'template', 'agenda')),
    sort_order integer,
    wellness_sleep smallint check (wellness_sleep between 0 and 10),
    wellness_fatigue smallint check (wellness_fatigue between 0 and 10),
    wellness_stress smallint check (wellness_stress between 0 and 10),
    wellness_soreness smallint check (wellness_soreness between 0 and 10),
    -- 10 siempre es «llega perfecto»: sueño a favor; fatiga, estrés y dolor, a la inversa.
    wellness_score numeric(4, 2) generated always as (
        (wellness_sleep + (10 - wellness_fatigue) + (10 - wellness_stress) + (10 - wellness_soreness)) / 4.0
    ) stored,
    arrival_note text check (arrival_note is null or length(arrival_note) <= 1000),
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    version integer not null default 1,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index studio_sessions_client_date_idx on public.studio_sessions (client_id, session_date desc);
create index studio_sessions_coach_date_idx on public.studio_sessions (coach_id, session_date desc);

create table public.studio_session_sections (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    title text not null check (length(btrim(title)) between 1 and 80),
    parent_title text check (parent_title is null or length(btrim(parent_title)) between 1 and 80),
    sort_order integer not null default 0
);

create index studio_session_sections_session_idx on public.studio_session_sections (session_id);

create table public.studio_session_items (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    coach_id uuid not null references public.coaches (id) on delete cascade,
    section_id uuid references public.studio_session_sections (id) on delete set null,
    workspace_exercise_id uuid references public.workspace_exercises (id) on delete set null,
    catalog_exercise_id uuid not null references public.exercise_catalog (id) on delete restrict,
    sort_order integer not null default 0,
    sets integer check (sets is null or sets between 1 and 30),
    reps text check (reps is null or length(reps) <= 40),
    time_seconds integer check (time_seconds is null or time_seconds >= 0),
    load_kg numeric(6, 2) check (load_kg is null or load_kg >= 0),
    rir numeric(3, 1) check (rir is null or rir between 0 and 10),
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    next_load text check (next_load in ('up', 'same', 'down')),
    circuit text[] not null default '{}',
    note text check (note is null or length(note) <= 2000),
    is_done boolean not null default false,
    done_at timestamptz,
    version integer not null default 1,
    updated_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index studio_session_items_session_idx on public.studio_session_items (session_id);
create index studio_session_items_client_idx on public.studio_session_items (client_id, catalog_exercise_id);
create index studio_session_items_catalog_idx on public.studio_session_items (catalog_exercise_id);

create table public.studio_session_sets (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.studio_session_items (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    set_index integer not null check (set_index >= 1),
    load_kg numeric(6, 2) check (load_kg is null or load_kg >= 0),
    reps integer check (reps is null or reps >= 0),
    time_seconds integer check (time_seconds is null or time_seconds >= 0),
    rir numeric(3, 1) check (rir is null or rir between 0 and 10),
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    is_detailed boolean not null default false,
    recorded_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    unique (item_id, set_index)
);

create index studio_session_sets_client_idx on public.studio_session_sets (client_id);

-- Material o variante: etiquetas del espacio, para que todos escriban lo mismo.
create table public.studio_tags (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 60),
    name_key text not null,
    uses integer not null default 0,
    created_at timestamptz not null default now(),
    unique (coach_id, name_key)
);

create table public.studio_item_tags (
    item_id uuid not null references public.studio_session_items (id) on delete cascade,
    tag_id uuid not null references public.studio_tags (id) on delete cascade,
    primary key (item_id, tag_id)
);

create index studio_item_tags_tag_idx on public.studio_item_tags (tag_id);

-- Auditoría y base del deshacer: cada acción es un lote.
create table public.studio_change_log (
    id bigint generated always as identity primary key,
    coach_id uuid not null references public.coaches (id) on delete cascade,
    table_name text not null,
    row_id uuid not null,
    before_data jsonb,
    after_data jsonb,
    actor_id uuid references public.profiles (id) on delete set null,
    batch_id uuid not null,
    created_at timestamptz not null default now()
);

create index studio_change_log_coach_idx on public.studio_change_log (coach_id, created_at desc);
create index studio_change_log_actor_idx on public.studio_change_log (actor_id, created_at desc);

alter table public.studio_sessions enable row level security;
alter table public.studio_session_sections enable row level security;
alter table public.studio_session_items enable row level security;
alter table public.studio_session_sets enable row level security;
alter table public.studio_tags enable row level security;
alter table public.studio_item_tags enable row level security;
alter table public.studio_change_log enable row level security;

-- Solo lectura: las escrituras van por las funciones. Recepción no ve nada de esto, y el atleta
-- solo ve lo suyo, y solo lo hecho.
create policy studio_sessions_read on public.studio_sessions
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (status = 'done' and public.is_client_self(client_id))
    );

create policy studio_session_sections_read on public.studio_session_sections
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (public.is_client_self(client_id) and exists (
            select 1 from public.studio_sessions s where s.id = session_id and s.status = 'done'
        ))
    );

create policy studio_session_items_read on public.studio_session_items
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (public.is_client_self(client_id) and is_done and exists (
            select 1 from public.studio_sessions s where s.id = session_id and s.status = 'done'
        ))
    );

create policy studio_session_sets_read on public.studio_session_sets
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (public.is_client_self(client_id) and exists (
            select 1
            from public.studio_session_items i
            join public.studio_sessions s on s.id = i.session_id
            where i.id = item_id and i.is_done and s.status = 'done'
        ))
    );

create policy studio_tags_read on public.studio_tags
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy studio_item_tags_read on public.studio_item_tags
    for select to authenticated
    using (exists (select 1 from public.studio_session_items i where i.id = item_id));

create policy studio_change_log_read on public.studio_change_log
    for select to authenticated
    using (public.is_coach_member(coach_id));

-- Comprueba acceso y plan. Devuelve el espacio del cliente.
create or replace function public.studio_require_client(p_client_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid;
begin
    select c.coach_id into v_coach_id from public.clients c where c.id = p_client_id;
    if v_coach_id is null or not public.can_see_training(p_client_id) then
        raise exception 'No tienes acceso a este cliente.' using errcode = '42501';
    end if;
    if not public.coach_has_feature(v_coach_id, 'studio_mode') then
        raise exception 'Tu plan no incluye sala.' using errcode = '42501';
    end if;
    return v_coach_id;
end;
$$;

create or replace function public.studio_log(
    p_coach_id uuid, p_table text, p_row_id uuid, p_before jsonb, p_after jsonb, p_batch_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.studio_change_log (coach_id, table_name, row_id, before_data, after_data, actor_id, batch_id)
    values (p_coach_id, p_table, p_row_id, p_before, p_after, auth.uid(), coalesce(p_batch_id, gen_random_uuid()));
$$;

-- Si otro cambió la fila antes, no se sobrescribe: NT409 con la versión actual.
create or replace function public.studio_check_version(p_expected integer, p_current integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
    if p_expected is not null and p_expected <> p_current then
        raise exception 'Otra persona ha cambiado esto.'
            using errcode = 'NT409', detail = jsonb_build_object('current_version', p_current)::text;
    end if;
end;
$$;

-- Hecha en cuanto tiene un ejercicio realizado. Anulada y no vino no se tocan.
create or replace function public.studio_refresh_status(p_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.studio_sessions s
    set status = case
            when exists (select 1 from public.studio_session_items i where i.session_id = s.id and i.is_done)
                then 'done'
            else 'planned'
        end,
        updated_at = now()
    where s.id = p_session_id and s.status in ('planned', 'done');
$$;

-- Series heredadas de la prescripción. Las detalladas se respetan.
create or replace function public.studio_sync_sets(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.studio_session_items%rowtype;
begin
    select * into v_item from public.studio_session_items i where i.id = p_item_id;
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
begin
    select * into v_before from public.studio_sessions s where s.id = p_session_id for update;
    if v_before.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from public.studio_session_items i where i.session_id = p_session_id;

    delete from public.studio_sessions s where s.id = p_session_id;

    perform public.studio_log(
        v_before.coach_id, 'studio_sessions', p_session_id,
        to_jsonb(v_before) || jsonb_build_object('items', v_items), null, p_batch_id
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
    v_catalog_id uuid;
begin
    select * into v_session from public.studio_sessions s where s.id = p_session_id for update;
    if v_session.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_session.client_id);

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

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_log(
        v_session.coach_id, 'studio_session_items', p_item_id,
        case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_after), p_batch_id
    );
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
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

    delete from public.studio_session_items i where i.id = p_item_id;
    perform public.studio_refresh_status(v_before.session_id);
    perform public.studio_log(v_before.coach_id, 'studio_session_items', p_item_id, to_jsonb(v_before), null, p_batch_id);
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
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

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
    perform public.studio_log(v_after.coach_id, 'studio_session_items', p_item_id, to_jsonb(v_before), to_jsonb(v_after), p_batch_id);
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
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

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
    perform public.studio_log(v_after.coach_id, 'studio_session_items', p_item_id, to_jsonb(v_before), to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$$;

-- Vista única de series: online y sala, siempre por ejercicio del catálogo.
create or replace view public.v_strength_set_facts
with (security_invoker = true) as
select
    'online'::text as source,
    p.coach_id,
    p.client_id,
    t.catalog_exercise_id,
    t.exercise_name,
    s.id as set_id,
    s.set_index,
    s.performed_at,
    s.weight_kg as load_kg,
    s.reps,
    null::integer as time_seconds,
    s.rir::numeric as rir,
    null::numeric as rpe
from public.training_exercise_sets s
join public.training_exercises t on t.id = s.exercise_id
join public.training_programs p on p.id = t.program_id
where s.completed
union all
select
    'studio'::text,
    i.coach_id,
    i.client_id,
    i.catalog_exercise_id,
    c.name,
    s.id,
    s.set_index,
    (ss.session_date + coalesce(ss.start_time, time '12:00')) at time zone 'Europe/Madrid',
    s.load_kg,
    s.reps,
    s.time_seconds,
    s.rir,
    s.rpe
from public.studio_session_sets s
join public.studio_session_items i on i.id = s.item_id and i.is_done
join public.studio_sessions ss on ss.id = i.session_id and ss.status = 'done'
join public.exercise_catalog c on c.id = i.catalog_exercise_id;

-- Quitar de la biblioteca y fusionar también mueven lo de sala.
create or replace function public.workspace_exercise_usage(p_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_entry public.workspace_exercises%rowtype;
    v_clients jsonb;
    v_templates integer;
begin
    select * into v_entry from public.workspace_exercises w where w.id = p_entry_id;
    if v_entry.id is null or not public.is_coach_admin(v_entry.coach_id) then
        raise exception 'No tienes permiso para gestionar esta biblioteca.' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(u order by u.name), '[]'::jsonb) into v_clients
    from (
        select c.id, c.full_name as name, sum(x.programs)::integer as programs, sum(x.completed_sets)::integer as completed_sets
        from (
            select p.client_id, count(distinct p.id) as programs, count(s.id) filter (where s.completed) as completed_sets
            from public.training_exercises t
            join public.training_programs p on p.id = t.program_id
            left join public.training_exercise_sets s on s.exercise_id = t.id
            where t.coach_id = v_entry.coach_id and t.catalog_exercise_id = v_entry.catalog_exercise_id
            group by p.client_id
            union all
            select i.client_id, 0, count(s.id)
            from public.studio_session_items i
            left join public.studio_session_sets s on s.item_id = i.id
            where i.coach_id = v_entry.coach_id and i.catalog_exercise_id = v_entry.catalog_exercise_id
            group by i.client_id
        ) x
        join public.clients c on c.id = x.client_id
        group by c.id, c.full_name
    ) u;

    select count(*) into v_templates
    from public.training_templates t
    where t.coach_id = v_entry.coach_id
      and t.structure::text like '%' || v_entry.catalog_exercise_id::text || '%';

    return jsonb_build_object('clients', v_clients, 'templates', v_templates);
end;
$$;

create or replace function public.remove_workspace_exercise(p_entry_id uuid, p_target_catalog_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_entry public.workspace_exercises%rowtype;
    v_exercises integer := 0;
    v_studio integer := 0;
    v_templates integer := 0;
begin
    select * into v_entry from public.workspace_exercises w where w.id = p_entry_id for update;
    if v_entry.id is null or not public.is_coach_admin(v_entry.coach_id) then
        raise exception 'No tienes permiso para gestionar esta biblioteca.' using errcode = '42501';
    end if;

    if p_target_catalog_id is not null then
        if p_target_catalog_id = v_entry.catalog_exercise_id
           or not exists (
               select 1 from public.exercise_catalog c
               where c.id = p_target_catalog_id and c.is_active
           ) then
            raise exception 'Elige otro ejercicio activo del catálogo.' using errcode = '22023';
        end if;

        update public.training_exercises t
        set catalog_exercise_id = p_target_catalog_id
        where t.coach_id = v_entry.coach_id
          and t.catalog_exercise_id = v_entry.catalog_exercise_id;
        get diagnostics v_exercises = row_count;

        update public.studio_session_items i
        set catalog_exercise_id = p_target_catalog_id
        where i.coach_id = v_entry.coach_id
          and i.catalog_exercise_id = v_entry.catalog_exercise_id;
        get diagnostics v_studio = row_count;

        update public.training_templates t
        set structure = replace(
            t.structure::text, v_entry.catalog_exercise_id::text, p_target_catalog_id::text
        )::jsonb
        where t.coach_id = v_entry.coach_id
          and t.structure::text like '%' || v_entry.catalog_exercise_id::text || '%';
        get diagnostics v_templates = row_count;

        insert into public.workspace_exercises (coach_id, catalog_exercise_id, added_by)
        values (v_entry.coach_id, p_target_catalog_id, auth.uid())
        on conflict (coach_id, catalog_exercise_id) do nothing;
    end if;

    delete from public.workspace_exercises w where w.id = p_entry_id;

    return jsonb_build_object('exercises', v_exercises, 'studio_items', v_studio, 'templates', v_templates);
end;
$$;

create or replace function public.merge_catalog_exercise(p_source_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_source public.exercise_catalog%rowtype;
    v_target public.exercise_catalog%rowtype;
    v_exercises integer;
    v_studio integer;
    v_templates integer;
begin
    if not public.is_platform_admin() then
        raise exception 'Solo el equipo de NexTrain puede fusionar ejercicios.' using errcode = '42501';
    end if;
    if p_source_id = p_target_id then
        raise exception 'Elige dos ejercicios distintos.' using errcode = '22023';
    end if;

    -- Siempre en el mismo orden, para que dos fusiones a la vez no se bloqueen entre sí.
    perform 1 from public.exercise_catalog c
    where c.id in (p_source_id, p_target_id)
    order by c.id
    for update;

    select * into v_source from public.exercise_catalog c where c.id = p_source_id;
    select * into v_target from public.exercise_catalog c where c.id = p_target_id;
    if v_source.id is null or v_target.id is null or not v_source.is_active or not v_target.is_active then
        raise exception 'Los dos ejercicios tienen que estar activos.' using errcode = '22023';
    end if;

    update public.training_exercises t
    set catalog_exercise_id = p_target_id
    where t.catalog_exercise_id = p_source_id;
    get diagnostics v_exercises = row_count;

    update public.studio_session_items i
    set catalog_exercise_id = p_target_id
    where i.catalog_exercise_id = p_source_id;
    get diagnostics v_studio = row_count;

    -- Las plantillas guardan el id dentro del JSON.
    update public.training_templates t
    set structure = replace(t.structure::text, p_source_id::text, p_target_id::text)::jsonb
    where t.structure::text like '%' || p_source_id::text || '%';
    get diagnostics v_templates = row_count;

    delete from public.workspace_exercises s
    where s.catalog_exercise_id = p_source_id
      and exists (
          select 1 from public.workspace_exercises w
          where w.coach_id = s.coach_id and w.catalog_exercise_id = p_target_id
      );

    update public.workspace_exercises w
    set catalog_exercise_id = p_target_id
    where w.catalog_exercise_id = p_source_id;

    update public.exercise_catalog_aliases a
    set catalog_exercise_id = p_target_id
    where a.catalog_exercise_id = p_source_id;

    insert into public.exercise_catalog_aliases (alias_key, alias, catalog_exercise_id, note)
    values (public.exercise_name_key(v_source.name), v_source.name, p_target_id, 'Fusionado')
    on conflict (alias_key) do update set catalog_exercise_id = excluded.catalog_exercise_id;

    update public.exercise_catalog c
    set variant_of = case when c.id = p_target_id then null else p_target_id end
    where c.variant_of = p_source_id;

    update public.exercise_catalog c
    set possible_duplicate_of = case when c.id = p_target_id then null else p_target_id end
    where c.possible_duplicate_of = p_source_id;

    update public.exercise_catalog c
    set merged_into = p_target_id
    where c.merged_into = p_source_id;

    update public.exercise_catalog c
    set is_active = false,
        merged_into = p_target_id,
        merged_at = now(),
        merged_by = auth.uid(),
        possible_duplicate_of = null,
        variant_of = null
    where c.id = p_source_id;

    return jsonb_build_object('exercises', v_exercises, 'studio_items', v_studio, 'templates', v_templates);
end;
$$;

-- Funciones internas: solo las llaman las de arriba.
revoke all on function public.studio_require_client(uuid) from public, anon, authenticated;
revoke all on function public.studio_log(uuid, text, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.studio_check_version(integer, integer) from public, anon, authenticated;
revoke all on function public.studio_refresh_status(uuid) from public, anon, authenticated;
revoke all on function public.studio_sync_sets(uuid) from public, anon, authenticated;

revoke all on function public.studio_create_session(uuid, date, time, uuid, text, uuid) from public, anon;
revoke all on function public.studio_update_session(uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.studio_delete_session(uuid, integer, uuid) from public, anon;
revoke all on function public.studio_save_item(uuid, uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.studio_delete_item(uuid, integer, uuid) from public, anon;
revoke all on function public.studio_set_item_done(uuid, integer, boolean, uuid) from public, anon;
revoke all on function public.studio_save_sets(uuid, integer, jsonb, uuid) from public, anon;

grant execute on function public.studio_create_session(uuid, date, time, uuid, text, uuid) to authenticated;
grant execute on function public.studio_update_session(uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.studio_delete_session(uuid, integer, uuid) to authenticated;
grant execute on function public.studio_save_item(uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.studio_delete_item(uuid, integer, uuid) to authenticated;
grant execute on function public.studio_set_item_done(uuid, integer, boolean, uuid) to authenticated;
grant execute on function public.studio_save_sets(uuid, integer, jsonb, uuid) to authenticated;
