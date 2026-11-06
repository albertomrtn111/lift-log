-- Modo Sala F4: la agenda se sincroniza sola.
--
-- Cada 5 minutos, hoy y mañana; cada hora, la ventana completa. Sin conexiones activas la función
-- no hace nada. La clave vive en Vault y en los secretos de la función: nunca en el repositorio.

select cron.schedule(
    'agenda-sync-quick',
    '*/5 * * * *',
    $cron$
    select net.http_post(
        url := 'https://kqwstdbdocbynvijnpka.supabase.co/functions/v1/agenda-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-agenda-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_sync_secret')
        ),
        body := '{"kind": "quick"}'::jsonb,
        timeout_milliseconds := 60000
    );
    $cron$
);

select cron.schedule(
    'agenda-sync-full',
    '17 * * * *',
    $cron$
    select net.http_post(
        url := 'https://kqwstdbdocbynvijnpka.supabase.co/functions/v1/agenda-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-agenda-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_sync_secret')
        ),
        body := '{"kind": "full"}'::jsonb,
        timeout_milliseconds := 120000
    );
    $cron$
);
