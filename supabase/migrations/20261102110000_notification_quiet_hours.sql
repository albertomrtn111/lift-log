-- Notificaciones fase 3: preferencias por canal, horas de silencio y zona
-- horaria de cada usuario. Todo aditivo y con valores por defecto.

-- 1) Atleta: email de revisiones aparte del push, horas de silencio (activadas
--    por defecto de 22:00 a 08:00) y su zona horaria (la del móvil).
alter table public.client_notification_preferences
    add column if not exists reviews_email_enabled boolean not null default true,
    add column if not exists quiet_hours_enabled boolean not null default true,
    add column if not exists quiet_start time not null default '22:00',
    add column if not exists quiet_end time not null default '08:00',
    add column if not exists timezone text;

-- 2) Coach: horas de silencio opcionales (desactivadas por defecto). Su zona
--    horaria ya está en coaches.timezone.
alter table public.coach_notification_preferences
    add column if not exists quiet_hours_enabled boolean not null default false,
    add column if not exists quiet_start time not null default '22:00',
    add column if not exists quiet_end time not null default '08:00';

-- 3) Push retenido en horas de silencio: el aviso queda en el buzón y el push
--    sale, agrupado, cuando terminan (held_until). released_at marca que ya salió.
alter table public.notification_deliveries
    add column if not exists held_until timestamptz,
    add column if not exists released_at timestamptz;

create index if not exists notification_deliveries_held_idx
    on public.notification_deliveries (held_until)
    where held_until is not null and released_at is null;
