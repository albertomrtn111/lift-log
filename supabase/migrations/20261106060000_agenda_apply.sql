-- Modo Sala F4-3 y F2-2: de las citas a las sesiones.
--
-- Las reglas leen la capa de agenda, sin saber de dónde vino la cita. Dos o más citas a la misma
-- hora con el mismo profesional en un servicio de clase son una sesión de grupo; una sola, una
-- sesión individual. Lo registrado nunca se toca, y lo marcado a mano manda sobre la agenda.

alter table public.training_groups add column auto_key text;

create unique index training_groups_auto_key_idx
    on public.training_groups (coach_id, auto_key) where auto_key is not null;

create or replace function public.agenda_apply(p_coach_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_zone constant text := 'Europe/Madrid';
    v_weekdays constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    v_row record;
    v_slot record;
    v_client_id uuid;
    v_session_id uuid;
    v_group_id uuid;
    v_local timestamp;
    v_key text;
    v_name text;
    v_clients integer := 0;
    v_sessions integer := 0;
    v_classes integer := 0;
    v_changed integer := 0;
begin
    -- Alta automática: quien tiene cita de un servicio con sesión ya es cliente del centro.
    for v_row in
        select distinct p.id, p.full_name, p.email, p.phone, p.birth_date
        from public.external_patients p
        join public.agenda_appointments a on a.external_patient_id = p.id and a.deleted_at is null
        left join public.agenda_services s on s.id = a.service_id
        where p.coach_id = p_coach_id
          and p.client_id is null
          and coalesce(s.creates_session, true)
    loop
        select c.id into v_client_id
        from public.clients c
        where c.coach_id = p_coach_id
          and v_row.email is not null
          and lower(c.email) = lower(v_row.email)
        limit 1;

        if v_client_id is null then
            insert into public.clients (coach_id, full_name, email, phone, birthday)
            values (p_coach_id, v_row.full_name, v_row.email, v_row.phone, v_row.birth_date)
            returning id into v_client_id;
            v_clients := v_clients + 1;
        end if;
        update public.external_patients p set client_id = v_client_id where p.id = v_row.id;
    end loop;

    update public.agenda_appointments a
    set client_id = p.client_id
    from public.external_patients p
    where a.external_patient_id = p.id
      and a.coach_id = p_coach_id
      and a.client_id is distinct from p.client_id;

    -- Citas que ya tienen sesión y han cambiado.
    for v_row in
        select a.*, s.client_id as session_client, s.group_id as session_group, s.status as session_status,
               exists (select 1 from public.studio_session_items i where i.session_id = s.id) as has_items,
               exists (select 1 from public.studio_session_items i where i.session_id = s.id and i.is_done) as has_done
        from public.agenda_appointments a
        join public.studio_sessions s on s.id = a.session_id
        where a.coach_id = p_coach_id
    loop
        v_local := v_row.starts_at at time zone v_zone;

        if v_row.session_group is not null then
            if v_row.deleted_at is not null or v_row.status = 'canceled' then
                update public.studio_session_attendance x
                set status = 'absent', marked_at = now()
                where x.session_id = v_row.session_id and x.client_id = v_row.client_id and x.origin = 'agenda';
            end if;
        elsif v_row.deleted_at is not null then
            if not v_row.has_items then
                delete from public.studio_sessions s where s.id = v_row.session_id;
                v_changed := v_changed + 1;
            end if;
        elsif v_row.status = 'canceled' then
            if not v_row.has_done and v_row.session_status = 'planned' then
                update public.studio_sessions s set status = 'cancelled', updated_at = now() where s.id = v_row.session_id;
                v_changed := v_changed + 1;
            end if;
        elsif v_row.session_status = 'planned' then
            update public.studio_sessions s
            set session_date = v_local::date,
                start_time = v_local::time,
                professional_id = coalesce(v_row.professional_id, s.professional_id),
                updated_at = now()
            where s.id = v_row.session_id
              and (s.session_date, s.start_time) is distinct from (v_local::date, v_local::time);
            if found then
                v_changed := v_changed + 1;
            end if;
        end if;
    end loop;

    -- Citas sin sesión, por franja: misma hora y mismo profesional.
    for v_slot in
        select
            a.starts_at, a.external_staff_id,
            count(*) filter (where coalesce(sv.group_mode, 'auto') <> 'individual') as class_size,
            min(m.external_name) as staff_name
        from public.agenda_appointments a
        left join public.agenda_services sv on sv.id = a.service_id
        left join public.external_staff_map m
            on m.coach_id = a.coach_id and m.provider = a.provider and m.external_id = a.external_staff_id
        where a.coach_id = p_coach_id
          and a.session_id is null
          and a.deleted_at is null
          and a.status <> 'canceled'
          and a.client_id is not null
          and coalesce(sv.creates_session, true)
        group by a.starts_at, a.external_staff_id
    loop
        v_local := v_slot.starts_at at time zone v_zone;
        v_group_id := null;

        if v_slot.class_size >= 2 then
            v_key := coalesce(v_slot.external_staff_id, 'sin-profesional') || ':' || extract(isodow from v_local)::integer
                || ':' || to_char(v_local, 'HH24:MI');
            select g.id into v_group_id from public.training_groups g where g.coach_id = p_coach_id and g.auto_key = v_key;
            if v_group_id is null then
                v_name := coalesce(v_slot.staff_name, 'Clase') || ' · '
                    || v_weekdays[extract(isodow from v_local)::integer] || ' ' || to_char(v_local, 'HH24:MI');
                insert into public.training_groups (coach_id, name, kind, schedule, auto_key)
                values (
                    p_coach_id, v_name, 'schedule',
                    jsonb_build_array(jsonb_build_object(
                        'weekday', extract(isodow from v_local)::integer - 1, 'time', to_char(v_local, 'HH24:MI')
                    )),
                    v_key
                )
                returning id into v_group_id;
            end if;

            select s.id into v_session_id
            from public.studio_sessions s
            where s.group_id = v_group_id and s.session_date = v_local::date and s.start_time = v_local::time;
            if v_session_id is null then
                insert into public.studio_sessions (coach_id, group_id, session_date, start_time, professional_id, origin, location_id)
                select p_coach_id, v_group_id, v_local::date, v_local::time, max(a.professional_id::text)::uuid, 'agenda', max(a.location_id::text)::uuid
                from public.agenda_appointments a
                where a.coach_id = p_coach_id and a.starts_at = v_slot.starts_at
                  and a.external_staff_id is not distinct from v_slot.external_staff_id
                returning id into v_session_id;
                v_classes := v_classes + 1;
            end if;
        end if;

        for v_row in
            select a.*, coalesce(sv.group_mode, 'auto') as group_mode, sv.name as service_name
            from public.agenda_appointments a
            left join public.agenda_services sv on sv.id = a.service_id
            where a.coach_id = p_coach_id
              and a.session_id is null
              and a.deleted_at is null
              and a.status <> 'canceled'
              and a.client_id is not null
              and a.starts_at = v_slot.starts_at
              and a.external_staff_id is not distinct from v_slot.external_staff_id
              and coalesce(sv.creates_session, true)
        loop
            if v_group_id is not null and v_row.group_mode <> 'individual' then
                insert into public.training_group_members (group_id, client_id, origin)
                values (v_group_id, v_row.client_id, 'agenda')
                on conflict (group_id, client_id) do update set left_on = null;

                insert into public.studio_session_attendance (session_id, client_id, status, origin)
                values (v_session_id, v_row.client_id, 'attended', 'agenda')
                on conflict (session_id, client_id) do nothing;

                update public.agenda_appointments a set session_id = v_session_id where a.id = v_row.id;
                continue;
            end if;

            -- Una sesión hecha a mano ese día, sin cita, se queda con la cita.
            select s.id into v_client_id
            from public.studio_sessions s
            where s.client_id = v_row.client_id
              and s.session_date = v_local::date
              and s.status = 'planned'
              and not exists (select 1 from public.agenda_appointments x where x.session_id = s.id)
            limit 1;

            if v_client_id is null then
                insert into public.studio_sessions (coach_id, client_id, session_date, start_time, professional_id, name, origin, location_id)
                values (
                    p_coach_id, v_row.client_id, v_local::date, v_local::time, v_row.professional_id,
                    v_row.service_name, 'agenda', v_row.location_id
                )
                returning id into v_client_id;
                v_sessions := v_sessions + 1;
            end if;
            update public.agenda_appointments a set session_id = v_client_id where a.id = v_row.id;
        end loop;
    end loop;

    return jsonb_build_object('clients', v_clients, 'sessions', v_sessions, 'classes', v_classes, 'changed', v_changed);
end;
$$;

revoke all on function public.agenda_apply(uuid) from public, anon, authenticated;
grant execute on function public.agenda_apply(uuid) to service_role;
