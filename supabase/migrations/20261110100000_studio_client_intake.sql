-- Modo Sala: ficha y alta de clientes.
--
-- Objetivos del cliente por puntos, cumpleaños desde FisioTrack, y un alta que busca antes de crear:
-- en los clientes del espacio (también los de otros profesionales y los dados de baja) y en los
-- pacientes de FisioTrack sin vincular. Si ya existe, se usa ese perfil en lugar de duplicarlo.

alter table public.clients
    add column objectives text[] not null default '{}'
    check (cardinality(objectives) <= 12);

-- Nombre comparable: minúsculas, sin tildes ni signos, espacios simples.
create or replace function public.studio_name_key(p_name text)
returns text
language sql
immutable
set search_path to ''
as $$
    select btrim(regexp_replace(
        regexp_replace(
            translate(lower(coalesce(p_name, '')), 'áéíóúüàèìòùâêîôûäëïöç', 'aeiouuaeiouaeiouaeioc'),
            '[^a-z0-9ñ ]+', ' ', 'g'),
        '\s+', ' ', 'g'));
$$;

-- ¿Son la misma persona por el nombre? Igual, o todas las palabras del más corto (dos o más) en el otro.
create or replace function public.studio_same_person(p_a text, p_b text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $$
declare
    v_a text[] := string_to_array(public.studio_name_key(p_a), ' ');
    v_b text[] := string_to_array(public.studio_name_key(p_b), ' ');
    v_short text[];
    v_long text[];
begin
    if coalesce(array_length(v_a, 1), 0) = 0 or coalesce(array_length(v_b, 1), 0) = 0 then
        return false;
    end if;
    if v_a = v_b then
        return true;
    end if;
    if array_length(v_a, 1) <= array_length(v_b, 1) then
        v_short := v_a; v_long := v_b;
    else
        v_short := v_b; v_long := v_a;
    end if;
    return array_length(v_short, 1) >= 2 and v_short <@ v_long;
end;
$$;

-- Lo que hay que ver antes de dar de alta: quién puede crear en la sala.
create or replace function public.studio_require_intake(p_coach_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
    v_role text;
begin
    select cm.role into v_role
    from public.coach_memberships cm
    where cm.coach_id = p_coach_id and cm.user_id = auth.uid() and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach', 'reception');
    if v_role is null then
        raise exception 'No eres de este espacio.' using errcode = '42501';
    end if;
    if not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'Tu plan no incluye sala.' using errcode = '42501';
    end if;
    return v_role;
end;
$$;

-- Personas del espacio que se parecen a lo que se busca, aunque no las veas en tu lista:
-- clientes (con quién los lleva y si están de baja) y pacientes de FisioTrack sin vincular.
create or replace function public.studio_find_people(p_coach_id uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
    v_words text[] := string_to_array(public.studio_name_key(p_query), ' ');
    v_clients jsonb;
    v_patients jsonb;
begin
    perform public.studio_require_intake(p_coach_id);
    if length(public.studio_name_key(p_query)) < 2 then
        return jsonb_build_object('clients', '[]'::jsonb, 'patients', '[]'::jsonb);
    end if;

    select coalesce(jsonb_agg(row_data order by row_data->>'full_name'), '[]'::jsonb) into v_clients
    from (
        select jsonb_build_object(
            'id', c.id,
            'full_name', c.full_name,
            'active', c.status = 'active',
            'visible', public.can_access_client(c.id),
            'mine', exists (select 1 from public.client_professionals cp where cp.client_id = c.id and cp.user_id = auth.uid()),
            'professionals', (
                select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                from public.client_professionals cp join public.profiles p on p.id = cp.user_id
                where cp.client_id = c.id
            )
        ) as row_data
        from public.clients c
        where c.coach_id = p_coach_id
          and coalesce(c.is_sample, false) = false
          and (select bool_and(public.studio_name_key(c.full_name) like '%' || w || '%') from unnest(v_words) w)
        order by c.full_name
        limit 12
    ) found;

    select coalesce(jsonb_agg(row_data order by row_data->>'full_name'), '[]'::jsonb) into v_patients
    from (
        select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'birth_date', p.birth_date) as row_data
        from public.external_patients p
        where p.coach_id = p_coach_id
          and p.client_id is null
          and (select bool_and(public.studio_name_key(p.full_name) like '%' || w || '%') from unnest(v_words) w)
        order by p.full_name
        limit 8
    ) found;

    return jsonb_build_object('clients', v_clients, 'patients', v_patients);
end;
$$;

-- Usar un perfil que ya existe: si estaba de baja vuelve a estar activo y, si quien lo usa es
-- profesional, queda compartido con él. Recepción solo lo reactiva.
create or replace function public.studio_use_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_coach_id uuid;
    v_role text;
begin
    select c.coach_id into v_coach_id from public.clients c where c.id = p_client_id;
    if v_coach_id is null then
        raise exception 'Cliente no encontrado.' using errcode = '42501';
    end if;
    v_role := public.studio_require_intake(v_coach_id);

    update public.clients c
    set status = 'active', deactivated_at = null, updated_at = now()
    where c.id = p_client_id and c.status is distinct from 'active';

    if v_role <> 'reception' then
        insert into public.client_professionals (client_id, user_id, created_by)
        values (p_client_id, auth.uid(), auth.uid())
        on conflict do nothing;
    end if;
end;
$$;

-- Alta desde la sala. Sin p_force, si hay alguien que puede ser la misma persona (nombre, email o
-- teléfono), no crea nada y devuelve a quién se parece. Con paciente de FisioTrack, lo vincula.
create or replace function public.studio_create_client(
    p_coach_id uuid,
    p_full_name text,
    p_email text default null,
    p_phone text default null,
    p_birthday date default null,
    p_patient_id uuid default null,
    p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_role text;
    v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
    v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
    v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
    v_digits text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9), '');
    v_patient public.external_patients%rowtype;
    v_matches jsonb;
    v_client uuid;
begin
    v_role := public.studio_require_intake(p_coach_id);
    if length(v_name) < 2 or length(v_name) > 120 then
        raise exception 'Escribe el nombre y los apellidos.' using errcode = '22023';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'El email no es válido.' using errcode = '22023';
    end if;
    if p_birthday is not null and (p_birthday > current_date or p_birthday < date '1900-01-01') then
        raise exception 'La fecha de nacimiento no es válida.' using errcode = '22023';
    end if;

    if p_patient_id is not null then
        select * into v_patient from public.external_patients p where p.id = p_patient_id and p.coach_id = p_coach_id;
        if v_patient.id is null then
            raise exception 'Ese paciente no es de este espacio.' using errcode = '22023';
        end if;
        if v_patient.client_id is not null then
            return jsonb_build_object('status', 'linked', 'client_id', v_patient.client_id);
        end if;
        v_email := coalesce(v_email, nullif(lower(btrim(coalesce(v_patient.email, ''))), ''));
        v_phone := coalesce(v_phone, nullif(btrim(coalesce(v_patient.phone, '')), ''));
        v_digits := coalesce(v_digits, nullif(right(regexp_replace(coalesce(v_patient.phone, ''), '\D', '', 'g'), 9), ''));
    end if;

    if not p_force then
        select jsonb_agg(jsonb_build_object(
                'id', c.id,
                'full_name', c.full_name,
                'active', c.status = 'active',
                'visible', public.can_access_client(c.id),
                'reason', case
                    when v_email is not null and lower(c.email) = v_email then 'email'
                    when v_digits is not null and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_digits then 'phone'
                    else 'name' end,
                'professionals', (
                    select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                    from public.client_professionals cp join public.profiles p on p.id = cp.user_id
                    where cp.client_id = c.id
                )
            ) order by c.full_name)
        into v_matches
        from public.clients c
        where c.coach_id = p_coach_id
          and coalesce(c.is_sample, false) = false
          and (
              public.studio_same_person(c.full_name, v_name)
              or (v_email is not null and lower(c.email) = v_email)
              or (v_digits is not null and length(v_digits) >= 9
                  and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_digits)
          );
        if v_matches is not null then
            return jsonb_build_object('status', 'duplicates', 'matches', v_matches);
        end if;
    end if;

    insert into public.clients (coach_id, full_name, email, phone, birthday, status, start_date)
    values (p_coach_id, v_name, v_email, v_phone, coalesce(p_birthday, v_patient.birth_date), 'active', current_date)
    returning id into v_client;

    if v_role <> 'reception' then
        insert into public.client_professionals (client_id, user_id, created_by)
        values (v_client, auth.uid(), auth.uid());
    end if;

    if v_patient.id is not null then
        perform public.agenda_link_patient(v_patient.id, v_client);
    end if;

    return jsonb_build_object('status', 'created', 'client_id', v_client);
end;
$$;

-- Ficha: objetivos por puntos y cumpleaños.
create or replace function public.studio_save_client_profile(p_client_id uuid, p_objectives text[], p_birthday date)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_points text[];
begin
    perform public.studio_require_client(p_client_id);
    if p_birthday is not null and (p_birthday > current_date or p_birthday < date '1900-01-01') then
        raise exception 'La fecha de nacimiento no es válida.' using errcode = '22023';
    end if;
    select coalesce(array_agg(left(btrim(point), 200) order by position), '{}')
    into v_points
    from unnest(coalesce(p_objectives, '{}')) with ordinality as entry (point, position)
    where btrim(point) <> '';
    if cardinality(v_points) > 12 then
        raise exception 'Como mucho 12 objetivos.' using errcode = '22023';
    end if;

    update public.clients c
    set objectives = v_points, birthday = p_birthday, updated_at = now()
    where c.id = p_client_id;
end;
$$;

-- Vincular o desvincular el paciente de FisioTrack desde la ficha: un paciente por cliente.
create or replace function public.studio_link_patient(p_client_id uuid, p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_coach_id uuid;
    v_old uuid;
begin
    v_coach_id := public.studio_require_client(p_client_id);
    if p_patient_id is not null and not exists (
        select 1 from public.external_patients p
        where p.id = p_patient_id and p.coach_id = v_coach_id and (p.client_id is null or p.client_id = p_client_id)
    ) then
        raise exception 'Ese paciente ya está vinculado con otro cliente.' using errcode = '22023';
    end if;

    for v_old in
        select p.id from public.external_patients p
        where p.client_id = p_client_id and p.id is distinct from p_patient_id
    loop
        perform public.agenda_link_patient(v_old, null);
    end loop;
    if p_patient_id is not null then
        perform public.agenda_link_patient(p_patient_id, p_client_id);
    end if;
end;
$$;

revoke all on function public.studio_require_intake(uuid) from public, anon;
revoke all on function public.studio_find_people(uuid, text) from public, anon;
revoke all on function public.studio_use_client(uuid) from public, anon;
revoke all on function public.studio_create_client(uuid, text, text, text, date, uuid, boolean) from public, anon;
revoke all on function public.studio_save_client_profile(uuid, text[], date) from public, anon;
revoke all on function public.studio_link_patient(uuid, uuid) from public, anon;
grant execute on function public.studio_find_people(uuid, text) to authenticated;
grant execute on function public.studio_use_client(uuid) to authenticated;
grant execute on function public.studio_create_client(uuid, text, text, text, date, uuid, boolean) to authenticated;
grant execute on function public.studio_save_client_profile(uuid, text[], date) to authenticated;
grant execute on function public.studio_link_patient(uuid, uuid) to authenticated;

-- Cumpleaños que ya trae FisioTrack de los clientes vinculados.
update public.clients c
set birthday = p.birth_date
from public.external_patients p
where p.client_id = c.id and c.birthday is null and p.birth_date is not null;
