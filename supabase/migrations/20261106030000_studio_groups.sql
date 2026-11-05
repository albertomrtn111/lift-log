-- Modo Sala F2-1: grupos, asistencia y valores por persona.
--
-- Una clase es una sola sesión con group_id en vez de client_id, sin copias en la hoja de cada
-- integrante. Lo que cada persona hace son series con su client_id, que van a su historial.

create table public.training_groups (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    location_id uuid references public.locations (id) on delete set null,
    name text not null check (length(btrim(name)) between 1 and 120),
    -- Por horario se actualiza solo con la agenda; la lista fija se mantiene a mano.
    kind text not null default 'schedule' check (kind in ('schedule', 'fixed')),
    schedule jsonb not null default '[]'::jsonb,
    professional_ids uuid[] not null default '{}',
    is_active boolean not null default true,
    merged_into uuid references public.training_groups (id) on delete set null,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index training_groups_coach_idx on public.training_groups (coach_id);

create table public.training_group_members (
    group_id uuid not null references public.training_groups (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    joined_on date not null default current_date,
    left_on date,
    origin text not null default 'manual' check (origin in ('manual', 'agenda')),
    primary key (group_id, client_id)
);

create index training_group_members_client_idx on public.training_group_members (client_id);

alter table public.studio_sessions
    alter column client_id drop not null,
    add column group_id uuid references public.training_groups (id) on delete cascade,
    add constraint studio_sessions_owner_check check ((client_id is null) <> (group_id is null));

create index studio_sessions_group_idx on public.studio_sessions (group_id, session_date desc);

alter table public.studio_session_sections alter column client_id drop not null;
alter table public.studio_session_items alter column client_id drop not null;
alter table public.studio_requests alter column client_id drop not null;

-- Cada persona lleva sus propias series dentro del mismo ejercicio.
alter table public.studio_session_sets
    drop constraint studio_session_sets_item_id_set_index_key,
    add constraint studio_session_sets_item_person_set_key unique (item_id, client_id, set_index);

create table public.studio_session_attendance (
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    status text not null default 'unmarked' check (status in ('unmarked', 'attended', 'absent')),
    -- Lo manual manda: la agenda ya no lo toca.
    origin text not null default 'manual' check (origin in ('manual', 'agenda')),
    marked_by uuid references public.profiles (id) on delete set null,
    marked_at timestamptz not null default now(),
    primary key (session_id, client_id)
);

create index studio_session_attendance_client_idx on public.studio_session_attendance (client_id);

-- Lo vacío hereda lo general de la celda.
create table public.studio_item_people (
    item_id uuid not null references public.studio_session_items (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    load_kg numeric(6, 2) check (load_kg is null or load_kg >= 0),
    reps text check (reps is null or length(reps) <= 40),
    time_seconds integer check (time_seconds is null or time_seconds >= 0),
    rir numeric(3, 1) check (rir is null or rir between 0 and 10),
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    next_load text check (next_load in ('up', 'same', 'down')),
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (item_id, client_id)
);

create index studio_item_people_client_idx on public.studio_item_people (client_id);

alter table public.training_groups enable row level security;
alter table public.training_group_members enable row level security;
alter table public.studio_session_attendance enable row level security;
alter table public.studio_item_people enable row level security;

-- Solo lectura: las escrituras van por las funciones. De cada persona solo se ve lo que se puede
-- ver de ese cliente. Recepción y atletas no ven nada de esto.
create policy training_groups_read on public.training_groups
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy training_group_members_read on public.training_group_members
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy studio_session_attendance_read on public.studio_session_attendance
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy studio_item_people_read on public.studio_item_people
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

drop policy studio_sessions_read on public.studio_sessions;
create policy studio_sessions_read on public.studio_sessions
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (group_id is not null and public.is_coach_member(coach_id))
        or (status = 'done' and public.is_client_self(client_id))
    );

drop policy studio_session_sections_read on public.studio_session_sections;
create policy studio_session_sections_read on public.studio_session_sections
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (client_id is null and exists (select 1 from public.studio_sessions s where s.id = session_id))
        or (public.is_client_self(client_id) and exists (
            select 1 from public.studio_sessions s where s.id = session_id and s.status = 'done'
        ))
    );

drop policy studio_session_items_read on public.studio_session_items;
create policy studio_session_items_read on public.studio_session_items
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (client_id is null and public.is_coach_member(coach_id))
        or (public.is_client_self(client_id) and is_done and exists (
            select 1 from public.studio_sessions s where s.id = session_id and s.status = 'done'
        ))
    );

drop policy studio_requests_read on public.studio_requests;
create policy studio_requests_read on public.studio_requests
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (client_id is null and public.is_coach_member(coach_id))
    );

-- El registro escucha por cliente o por grupo: scope_id es uno de los dos.
alter table public.studio_change_log
    add column group_id uuid references public.training_groups (id) on delete cascade,
    add column scope_id uuid;

update public.studio_change_log l set scope_id = l.client_id;

create index studio_change_log_scope_idx on public.studio_change_log (scope_id, actor_id, id desc);

drop policy studio_change_log_read on public.studio_change_log;
create policy studio_change_log_read on public.studio_change_log
    for select to authenticated
    using (
        client_id in (select public.training_client_ids())
        or (client_id is null and public.is_coach_member(coach_id))
    );

create or replace function public.studio_log(
    p_coach_id uuid, p_table text, p_row_id uuid, p_before jsonb, p_after jsonb, p_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session_id uuid := coalesce(
        (p_after->>'session_id')::uuid,
        (p_before->>'session_id')::uuid,
        p_row_id
    );
    v_client_id uuid := coalesce((p_after->>'client_id')::uuid, (p_before->>'client_id')::uuid);
    v_group_id uuid := coalesce((p_after->>'group_id')::uuid, (p_before->>'group_id')::uuid);
begin
    if v_client_id is null and v_group_id is null then
        select s.client_id, s.group_id into v_client_id, v_group_id
        from public.studio_sessions s where s.id = v_session_id;
    end if;

    insert into public.studio_change_log (
        coach_id, client_id, group_id, scope_id, table_name, row_id, before_data, after_data, actor_id, batch_id
    )
    values (
        p_coach_id, v_client_id, v_group_id, coalesce(v_client_id, v_group_id), p_table, p_row_id,
        p_before, p_after, auth.uid(), coalesce(p_batch_id, gen_random_uuid())
    );
end;
$$;

create or replace function public.studio_log_event(
    p_coach_id uuid, p_client_id uuid, p_table text, p_row_id uuid, p_after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.studio_change_log (
        coach_id, client_id, group_id, scope_id, table_name, row_id, after_data, actor_id, batch_id, undo_state
    )
    values (
        p_coach_id, p_client_id, (p_after->>'group_id')::uuid, coalesce(p_client_id, (p_after->>'group_id')::uuid),
        p_table, p_row_id, p_after, auth.uid(), gen_random_uuid(), 'blocked'
    );
$$;

-- Comprueba acceso y plan en un grupo. Devuelve el espacio.
create or replace function public.studio_require_group(p_group_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid;
begin
    select g.coach_id into v_coach_id from public.training_groups g where g.id = p_group_id;
    if v_coach_id is null or not public.is_coach_member(v_coach_id) then
        raise exception 'No tienes acceso a este grupo.' using errcode = '42501';
    end if;
    if not public.coach_has_feature(v_coach_id, 'studio_mode') then
        raise exception 'Tu plan no incluye sala.' using errcode = '42501';
    end if;
    return v_coach_id;
end;
$$;

-- Una sesión es de un cliente o de un grupo; las escrituras comprueban lo que toque.
create or replace function public.studio_require_session(p_session_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_client_id uuid;
    v_group_id uuid;
begin
    select s.client_id, s.group_id into v_client_id, v_group_id
    from public.studio_sessions s where s.id = p_session_id;
    if v_group_id is not null then
        return public.studio_require_group(v_group_id);
    end if;
    return public.studio_require_client(v_client_id);
end;
$$;

-- Deshacer va por cliente o por grupo.
create or replace function public.studio_require_scope(p_scope_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from public.training_groups g where g.id = p_scope_id) then
        return public.studio_require_group(p_scope_id);
    end if;
    return public.studio_require_client(p_scope_id);
end;
$$;

-- Series heredadas de la prescripción. Las detalladas se respetan. En un grupo, cada persona que
-- vino tiene las suyas con sus valores; quien no vino no tiene ninguna.
create or replace function public.studio_sync_sets(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

    delete from public.studio_session_sets s
    where s.item_id = p_item_id
      and not exists (
          select 1 from public.studio_session_attendance a
          where a.session_id = v_item.session_id and a.client_id = s.client_id and a.status = 'attended'
      );

    for v_person in
        select a.client_id, p.load_kg, p.reps, p.time_seconds, p.rir, p.rpe
        from public.studio_session_attendance a
        left join public.studio_item_people p on p.item_id = p_item_id and p.client_id = a.client_id
        where a.session_id = v_item.session_id and a.status = 'attended'
    loop
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
    v_attendance jsonb;
begin
    select * into v_before from public.studio_sessions s where s.id = p_session_id for update;
    if v_before.id is null then
        raise exception 'Sesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_session(p_session_id);
    perform public.studio_check_version(p_version, v_before.version);

    select coalesce(jsonb_agg(public.studio_item_snapshot(i.id)), '[]'::jsonb) into v_items
    from public.studio_session_items i where i.session_id = p_session_id;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sections
    from public.studio_session_sections x where x.session_id = p_session_id;
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_attendance
    from public.studio_session_attendance a where a.session_id = p_session_id;

    delete from public.studio_sessions s where s.id = p_session_id;

    perform public.studio_log(
        v_before.coach_id, 'studio_sessions', p_session_id,
        to_jsonb(v_before) || jsonb_build_object('items', v_items, 'sections', v_sections, 'attendance', v_attendance),
        null, p_batch_id
    );
end;
$$;

create or replace function public.studio_create_group_session(
    p_group_id uuid,
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
    v_coach_id uuid := public.studio_require_group(p_group_id);
    v_session public.studio_sessions%rowtype;
begin
    perform public.studio_require_professional(v_coach_id, p_professional_id);

    insert into public.studio_sessions (
        coach_id, location_id, group_id, session_date, start_time, professional_id, name, created_by
    )
    values (
        v_coach_id,
        coalesce(
            (select g.location_id from public.training_groups g where g.id = p_group_id),
            (select l.id from public.locations l where l.coach_id = v_coach_id and l.is_active
             order by l.sort_order, l.created_at limit 1)
        ),
        p_group_id, p_session_date, p_start_time, coalesce(p_professional_id, auth.uid()),
        nullif(btrim(p_name), ''), auth.uid()
    )
    returning * into v_session;

    insert into public.studio_session_attendance (session_id, client_id, status, marked_by)
    select v_session.id, m.client_id, 'unmarked', auth.uid()
    from public.training_group_members m
    where m.group_id = p_group_id
      and m.joined_on <= p_session_date
      and (m.left_on is null or m.left_on > p_session_date);

    perform public.studio_log(v_coach_id, 'studio_sessions', v_session.id, null, to_jsonb(v_session), p_batch_id);
    return v_session;
end;
$$;

-- Crea una sesión del mismo cliente o grupo que otra. Es lo que necesita duplicar.
create or replace function public.studio_create_like(
    p_source_id uuid, p_session_date date, p_start_time time, p_professional_id uuid, p_name text, p_batch_id uuid
)
returns public.studio_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_source public.studio_sessions%rowtype;
begin
    select * into v_source from public.studio_sessions s where s.id = p_source_id;
    if v_source.group_id is not null then
        return public.studio_create_group_session(v_source.group_id, p_session_date, p_start_time, p_professional_id, p_name, p_batch_id);
    end if;
    return public.studio_create_session(v_source.client_id, p_session_date, p_start_time, p_professional_id, p_name, p_batch_id);
end;
$$;

-- Las funciones de F1 comprueban el cliente; ahora comprueban la sesión, que puede ser de un grupo.
do $$
declare
    v_change record;
    v_before text;
    v_after text;
begin
    for v_change in
        select * from (values
            ('public.studio_update_session(uuid,integer,jsonb,uuid)', 'public.studio_require_client(v_before.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_save_item(uuid,uuid,integer,jsonb,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_delete_item(uuid,integer,uuid)', 'public.studio_require_client(v_before.client_id)', 'public.studio_require_session(v_before.session_id)'),
            ('public.studio_set_item_done(uuid,integer,boolean,uuid)', 'public.studio_require_client(v_before.client_id)', 'public.studio_require_session(v_before.session_id)'),
            ('public.studio_save_section(uuid,uuid,text,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_delete_section(uuid,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(v_session.id)'),
            ('public.studio_set_section_parent(uuid,text)', 'public.studio_require_client(v_section.client_id)', 'public.studio_require_session(v_section.session_id)'),
            ('public.studio_arrange_session(uuid,uuid[],jsonb,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_add_items(uuid,jsonb,uuid,uuid,text,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_create_request(uuid,uuid,text,text,jsonb,uuid)', 'public.studio_require_client(v_session.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_set_request_status(uuid,text)', 'public.studio_require_client(v_request.client_id)', 'public.studio_require_session(v_request.session_id)'),
            ('public.studio_duplicate_session(uuid,date,time,uuid,text,uuid)', 'public.studio_require_client(v_source.client_id)', 'public.studio_require_session(p_session_id)'),
            ('public.studio_duplicate_session(uuid,date,time,uuid,text,uuid)',
             E'public.studio_create_session(\n        v_source.client_id, p_session_date, p_start_time, p_professional_id, p_name, v_batch\n    )',
             'public.studio_create_like(p_session_id, p_session_date, p_start_time, p_professional_id, p_name, v_batch)'),
            ('public.studio_undo_last(uuid)', 'public.studio_require_client(p_client_id)', 'public.studio_require_scope(p_client_id)'),
            ('public.studio_undo_last(uuid)', 'l.client_id = p_client_id', 'l.scope_id = p_client_id'),
            ('public.studio_restore_session(jsonb)', 'id, coach_id, location_id, client_id, session_date', 'id, coach_id, group_id, location_id, client_id, session_date'),
            ('public.studio_restore_session(jsonb)', 'v_session.id, v_session.coach_id,', 'v_session.id, v_session.coach_id, v_session.group_id,'),
            ('public.studio_restore_session(jsonb)', '- ''sections'' - ''wellness_score''', '- ''sections'' - ''wellness_score'' - ''attendance'''),
            ('public.studio_restore_session(jsonb)', '    for v_item in select e.value',
             E'    insert into public.studio_session_attendance (session_id, client_id, status, origin, marked_by, marked_at)\n'
             '    select a.session_id, a.client_id, a.status, a.origin, a.marked_by, a.marked_at\n'
             '    from jsonb_populate_recordset(null::public.studio_session_attendance, coalesce(p_data->''attendance'', ''[]''::jsonb)) a\n'
             '    on conflict (session_id, client_id) do nothing;\n\n'
             '    for v_item in select e.value'),
            ('public.studio_item_snapshot(uuid)', '''set_rows'', (select',
             E'''people'', (select coalesce(jsonb_agg(to_jsonb(p)), ''[]''::jsonb) from public.studio_item_people p where p.item_id = i.id),\n        ''set_rows'', (select'),
            ('public.studio_restore_item(jsonb)', 'p_data - ''tags'' - ''set_rows''', 'p_data - ''tags'' - ''set_rows'' - ''people'''),
            ('public.studio_restore_item(jsonb)', '    perform public.studio_sync_sets(v_item.id);',
             E'    delete from public.studio_item_people p where p.item_id = v_item.id;\n'
             '    insert into public.studio_item_people (item_id, client_id, load_kg, reps, time_seconds, rir, rpe, next_load, updated_by, updated_at)\n'
             '    select p.item_id, p.client_id, p.load_kg, p.reps, p.time_seconds, p.rir, p.rpe, p.next_load, p.updated_by, p.updated_at\n'
             '    from jsonb_populate_recordset(null::public.studio_item_people, coalesce(p_data->''people'', ''[]''::jsonb)) p;\n'
             '    perform public.studio_sync_sets(v_item.id);')
        ) t (fn, old_text, new_text)
    loop
        v_before := pg_get_functiondef(v_change.fn::regprocedure);
        v_after := replace(v_before, v_change.old_text, v_change.new_text);
        if v_after = v_before then
            raise exception 'No se ha encontrado el texto a cambiar en %', v_change.fn;
        end if;
        execute v_after;
    end loop;
end $$;

-- Las series de un grupo son de cada persona, no del ejercicio.
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
    s.client_id,
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

create or replace function public.studio_save_group(
    p_coach_id uuid, p_group_id uuid, p_name text, p_kind text, p_schedule jsonb, p_professional_ids uuid[]
)
returns public.training_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_group public.training_groups%rowtype;
begin
    if not public.is_coach_member(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'No puedes gestionar los grupos de este espacio.' using errcode = '42501';
    end if;
    if exists (
        select 1 from unnest(p_professional_ids) p (id)
        where not exists (
            select 1 from public.coach_memberships m
            where m.coach_id = p_coach_id and m.user_id = p.id and m.status = 'active' and m.role in ('owner', 'admin', 'coach')
        )
    ) then
        raise exception 'Ese profesional no es de este espacio.' using errcode = '22023';
    end if;

    if p_group_id is null then
        insert into public.training_groups (coach_id, name, kind, schedule, professional_ids, created_by)
        values (p_coach_id, btrim(p_name), p_kind, coalesce(p_schedule, '[]'::jsonb), coalesce(p_professional_ids, '{}'), auth.uid())
        returning * into v_group;
    else
        update public.training_groups g
        set name = btrim(p_name), kind = p_kind, schedule = coalesce(p_schedule, '[]'::jsonb),
            professional_ids = coalesce(p_professional_ids, '{}'), updated_at = now()
        where g.id = p_group_id and g.coach_id = p_coach_id
        returning * into v_group;
        if v_group.id is null then
            raise exception 'Grupo no encontrado.' using errcode = '42501';
        end if;
    end if;
    return v_group;
end;
$$;

-- Deja activos exactamente estos integrantes. Quien sale conserva su historial.
create or replace function public.studio_set_group_members(p_group_id uuid, p_client_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_group(p_group_id);
begin
    if exists (
        select 1 from unnest(p_client_ids) c (id)
        where not exists (select 1 from public.clients x where x.id = c.id and x.coach_id = v_coach_id)
    ) then
        raise exception 'Ese cliente no es de este espacio.' using errcode = '22023';
    end if;

    update public.training_group_members m
    set left_on = current_date
    where m.group_id = p_group_id and m.left_on is null and not (m.client_id = any (p_client_ids));

    insert into public.training_group_members (group_id, client_id)
    select p_group_id, c.id from unnest(p_client_ids) c (id)
    on conflict (group_id, client_id) do update set left_on = null, joined_on = current_date
    where public.training_group_members.left_on is not null;
end;
$$;

create or replace function public.studio_archive_group(p_group_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_group(p_group_id);
    update public.training_groups g set is_active = p_active, updated_at = now() where g.id = p_group_id;
end;
$$;

-- El grupo absorbido queda archivado y sus sesiones e integrantes pasan al otro.
create or replace function public.studio_merge_groups(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_group(p_source_id);
begin
    if p_source_id = p_target_id or public.studio_require_group(p_target_id) <> v_coach_id then
        raise exception 'Elige dos grupos distintos del mismo espacio.' using errcode = '22023';
    end if;

    update public.studio_sessions s set group_id = p_target_id where s.group_id = p_source_id;

    insert into public.training_group_members (group_id, client_id, joined_on, left_on, origin)
    select p_target_id, m.client_id, m.joined_on, m.left_on, m.origin
    from public.training_group_members m
    where m.group_id = p_source_id
    on conflict (group_id, client_id) do update
    set left_on = case when excluded.left_on is null then null else public.training_group_members.left_on end;

    update public.training_groups g
    set is_active = false, merged_into = p_target_id, updated_at = now()
    where g.id = p_source_id;
end;
$$;

-- Marca a mano quién vino. Manda sobre la agenda y recoloca las series de los ejercicios hechos.
create or replace function public.studio_set_attendance(p_session_id uuid, p_client_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session public.studio_sessions%rowtype;
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

    insert into public.studio_session_attendance (session_id, client_id, status, origin, marked_by)
    values (p_session_id, p_client_id, p_status, 'manual', auth.uid())
    on conflict (session_id, client_id) do update
    set status = excluded.status, origin = 'manual', marked_by = excluded.marked_by, marked_at = now();

    for v_item_id in select i.id from public.studio_session_items i where i.session_id = p_session_id loop
        perform public.studio_sync_sets(v_item_id);
    end loop;

    perform public.studio_log_event(
        v_session.coach_id, null, 'studio_session_attendance', p_session_id,
        jsonb_build_object('group_id', v_session.group_id, 'client_id_marked', p_client_id, 'status', p_status)
    );
end;
$$;

-- Los valores propios de una persona en un ejercicio del grupo.
create or replace function public.studio_save_person_values(
    p_item_id uuid, p_client_id uuid, p_version integer, p_fields jsonb, p_batch_id uuid default null
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
    perform public.studio_require_session(v_before.session_id);
    perform public.studio_check_version(p_version, v_before.version);
    if not exists (
        select 1 from public.studio_session_attendance a
        where a.session_id = v_before.session_id and a.client_id = p_client_id
    ) then
        raise exception 'Esa persona no está en esta sesión.' using errcode = '22023';
    end if;
    v_snapshot := public.studio_item_snapshot(p_item_id);

    insert into public.studio_item_people (item_id, client_id, load_kg, reps, time_seconds, rir, rpe, next_load, updated_by)
    values (
        p_item_id, p_client_id, (p_fields->>'load_kg')::numeric, nullif(btrim(p_fields->>'reps'), ''),
        (p_fields->>'time_seconds')::integer, (p_fields->>'rir')::numeric, (p_fields->>'rpe')::numeric,
        p_fields->>'next_load', auth.uid()
    )
    on conflict (item_id, client_id) do update
    set load_kg = excluded.load_kg, reps = excluded.reps, time_seconds = excluded.time_seconds,
        rir = excluded.rir, rpe = excluded.rpe, next_load = excluded.next_load,
        updated_by = excluded.updated_by, updated_at = now();

    update public.studio_session_items i
    set version = i.version + 1, updated_by = auth.uid(), updated_at = now()
    where i.id = p_item_id
    returning * into v_after;

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_log(v_before.coach_id, 'studio_session_items', p_item_id, v_snapshot, to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$$;

-- Por series, de una persona del grupo. Con una lista vacía vuelve a las heredadas.
create or replace function public.studio_save_person_sets(
    p_item_id uuid, p_client_id uuid, p_version integer, p_sets jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.studio_session_items%rowtype;
    v_after public.studio_session_items%rowtype;
    v_person public.studio_item_people%rowtype;
    v_snapshot jsonb;
begin
    select * into v_before from public.studio_session_items i where i.id = p_item_id for update;
    if v_before.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_session(v_before.session_id);
    perform public.studio_check_version(p_version, v_before.version);
    if not exists (
        select 1 from public.studio_session_attendance a
        where a.session_id = v_before.session_id and a.client_id = p_client_id and a.status = 'attended'
    ) then
        raise exception 'Solo tienen series quienes han venido.' using errcode = '22023';
    end if;
    v_snapshot := public.studio_item_snapshot(p_item_id);
    select * into v_person from public.studio_item_people p where p.item_id = p_item_id and p.client_id = p_client_id;

    delete from public.studio_session_sets s where s.item_id = p_item_id and s.client_id = p_client_id;

    insert into public.studio_session_sets (
        item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, is_detailed, recorded_by
    )
    select
        p_item_id, p_client_id, row_number() over (order by e.ord),
        coalesce((e.value->>'load_kg')::numeric, v_person.load_kg, v_before.load_kg),
        coalesce((e.value->>'reps')::integer, nullif(substring(coalesce(v_person.reps, v_before.reps, '') from '^\s*(\d+)'), '')::integer),
        coalesce((e.value->>'time_seconds')::integer, v_person.time_seconds, v_before.time_seconds),
        coalesce((e.value->>'rir')::numeric, v_person.rir, v_before.rir),
        coalesce((e.value->>'rpe')::numeric, v_person.rpe, v_before.rpe),
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

revoke all on function public.studio_require_group(uuid) from public, anon, authenticated;
revoke all on function public.studio_require_session(uuid) from public, anon, authenticated;
revoke all on function public.studio_require_scope(uuid) from public, anon, authenticated;
revoke all on function public.studio_create_like(uuid, date, time, uuid, text, uuid) from public, anon, authenticated;

revoke all on function public.studio_create_group_session(uuid, date, time, uuid, text, uuid) from public, anon;
revoke all on function public.studio_save_group(uuid, uuid, text, text, jsonb, uuid[]) from public, anon;
revoke all on function public.studio_set_group_members(uuid, uuid[]) from public, anon;
revoke all on function public.studio_archive_group(uuid, boolean) from public, anon;
revoke all on function public.studio_merge_groups(uuid, uuid) from public, anon;
revoke all on function public.studio_set_attendance(uuid, uuid, text) from public, anon;
revoke all on function public.studio_save_person_values(uuid, uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.studio_save_person_sets(uuid, uuid, integer, jsonb, uuid) from public, anon;

grant execute on function public.studio_create_group_session(uuid, date, time, uuid, text, uuid) to authenticated;
grant execute on function public.studio_save_group(uuid, uuid, text, text, jsonb, uuid[]) to authenticated;
grant execute on function public.studio_set_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.studio_archive_group(uuid, boolean) to authenticated;
grant execute on function public.studio_merge_groups(uuid, uuid) to authenticated;
grant execute on function public.studio_set_attendance(uuid, uuid, text) to authenticated;
grant execute on function public.studio_save_person_values(uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.studio_save_person_sets(uuid, uuid, integer, jsonb, uuid) to authenticated;
