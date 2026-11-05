-- Modo Sala F1-8: cómo ve cada cliente su cuadrícula y títulos de sesión con título superior.

-- Lo que el profesional elige para un cliente manda sobre lo automático y sobre lo del espacio.
create table public.client_block_prefs (
    client_id uuid not null references public.clients (id) on delete cascade,
    block_key text not null references public.exercise_blocks (key) on delete cascade,
    collapsed boolean,
    sort_order integer,
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (client_id, block_key)
);

alter table public.client_block_prefs enable row level security;

create policy client_block_prefs_read on public.client_block_prefs
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create or replace function public.studio_set_block_collapsed(p_client_id uuid, p_block_key text, p_collapsed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_client(p_client_id);
    insert into public.client_block_prefs (client_id, block_key, collapsed, updated_by)
    values (p_client_id, p_block_key, p_collapsed, auth.uid())
    on conflict (client_id, block_key) do update
    set collapsed = excluded.collapsed, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Orden de los bloques solo para este cliente.
create or replace function public.studio_set_block_order(p_client_id uuid, p_block_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_client(p_client_id);
    insert into public.client_block_prefs (client_id, block_key, sort_order, updated_by)
    select p_client_id, k.key, k.ord * 10, auth.uid()
    from unnest(p_block_keys) with ordinality k (key, ord)
    on conflict (client_id, block_key) do update
    set sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Bloques que alguien del espacio ha usado en las últimas cuatro semanas.
create or replace function public.studio_recent_blocks(p_coach_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_coach_member(p_coach_id) then
        raise exception 'No tienes acceso a este espacio.' using errcode = '42501';
    end if;
    return (
        select coalesce(array_agg(distinct c.block_key), '{}')
        from public.studio_session_items i
        join public.studio_sessions s on s.id = i.session_id
        join public.exercise_catalog c on c.id = i.catalog_exercise_id
        where s.coach_id = p_coach_id
          and s.session_date >= current_date - 28
          and c.block_key is not null
    );
end;
$$;

-- Título superior de un subbloque: FUERZA › Bloque 1.
create or replace function public.studio_set_section_parent(p_section_id uuid, p_parent_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_section public.studio_session_sections%rowtype;
    v_coach_id uuid;
begin
    select * into v_section from public.studio_session_sections x where x.id = p_section_id;
    if v_section.id is null then
        raise exception 'Subbloque no encontrado.' using errcode = '42501';
    end if;
    v_coach_id := public.studio_require_client(v_section.client_id);

    update public.studio_session_sections x
    set parent_title = nullif(btrim(p_parent_title), '')
    where x.id = p_section_id
    returning * into v_section;

    perform public.studio_log_event(v_coach_id, v_section.client_id, 'studio_session_sections', p_section_id, to_jsonb(v_section));
end;
$$;

revoke all on function public.studio_set_block_collapsed(uuid, text, boolean) from public, anon;
revoke all on function public.studio_set_block_order(uuid, text[]) from public, anon;
revoke all on function public.studio_recent_blocks(uuid) from public, anon;
revoke all on function public.studio_set_section_parent(uuid, text) from public, anon;

grant execute on function public.studio_set_block_collapsed(uuid, text, boolean) to authenticated;
grant execute on function public.studio_set_block_order(uuid, text[]) to authenticated;
grant execute on function public.studio_recent_blocks(uuid) to authenticated;
grant execute on function public.studio_set_section_parent(uuid, text) to authenticated;
