-- Modo Sala A-3 y A-4: técnica, citas, sensaciones y consentimientos en la app del atleta.
--
-- Lo único que el atleta escribe sobre una sesión de sala son sus sensaciones, en una tabla aparte.
-- El RPE que cuenta sigue siendo el del profesional.

create table public.studio_session_feedback (
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
    comment text check (comment is null or length(comment) <= 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (session_id, client_id),
    check (rpe is not null or comment is not null)
);

create index studio_session_feedback_client_idx on public.studio_session_feedback (client_id);

alter table public.studio_session_feedback enable row level security;

-- Solo lectura: las escrituras van por la función.
create policy studio_session_feedback_read on public.studio_session_feedback
    for select to authenticated
    using (public.is_client_self(client_id) or client_id in (select public.training_client_ids()));

-- Guarda sus sensaciones de una sesión hecha que sea suya. Vacías, las borra.
create or replace function public.athlete_save_feedback(p_session_id uuid, p_rpe numeric, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_client_id uuid;
    v_comment text := nullif(btrim(p_comment), '');
begin
    select c.id into v_client_id
    from public.studio_sessions s
    left join public.studio_session_attendance a on a.session_id = s.id and a.status = 'attended'
    join public.clients c on c.id = coalesce(s.client_id, a.client_id)
    where s.id = p_session_id and s.status = 'done' and public.is_client_self(c.id)
    limit 1;
    if v_client_id is null then
        raise exception 'Esta sesión no es tuya.' using errcode = '42501';
    end if;

    if p_rpe is null and v_comment is null then
        delete from public.studio_session_feedback f where f.session_id = p_session_id and f.client_id = v_client_id;
        return;
    end if;
    insert into public.studio_session_feedback (session_id, client_id, rpe, comment)
    values (p_session_id, v_client_id, p_rpe, v_comment)
    on conflict (session_id, client_id) do update
    set rpe = excluded.rpe, comment = excluded.comment, updated_at = now();
end;
$$;

-- ¿Es la sala de quien ha entrado, como atleta?
create or replace function public.is_my_coach(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.clients c
        where c.coach_id = p_coach_id and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
    );
$$;

create or replace function public.studio_can_read_media(p_coach_id uuid, p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.studio_can_use_media(p_coach_id, p_folder_id)
        or (p_folder_id = p_coach_id and public.is_my_coach(p_coach_id))
        or (
            public.is_client_self(p_folder_id)
            and public.studio_has_image_consent(p_folder_id)
            and exists (select 1 from public.clients c where c.id = p_folder_id and c.coach_id = p_coach_id)
        );
$$;

create policy exercise_media_read_athlete on public.exercise_media
    for select to authenticated
    using (
        (client_id is null and public.is_my_coach(coach_id))
        or (
            public.is_client_self(client_id)
            and (kind not in ('image', 'video') or public.studio_has_image_consent(client_id))
        )
    );

create policy media_assets_read_athlete on public.media_assets
    for select to authenticated
    using (
        (client_id is null and public.is_my_coach(coach_id))
        or (public.is_client_self(client_id) and public.studio_has_image_consent(client_id))
    );

create policy agenda_appointments_read_self on public.agenda_appointments
    for select to authenticated
    using (public.is_client_self(client_id) and deleted_at is null);

create policy client_consents_read_self on public.client_consents
    for select to authenticated
    using (public.is_client_self(client_id));

revoke all on function public.athlete_save_feedback(uuid, numeric, text) from public, anon;
revoke all on function public.is_my_coach(uuid) from public, anon;
revoke all on function public.studio_can_read_media(uuid, uuid) from public, anon;

grant execute on function public.athlete_save_feedback(uuid, numeric, text) to authenticated;
grant execute on function public.is_my_coach(uuid) to authenticated;
grant execute on function public.studio_can_read_media(uuid, uuid) to authenticated;
