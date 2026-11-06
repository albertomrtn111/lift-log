-- Modo Sala A-1 y A-2: la app del atleta para los clientes de sala.
--
-- Cada sesión de sala la registra el profesional: el atleta solo la lee. Qué pestañas ve depende de
-- lo que tenga, y la sala puede apagar la app o el chat. Un espacio sin sala no cambia en nada.

insert into public.plan_features (plan, feature, enabled)
select distinct p.plan, 'athlete_app', true from public.plan_features p
on conflict do nothing;

create table public.athlete_app_settings (
    coach_id uuid primary key references public.coaches (id) on delete cascade,
    athlete_app boolean not null default true,
    chat boolean not null default true,
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now()
);

alter table public.athlete_app_settings enable row level security;

-- Solo lectura: las escrituras van por la función.
create policy athlete_app_settings_read on public.athlete_app_settings
    for select to authenticated
    using (public.is_coach_member(coach_id));

create or replace function public.studio_save_app_settings(p_coach_id uuid, p_athlete_app boolean, p_chat boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_coach_admin(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'Solo el propietario y los administradores cambian esto.' using errcode = '42501';
    end if;
    insert into public.athlete_app_settings (coach_id, athlete_app, chat, updated_by)
    values (p_coach_id, p_athlete_app, p_chat, auth.uid())
    on conflict (coach_id) do update
    set athlete_app = excluded.athlete_app, chat = excluded.chat,
        updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Qué puede ver en la app quien ha entrado. Null si no es atleta: entonces no se limita nada.
create or replace function public.my_athlete_modules()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_client public.clients%rowtype;
    v_settings public.athlete_app_settings%rowtype;
begin
    select * into v_client from public.clients c
    where c.auth_user_id = auth.uid() or c.user_id = auth.uid()
    order by c.status = 'active' desc, c.created_at desc
    limit 1;
    if v_client.id is null then
        return null;
    end if;

    if not public.coach_has_feature(v_client.coach_id, 'studio_mode') then
        return jsonb_build_object('app', true, 'sessions', false, 'routine', true, 'diet', true, 'chat', true);
    end if;

    select * into v_settings from public.athlete_app_settings s where s.coach_id = v_client.coach_id;
    return jsonb_build_object(
        'app', public.coach_has_feature(v_client.coach_id, 'athlete_app') and coalesce(v_settings.athlete_app, true),
        'sessions', true,
        'routine', exists (select 1 from public.training_programs p where p.client_id = v_client.id and p.status = 'active')
            or exists (select 1 from public.cardio_sessions s where s.client_id = v_client.id),
        'diet', exists (select 1 from public.macro_plans m where m.client_id = v_client.id and m.archived_at is null)
            or exists (select 1 from public.diet_plans d where d.client_id = v_client.id and d.archived_at is null),
        'chat', coalesce(v_settings.chat, true)
    );
end;
$$;

-- ¿Vino quien ha entrado a esta clase, ya hecha?
create or replace function public.studio_attended_by_me(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.studio_session_attendance a
        join public.studio_sessions s on s.id = a.session_id
        where a.session_id = p_session_id
          and a.status = 'attended'
          and s.status = 'done'
          and public.is_client_self(a.client_id)
    );
$$;

-- Un informe que aún no se ha enviado no le llega al atleta.
create or replace function public.report_was_delivered(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.report_deliveries d where d.report_id = p_report_id and d.ok);
$$;

create policy studio_sessions_read_attended on public.studio_sessions
    for select to authenticated
    using (group_id is not null and public.studio_attended_by_me(id));

create policy studio_session_items_read_attended on public.studio_session_items
    for select to authenticated
    using (client_id is null and is_done and public.studio_attended_by_me(session_id));

create policy studio_session_sections_read_attended on public.studio_session_sections
    for select to authenticated
    using (client_id is null and public.studio_attended_by_me(session_id));

create policy studio_item_people_read_self on public.studio_item_people
    for select to authenticated
    using (public.is_client_self(client_id));

create policy studio_session_attendance_read_self on public.studio_session_attendance
    for select to authenticated
    using (public.is_client_self(client_id));

create policy session_reports_read_self on public.session_reports
    for select to authenticated
    using (public.is_client_self(client_id) and revoked_at is null and public.report_was_delivered(id));

revoke all on function public.studio_save_app_settings(uuid, boolean, boolean) from public, anon;
revoke all on function public.my_athlete_modules() from public, anon;
revoke all on function public.studio_attended_by_me(uuid) from public, anon;
revoke all on function public.report_was_delivered(uuid) from public, anon;

grant execute on function public.studio_save_app_settings(uuid, boolean, boolean) to authenticated;
grant execute on function public.my_athlete_modules() to authenticated;
grant execute on function public.studio_attended_by_me(uuid) to authenticated;
grant execute on function public.report_was_delivered(uuid) to authenticated;
