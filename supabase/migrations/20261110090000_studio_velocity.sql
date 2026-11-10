-- Modo Sala F3: velocidad de la barra y ecuaciones carga-velocidad.
--
-- La velocidad se apunta en la celda, en cada persona de un grupo y en cada serie. Las series que llegan
-- de My Jump guardan además la velocidad de cada repetición. La velocidad no se hereda: una serie sin
-- medir se queda sin velocidad, para que el perfil carga-velocidad solo use lo medido.

alter table public.studio_session_items
    add column velocity_ms numeric(4, 2) check (velocity_ms > 0 and velocity_ms <= 15);

alter table public.studio_item_people
    add column velocity_ms numeric(4, 2) check (velocity_ms > 0 and velocity_ms <= 15);

alter table public.studio_session_sets
    add column velocity_ms numeric(4, 2) check (velocity_ms > 0 and velocity_ms <= 15),
    add column rep_detail jsonb check (jsonb_typeof(rep_detail) = 'array' and jsonb_array_length(rep_detail) <= 60),
    add column source text check (source in ('my_jump', 'my_jump_image'));

comment on column public.studio_session_sets.rep_detail is
    'Repeticiones medidas: [{mpv, mv, pv, rom}] en m/s y cm.';

-- %1RM = a·V² + b·V + c, con el tipo de velocidad con el que se hizo la ecuación.
create table public.exercise_vbt_equations (
    catalog_exercise_id uuid primary key references public.exercise_catalog (id) on delete cascade,
    a numeric not null,
    b numeric not null,
    c numeric not null,
    velocity_type text not null check (velocity_type in ('mpv', 'mv')),
    source text not null,
    created_at timestamptz not null default now()
);

alter table public.exercise_vbt_equations enable row level security;

create policy "exercise_vbt_equations_read" on public.exercise_vbt_equations
    for select to authenticated using (true);

revoke all on public.exercise_vbt_equations from anon;
revoke insert, update, delete, truncate on public.exercise_vbt_equations from authenticated;

insert into public.exercise_vbt_equations (catalog_exercise_id, a, b, c, velocity_type, source)
select v.id, v.a, v.b, v.c, v.kind, v.source
from (values
    ('b9c80fb2-7e54-4d8b-80eb-b837d35aeacf'::uuid, 0, -62.893, 121.962, 'mpv', 'Ecuación del centro ClubØ (VMP)'),
    ('f80076f3-a2fa-4f95-ad30-ad2a554dd8a4'::uuid, 0, -62.893, 121.962, 'mpv', 'Ecuación del centro ClubØ (VMP)'),
    ('bbbfa15c-51ab-4224-b504-77a492f42336'::uuid, 0, -115.1, 127.6, 'mv', 'Liao et al. 2023 (PeerJ), búlgara con peso libre, velocidad media'),
    ('1b404b7d-29a4-46a2-bea7-b4b1fbe1136d'::uuid, 0, -115.1, 127.6, 'mv', 'Liao et al. 2023 (PeerJ), búlgara con peso libre, velocidad media'),
    ('d2d8045c-a4fc-4b7d-b579-2400d047f534'::uuid, 19.472, -99.908, 124.452, 'mpv', 'Morán-Navarro et al. 2021 (Eur J Sport Sci), VMP'),
    ('df68202d-2839-4483-b202-6440ebdd9f60'::uuid, 19.472, -99.908, 124.452, 'mpv', 'Provisional: la del peso muerto (Morán-Navarro et al. 2021, VMP)'),
    ('14928b92-17bd-49a0-aca8-952e9354c7b6'::uuid, 11.74, -82.96, 115.6, 'mpv', 'Martínez-Cava et al. 2019 (JSSM), recorrido completo, VMP'),
    ('9f40febe-682b-4861-9d8e-51f5350b024b'::uuid, 0, -83.333, 120.0, 'mpv', 'Ecuación del centro ClubØ (VMP)'),
    ('0cf48c69-5b86-4832-948f-ca58cffa1a64'::uuid, 0, -71.942, 136.957, 'mpv', 'Ecuación del centro ClubØ (VMP)'),
    ('e149b4ef-540a-4f0f-9bf7-0172fc1569a7'::uuid, 0, -57.471, 112.431, 'mpv', 'Ecuación del centro ClubØ (VMP)'),
    ('a3a8a30c-a0d3-4d1b-b461-c6369ee34d34'::uuid, 0, -57.471, 112.431, 'mpv', 'Provisional: la de la dominada prona (ecuación del centro ClubØ, VMP)'),
    ('b7c72013-8311-4fd6-89d8-8e1d1d564c4e'::uuid, 0, -57.471, 112.431, 'mpv', 'Provisional: la de la dominada prona (ecuación del centro ClubØ, VMP)')
) as v (id, a, b, c, kind, source)
join public.exercise_catalog c on c.id = v.id;

-- Celda: la velocidad entra con lo demás.
create or replace function public.studio_save_item(
    p_session_id uuid, p_item_id uuid, p_version integer, p_fields jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path to ''
as $function$
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
    perform public.studio_require_session(p_session_id);

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
        velocity_ms = case when p_fields ? 'velocity_ms' then (p_fields->>'velocity_ms')::numeric else i.velocity_ms end,
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
$function$;

-- Series de un cliente: la velocidad y las repeticiones medidas no se heredan.
create or replace function public.studio_save_sets(
    p_item_id uuid, p_version integer, p_sets jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path to ''
as $function$
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
        item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
        velocity_ms, rep_detail, source, is_detailed, recorded_by
    )
    select
        v_before.id, v_before.client_id, row_number() over (order by e.ord),
        coalesce((e.value->>'load_kg')::numeric, v_before.load_kg),
        coalesce((e.value->>'reps')::integer, nullif(substring(coalesce(v_before.reps, '') from '^\s*(\d+)'), '')::integer),
        coalesce((e.value->>'time_seconds')::integer, v_before.time_seconds),
        coalesce((e.value->>'rir')::numeric, v_before.rir),
        coalesce((e.value->>'rpe')::numeric, v_before.rpe),
        (e.value->>'velocity_ms')::numeric,
        nullif(e.value->'rep_detail', 'null'::jsonb),
        e.value->>'source',
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
$function$;

-- Series de una persona en un grupo, igual.
create or replace function public.studio_save_person_sets(
    p_item_id uuid, p_client_id uuid, p_version integer, p_sets jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path to ''
as $function$
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
        item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe,
        velocity_ms, rep_detail, source, is_detailed, recorded_by
    )
    select
        p_item_id, p_client_id, row_number() over (order by e.ord),
        coalesce((e.value->>'load_kg')::numeric, v_person.load_kg, v_before.load_kg),
        coalesce((e.value->>'reps')::integer, nullif(substring(coalesce(v_person.reps, v_before.reps, '') from '^\s*(\d+)'), '')::integer),
        coalesce((e.value->>'time_seconds')::integer, v_person.time_seconds, v_before.time_seconds),
        coalesce((e.value->>'rir')::numeric, v_person.rir, v_before.rir),
        coalesce((e.value->>'rpe')::numeric, v_person.rpe, v_before.rpe),
        (e.value->>'velocity_ms')::numeric,
        nullif(e.value->'rep_detail', 'null'::jsonb),
        e.value->>'source',
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
$function$;

-- Valores propios de una persona en un grupo, con su velocidad.
create or replace function public.studio_save_person_values(
    p_item_id uuid, p_client_id uuid, p_version integer, p_fields jsonb, p_batch_id uuid default null
)
returns public.studio_session_items
language plpgsql
security definer
set search_path to ''
as $function$
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

    insert into public.studio_item_people (
        item_id, client_id, load_kg, reps, time_seconds, rir, rpe, velocity_ms, next_load, updated_by
    )
    values (
        p_item_id, p_client_id, (p_fields->>'load_kg')::numeric, nullif(btrim(p_fields->>'reps'), ''),
        (p_fields->>'time_seconds')::integer, (p_fields->>'rir')::numeric, (p_fields->>'rpe')::numeric,
        (p_fields->>'velocity_ms')::numeric, p_fields->>'next_load', auth.uid()
    )
    on conflict (item_id, client_id) do update
    set load_kg = excluded.load_kg, reps = excluded.reps, time_seconds = excluded.time_seconds,
        rir = excluded.rir, rpe = excluded.rpe, velocity_ms = excluded.velocity_ms, next_load = excluded.next_load,
        updated_by = excluded.updated_by, updated_at = now();

    update public.studio_session_items i
    set version = i.version + 1, updated_by = auth.uid(), updated_at = now()
    where i.id = p_item_id
    returning * into v_after;

    perform public.studio_sync_sets(p_item_id);
    perform public.studio_log(v_before.coach_id, 'studio_session_items', p_item_id, v_snapshot, to_jsonb(v_after), p_batch_id);
    return v_after;
end;
$function$;

-- Deshacer devuelve también la velocidad y lo medido en cada serie.
create or replace function public.studio_restore_item(p_data jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_item public.studio_session_items%rowtype;
begin
    v_item := jsonb_populate_record(null::public.studio_session_items, p_data - 'tags' - 'set_rows' - 'people');

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
