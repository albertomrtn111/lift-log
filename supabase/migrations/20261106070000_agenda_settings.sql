-- Modo Sala F4-2: conectar la agenda y decidir qué servicios crean sesión.
--
-- Solo propietario y administrador. El token va a Vault y no se puede volver a leer desde la web.

create or replace function public.agenda_require_admin(p_coach_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_coach_admin(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'Solo el propietario y los administradores gestionan las integraciones.' using errcode = '42501';
    end if;
end;
$$;

create or replace function public.agenda_connect(p_coach_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text := 'agenda_fisiotrack_' || p_coach_id;
    v_secret_id uuid;
begin
    perform public.agenda_require_admin(p_coach_id);
    if length(btrim(coalesce(p_token, ''))) < 10 then
        raise exception 'Ese token no es válido.' using errcode = '22023';
    end if;

    select s.id into v_secret_id from vault.secrets s where s.name = v_name;
    if v_secret_id is null then
        perform vault.create_secret(btrim(p_token), v_name);
    else
        perform vault.update_secret(v_secret_id, btrim(p_token));
    end if;

    insert into public.external_connections (coach_id, provider, status, vault_secret_name)
    values (p_coach_id, 'fisiotrack', 'active', v_name)
    on conflict (coach_id, provider) do update
    set status = 'active', vault_secret_name = excluded.vault_secret_name, last_error = null, updated_at = now();

    insert into public.agenda_settings (coach_id, mode) values (p_coach_id, 'connected')
    on conflict (coach_id) do update set mode = 'connected', updated_at = now();
end;
$$;

-- Lo sincronizado y las sesiones se quedan: solo deja de leer y se borra el token.
create or replace function public.agenda_disconnect(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.agenda_require_admin(p_coach_id);
    delete from vault.secrets s where s.name = 'agenda_fisiotrack_' || p_coach_id;
    update public.external_connections c
    set status = 'disconnected', vault_secret_name = null, updated_at = now()
    where c.coach_id = p_coach_id;
    update public.agenda_settings a set mode = 'none', updated_at = now() where a.coach_id = p_coach_id;
end;
$$;

create or replace function public.agenda_update_service(
    p_service_id uuid, p_kind text, p_group_mode text, p_creates_session boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid;
begin
    select s.coach_id into v_coach_id from public.agenda_services s where s.id = p_service_id;
    if v_coach_id is null then
        raise exception 'Servicio no encontrado.' using errcode = '42501';
    end if;
    perform public.agenda_require_admin(v_coach_id);
    update public.agenda_services s
    set kind = p_kind, group_mode = p_group_mode, creates_session = p_creates_session,
        classified_by = auth.uid(), updated_at = now()
    where s.id = p_service_id;
end;
$$;

create or replace function public.agenda_map_staff(p_coach_id uuid, p_external_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.agenda_require_admin(p_coach_id);
    perform public.studio_require_professional(p_coach_id, p_user_id);
    update public.external_staff_map m
    set user_id = p_user_id, updated_at = now()
    where m.coach_id = p_coach_id and m.provider = 'fisiotrack' and m.external_id = p_external_id;
    update public.agenda_appointments a
    set professional_id = p_user_id, updated_at = now()
    where a.coach_id = p_coach_id and a.external_staff_id = p_external_id and a.starts_at >= now();
end;
$$;

-- Vincula o desvincula un paciente externo con un cliente, y se trae su fecha de nacimiento.
create or replace function public.agenda_link_patient(p_patient_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_patient public.external_patients%rowtype;
begin
    select * into v_patient from public.external_patients p where p.id = p_patient_id;
    if v_patient.id is null or not public.is_coach_member(v_patient.coach_id) then
        raise exception 'Paciente no encontrado.' using errcode = '42501';
    end if;
    if p_client_id is not null and not exists (
        select 1 from public.clients c where c.id = p_client_id and c.coach_id = v_patient.coach_id
    ) then
        raise exception 'Ese cliente no es de este espacio.' using errcode = '22023';
    end if;

    update public.external_patients p set client_id = p_client_id, updated_at = now() where p.id = p_patient_id;
    update public.agenda_appointments a set client_id = p_client_id, updated_at = now()
    where a.external_patient_id = p_patient_id;
    if p_client_id is not null and v_patient.birth_date is not null then
        update public.clients c set birthday = coalesce(c.birthday, v_patient.birth_date) where c.id = p_client_id;
    end if;
end;
$$;

revoke all on function public.agenda_require_admin(uuid) from public, anon, authenticated;
revoke all on function public.agenda_connect(uuid, text) from public, anon;
revoke all on function public.agenda_disconnect(uuid) from public, anon;
revoke all on function public.agenda_update_service(uuid, text, text, boolean) from public, anon;
revoke all on function public.agenda_map_staff(uuid, text, uuid) from public, anon;
revoke all on function public.agenda_link_patient(uuid, uuid) from public, anon;

grant execute on function public.agenda_connect(uuid, text) to authenticated;
grant execute on function public.agenda_disconnect(uuid) to authenticated;
grant execute on function public.agenda_update_service(uuid, text, text, boolean) to authenticated;
grant execute on function public.agenda_map_staff(uuid, text, uuid) to authenticated;
grant execute on function public.agenda_link_patient(uuid, uuid) to authenticated;
