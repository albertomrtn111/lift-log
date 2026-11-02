-- Fotos de check-in: solo el equipo del espacio (owner o coach) y el propio atleta.
--
-- Las políticas anteriores se crearon a mano en el panel y aceptaban cualquier
-- membresía activa del espacio, también role = 'client'. Un atleta con membresía
-- podía leer, cambiar o borrar las fotos de todos los atletas del espacio.
-- is_coach_member ya limita a owner y coach, igual que en chat-media.
--
-- Rutas: <coach_id>/<client_id>/<checkin_id>/<archivo>. El atleta conserva el acceso
-- a sus fotos por el segundo segmento (clients.auth_user_id = auth.uid()).

drop policy if exists checkin_media_storage_select on storage.objects;
drop policy if exists checkin_media_storage_insert on storage.objects;
drop policy if exists checkin_media_storage_update on storage.objects;
drop policy if exists checkin_media_storage_delete on storage.objects;

create policy checkin_media_storage_select on storage.objects
    for select to authenticated
    using (
        bucket_id = 'checkin-media'
        and (
            public.is_coach_member(public.safe_uuid(split_part(name, '/', 1)))
            or exists (
                select 1 from public.clients c
                where c.id = public.safe_uuid(split_part(name, '/', 2))
                  and c.auth_user_id = auth.uid()
            )
        )
    );

create policy checkin_media_storage_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'checkin-media'
        and (
            public.is_coach_member(public.safe_uuid(split_part(name, '/', 1)))
            or exists (
                select 1 from public.clients c
                where c.id = public.safe_uuid(split_part(name, '/', 2))
                  and c.auth_user_id = auth.uid()
            )
        )
    );

create policy checkin_media_storage_update on storage.objects
    for update to authenticated
    using (
        bucket_id = 'checkin-media'
        and (
            public.is_coach_member(public.safe_uuid(split_part(name, '/', 1)))
            or exists (
                select 1 from public.clients c
                where c.id = public.safe_uuid(split_part(name, '/', 2))
                  and c.auth_user_id = auth.uid()
            )
        )
    )
    with check (
        bucket_id = 'checkin-media'
        and (
            public.is_coach_member(public.safe_uuid(split_part(name, '/', 1)))
            or exists (
                select 1 from public.clients c
                where c.id = public.safe_uuid(split_part(name, '/', 2))
                  and c.auth_user_id = auth.uid()
            )
        )
    );

create policy checkin_media_storage_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'checkin-media'
        and (
            public.is_coach_member(public.safe_uuid(split_part(name, '/', 1)))
            or exists (
                select 1 from public.clients c
                where c.id = public.safe_uuid(split_part(name, '/', 2))
                  and c.auth_user_id = auth.uid()
            )
        )
    );
