-- Chat: adjuntos sin texto y Realtime que no se bloquea con suscriptores anónimos.
-- Idempotente.

-- 1) Una foto, nota de voz o documento sin pie se guarda con content = ''.
--    La restricción de producción exigía texto siempre, así que todo adjunto
--    sin texto fallaba al insertarse (el archivo quedaba subido y huérfano).
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
    char_length(content) <= 4000
    and (char_length(content) > 0 or attachment_url is not null)
);

-- 2) Las políticas de messages se aplicaban también a anon. supabase-js se
--    suscribe a Realtime con la clave anónima cuando aún no tiene la sesión
--    (p. ej. al volver la PWA de segundo plano con el token caducado); Realtime
--    evalúa entonces estas políticas como anon, anon no puede ejecutar
--    is_client_in_coach / is_coach_member y el error ("permission denied for
--    function is_client_in_coach") hace fallar el lote entero de cambios:
--    nadie recibe mensajes en vivo mientras ese suscriptor siga conectado.
--    Limitadas a authenticated, anon simplemente no ve filas.
alter policy messages_insert_client on public.messages to authenticated;
alter policy messages_rw_coach on public.messages to authenticated;
alter policy messages_select_client on public.messages to authenticated;
alter policy messages_update_client_read on public.messages to authenticated;
