-- Políticas del bucket chat-media (ruta {coachId}/{clientId}/{archivo}).
--
-- 1. Las del atleta solo miraban la carpeta del atleta (foldername[2]): podía
--    subir o leer bajo la carpeta de cualquier coach mientras la segunda carpeta
--    fuera su propio id. Ahora la carpeta del coach tiene que ser la de su coach.
-- 2. Todas pasan a TO authenticated, como las de messages: sin sesión no hay
--    nada que subir ni leer.

drop policy if exists chat_media_client_insert on storage.objects;
create policy chat_media_client_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'chat-media'
        and exists (
            select 1
            from public.clients c
            where c.id = ((storage.foldername(name))[2])::uuid
              and c.coach_id = ((storage.foldername(name))[1])::uuid
              and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
        )
    );

drop policy if exists chat_media_client_read on storage.objects;
create policy chat_media_client_read on storage.objects
    for select to authenticated
    using (
        bucket_id = 'chat-media'
        and exists (
            select 1
            from public.clients c
            where c.id = ((storage.foldername(name))[2])::uuid
              and c.coach_id = ((storage.foldername(name))[1])::uuid
              and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
        )
    );

alter policy chat_media_coach_all on storage.objects to authenticated;
