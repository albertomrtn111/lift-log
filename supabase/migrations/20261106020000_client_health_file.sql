-- Modo Sala F1-9: lo que el profesional debe tener presente antes de entrenar a un cliente.
--
-- Son datos de salud y van aparte de la ficha general, para que sus permisos no dependan de ella:
-- los ven quienes pueden ver el entrenamiento del cliente, ni recepción ni el atleta.
-- No salen en informes, y ninguna herramienta de la IA los lee.

create table public.client_injuries (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    region text not null check (length(btrim(region)) between 1 and 40),
    structure text check (structure is null or length(structure) <= 120),
    detail text check (detail is null or length(detail) <= 1000),
    occurred text check (occurred is null or length(occurred) <= 80),
    status text not null default 'active' check (status in ('active', 'past')),
    version integer not null default 1,
    created_by uuid references public.profiles (id) on delete set null,
    updated_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index client_injuries_client_idx on public.client_injuries (client_id);

create table public.client_notes_relevant (
    client_id uuid primary key references public.clients (id) on delete cascade,
    coach_id uuid not null references public.coaches (id) on delete cascade,
    note text not null check (length(note) <= 5000),
    version integer not null default 1,
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now()
);

-- Registro de cambios de estos datos. Se va con el cliente.
create table public.client_health_log (
    id bigint generated always as identity primary key,
    coach_id uuid not null references public.coaches (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    table_name text not null,
    row_id uuid not null,
    before_data jsonb,
    after_data jsonb,
    actor_id uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index client_health_log_client_idx on public.client_health_log (client_id, created_at desc);

alter table public.client_injuries enable row level security;
alter table public.client_notes_relevant enable row level security;
alter table public.client_health_log enable row level security;

-- Solo lectura: las escrituras van por las funciones.
create policy client_injuries_read on public.client_injuries
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy client_notes_relevant_read on public.client_notes_relevant
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy client_health_log_read on public.client_health_log
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create or replace function public.studio_save_injury(
    p_client_id uuid, p_injury_id uuid, p_version integer, p_fields jsonb
)
returns public.client_injuries
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
    v_before public.client_injuries%rowtype;
    v_after public.client_injuries%rowtype;
begin
    if p_injury_id is null then
        insert into public.client_injuries (coach_id, client_id, region, structure, detail, occurred, status, created_by, updated_by)
        values (
            v_coach_id, p_client_id, p_fields->>'region', nullif(btrim(p_fields->>'structure'), ''),
            nullif(btrim(p_fields->>'detail'), ''), nullif(btrim(p_fields->>'occurred'), ''),
            coalesce(p_fields->>'status', 'active'), auth.uid(), auth.uid()
        )
        returning * into v_after;
    else
        select * into v_before from public.client_injuries i
        where i.id = p_injury_id and i.client_id = p_client_id for update;
        if v_before.id is null then
            raise exception 'Lesión no encontrada.' using errcode = '42501';
        end if;
        perform public.studio_check_version(p_version, v_before.version);

        update public.client_injuries i
        set region = coalesce(p_fields->>'region', i.region),
            structure = nullif(btrim(p_fields->>'structure'), ''),
            detail = nullif(btrim(p_fields->>'detail'), ''),
            occurred = nullif(btrim(p_fields->>'occurred'), ''),
            status = coalesce(p_fields->>'status', i.status),
            version = i.version + 1,
            updated_by = auth.uid(),
            updated_at = now()
        where i.id = p_injury_id
        returning * into v_after;
    end if;

    insert into public.client_health_log (coach_id, client_id, table_name, row_id, before_data, after_data, actor_id)
    values (
        v_coach_id, p_client_id, 'client_injuries', v_after.id,
        case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_after), auth.uid()
    );
    return v_after;
end;
$$;

create or replace function public.studio_delete_injury(p_injury_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_before public.client_injuries%rowtype;
begin
    select * into v_before from public.client_injuries i where i.id = p_injury_id for update;
    if v_before.id is null then
        raise exception 'Lesión no encontrada.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_before.client_id);
    perform public.studio_check_version(p_version, v_before.version);

    delete from public.client_injuries i where i.id = p_injury_id;

    insert into public.client_health_log (coach_id, client_id, table_name, row_id, before_data, actor_id)
    values (v_before.coach_id, v_before.client_id, 'client_injuries', p_injury_id, to_jsonb(v_before), auth.uid());
end;
$$;

create or replace function public.studio_save_relevant_note(p_client_id uuid, p_version integer, p_note text)
returns public.client_notes_relevant
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
    v_before public.client_notes_relevant%rowtype;
    v_after public.client_notes_relevant%rowtype;
begin
    select * into v_before from public.client_notes_relevant n where n.client_id = p_client_id for update;
    if v_before.client_id is not null then
        perform public.studio_check_version(p_version, v_before.version);
    end if;

    insert into public.client_notes_relevant (client_id, coach_id, note, updated_by)
    values (p_client_id, v_coach_id, coalesce(btrim(p_note), ''), auth.uid())
    on conflict (client_id) do update
    set note = excluded.note,
        version = public.client_notes_relevant.version + 1,
        updated_by = excluded.updated_by,
        updated_at = now()
    returning * into v_after;

    insert into public.client_health_log (coach_id, client_id, table_name, row_id, before_data, after_data, actor_id)
    values (
        v_coach_id, p_client_id, 'client_notes_relevant', p_client_id,
        case when v_before.client_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after), auth.uid()
    );
    return v_after;
end;
$$;

revoke all on function public.studio_save_injury(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.studio_delete_injury(uuid, integer) from public, anon;
revoke all on function public.studio_save_relevant_note(uuid, integer, text) from public, anon;

grant execute on function public.studio_save_injury(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.studio_delete_injury(uuid, integer) to authenticated;
grant execute on function public.studio_save_relevant_note(uuid, integer, text) to authenticated;
