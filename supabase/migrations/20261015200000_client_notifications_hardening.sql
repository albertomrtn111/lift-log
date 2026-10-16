-- Notificaciones al cliente: preferencias nuevas + esquema que hasta ahora
-- solo existía en Supabase (push_subscriptions, Realtime, crons).
-- Idempotente: no toca lo que ya existe en producción.

-- 1) Preferencias nuevas: actividades importadas (Strava) y cambios de plan.
--    Activadas por defecto para mantener el comportamiento actual.
alter table public.client_notification_preferences
    add column if not exists activities_enabled boolean not null default true,
    add column if not exists plans_enabled boolean not null default true;

-- 2) Suscripciones push del cliente. En producción ya existe: solo se crea
--    (con sus políticas) en entornos nuevos.
do $$
begin
    if to_regclass('public.push_subscriptions') is null then
        create table public.push_subscriptions (
            id uuid primary key default gen_random_uuid(),
            client_id uuid not null references public.clients(id) on delete cascade,
            endpoint text not null,
            p256dh text not null,
            auth text not null,
            user_agent text,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique (client_id, endpoint)
        );

        alter table public.push_subscriptions enable row level security;

        -- /api/push/subscribe escribe con la sesión del propio cliente.
        create policy "ps_client_all" on public.push_subscriptions
            for all to authenticated
            using (
                exists (
                    select 1 from public.clients c
                    where c.id = client_id
                      and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
                )
            )
            with check (
                exists (
                    select 1 from public.clients c
                    where c.id = client_id
                      and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
                )
            );
    end if;
end $$;

-- 3) Realtime para la campana del cliente (useClientNotifications).
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'client_notifications'
       ) then
        alter publication supabase_realtime add table public.client_notifications;
    end if;
end $$;

-- 4) Crons (referencia; no se ejecuta aquí porque necesita el secreto).
--
--    Revisiones programadas — pg_cron llama a /api/cron/reviews a las 07:00 y
--    08:00 UTC; el endpoint solo actúa a las 09:00 Europe/Madrid:
--
--      select cron.schedule(
--          'nexttrain-review-scheduler',
--          '0 7,8 * * *',
--          $cron$
--          select net.http_post(
--              url := '<APP_URL>/api/cron/reviews',
--              headers := jsonb_build_object(
--                  'Authorization', 'Bearer ' || (
--                      select decrypted_secret from vault.decrypted_secrets
--                      where name = 'review_scheduler_secret'
--                  )
--              )
--          );
--          $cron$
--      );
--
--    Recordatorios de suplementos — no usan pg_cron: los dispara el contenedor
--    `supplement_reminder_worker` (docker-compose.yml) cada 60 s contra
--    /api/supplements/reminders.
