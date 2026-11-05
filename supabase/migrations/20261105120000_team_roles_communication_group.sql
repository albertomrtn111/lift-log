-- Modo Sala F0-1, grupos Comunicación y Herramientas: las políticas del equipo pasan a las
-- funciones de permisos.
--
-- Lo que es de un cliente usa training_client_ids(), así que con «solo asignados» cada
-- profesional ve lo de sus clientes. Lo del espacio usa is_coach_member. Las tareas, notas y
-- avisos sin cliente siguen siendo de todo el equipo. Propietario y profesionales conservan el
-- mismo acceso, y las políticas del atleta no cambian.

drop policy if exists messages_rw_coach on public.messages;
drop policy if exists cn_coach_insert on public.client_notifications;
drop policy if exists notification_outbox_insert_member on public.notification_outbox;
drop policy if exists nextia_chat_messages_delete on public.nextia_chat_messages;
drop policy if exists nextia_chat_messages_insert on public.nextia_chat_messages;
drop policy if exists nextia_chat_messages_select on public.nextia_chat_messages;
drop policy if exists "Coach can manage own AI profile" on public.coach_ai_profiles;
drop policy if exists calendar_notes_rw_member on public.calendar_notes;
drop policy if exists coach_tasks_rw_member on public.coach_tasks;
drop policy if exists coach_notifications_select_member on public.coach_notifications;
drop policy if exists coach_notifications_update_member on public.coach_notifications;

create policy messages_team_all on public.messages
    for all to authenticated
    using (client_id in (select public.training_client_ids()))
    with check (
        client_id in (select public.training_client_ids())
        and exists (
            select 1 from public.clients c
            where c.id = messages.client_id and c.coach_id = messages.coach_id
        )
    );

create policy cn_team_insert on public.client_notifications
    for insert to authenticated
    with check (client_id in (select public.training_client_ids()));

create policy notification_outbox_team_insert on public.notification_outbox
    for insert to authenticated
    with check (client_id in (select public.training_client_ids()));

create policy nextia_chat_messages_team_select on public.nextia_chat_messages
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy nextia_chat_messages_team_insert on public.nextia_chat_messages
    for insert to authenticated
    with check (
        client_id in (select public.training_client_ids())
        and exists (
            select 1 from public.clients c
            where c.id = nextia_chat_messages.client_id and c.coach_id = nextia_chat_messages.coach_id
        )
    );

create policy nextia_chat_messages_team_delete on public.nextia_chat_messages
    for delete to authenticated
    using (client_id in (select public.training_client_ids()));

create policy coach_ai_profiles_team_all on public.coach_ai_profiles
    for all to authenticated
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

create policy calendar_notes_team_all on public.calendar_notes
    for all to authenticated
    using (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    )
    with check (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    );

create policy coach_tasks_team_all on public.coach_tasks
    for all to authenticated
    using (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    )
    with check (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    );

create policy coach_notifications_team_select on public.coach_notifications
    for select to authenticated
    using (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    );

create policy coach_notifications_team_update on public.coach_notifications
    for update to authenticated
    using (
        public.is_coach_member(coach_id)
        and (client_id is null or client_id in (select public.training_client_ids()))
    );
