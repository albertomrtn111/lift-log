-- Modo Sala F0-5: biblioteca de cada espacio.
--
-- El historial y la analítica siguen yendo por el ejercicio del catálogo. La biblioteca solo
-- decide qué ejercicios usa el espacio, cómo los llama y en qué orden salen.

create table public.workspace_exercises (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    catalog_exercise_id uuid not null references public.exercise_catalog (id) on delete restrict,
    short_name text check (short_name is null or length(btrim(short_name)) between 1 and 60),
    group_title text check (group_title is null or length(btrim(group_title)) between 1 and 60),
    default_sets integer check (default_sets is null or default_sets between 1 and 20),
    default_reps text check (default_reps is null or length(btrim(default_reps)) between 1 and 20),
    -- Sin orden manual, el ejercicio va al final de su bloque, por nombre.
    sort_order integer,
    is_hidden boolean not null default false,
    added_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (coach_id, catalog_exercise_id)
);

create index workspace_exercises_catalog_idx on public.workspace_exercises (catalog_exercise_id);

create trigger trg_workspace_exercises_updated_at
    before update on public.workspace_exercises
    for each row execute function public.set_updated_at();

-- Solo hay fila para los bloques que el espacio ha cambiado.
create table public.workspace_blocks (
    coach_id uuid not null references public.coaches (id) on delete cascade,
    block_key text not null references public.exercise_blocks (key) on update cascade,
    display_name text check (display_name is null or length(btrim(display_name)) between 1 and 60),
    group_title text check (group_title is null or length(btrim(group_title)) between 1 and 60),
    default_sets integer check (default_sets is null or default_sets between 1 and 20),
    default_reps text check (default_reps is null or length(btrim(default_reps)) between 1 and 20),
    sort_order integer,
    is_hidden boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (coach_id, block_key)
);

create trigger trg_workspace_blocks_updated_at
    before update on public.workspace_blocks
    for each row execute function public.set_updated_at();

alter table public.workspace_exercises enable row level security;
alter table public.workspace_blocks enable row level security;

-- Cualquier profesional añade ejercicios; nombres, orden y ocultar son del propietario y el administrador.
create policy workspace_exercises_member_read on public.workspace_exercises
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy workspace_exercises_member_insert on public.workspace_exercises
    for insert to authenticated
    with check (public.is_coach_member(coach_id));

create policy workspace_exercises_admin_update on public.workspace_exercises
    for update to authenticated
    using (public.is_coach_admin(coach_id))
    with check (public.is_coach_admin(coach_id));

create policy workspace_exercises_admin_delete on public.workspace_exercises
    for delete to authenticated
    using (public.is_coach_admin(coach_id));

create policy workspace_blocks_member_read on public.workspace_blocks
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy workspace_blocks_admin_all on public.workspace_blocks
    for all to authenticated
    using (public.is_coach_admin(coach_id))
    with check (public.is_coach_admin(coach_id));

-- Qué clientes tienen datos con un ejercicio de la biblioteca, antes de quitarlo.
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
        select
            c.id,
            c.full_name as name,
            count(distinct p.id) as programs,
            count(s.id) filter (where s.completed) as completed_sets
        from public.training_exercises t
        join public.training_programs p on p.id = t.program_id
        join public.clients c on c.id = p.client_id
        left join public.training_exercise_sets s on s.exercise_id = t.id
        where t.coach_id = v_entry.coach_id
          and t.catalog_exercise_id = v_entry.catalog_exercise_id
        group by c.id, c.full_name
    ) u;

    select count(*) into v_templates
    from public.training_templates t
    where t.coach_id = v_entry.coach_id
      and t.structure::text like '%' || v_entry.catalog_exercise_id::text || '%';

    return jsonb_build_object('clients', v_clients, 'templates', v_templates);
end;
$$;

-- Quita un ejercicio de la biblioteca. Los datos de los clientes se quedan donde están, salvo
-- que se elija otro ejercicio: entonces pasan a él, solo en este espacio, y entra en la biblioteca.
create or replace function public.remove_workspace_exercise(p_entry_id uuid, p_target_catalog_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_entry public.workspace_exercises%rowtype;
    v_exercises integer := 0;
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

    return jsonb_build_object('exercises', v_exercises, 'templates', v_templates);
end;
$$;

-- La fusión también mueve las bibliotecas. Si un espacio tenía los dos, se queda la entrada del bueno.
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

    return jsonb_build_object('exercises', v_exercises, 'templates', v_templates);
end;
$$;

revoke all on function public.workspace_exercise_usage(uuid) from public, anon;
revoke all on function public.remove_workspace_exercise(uuid, uuid) from public, anon;

grant execute on function public.workspace_exercise_usage(uuid) to authenticated;
grant execute on function public.remove_workspace_exercise(uuid, uuid) to authenticated;
