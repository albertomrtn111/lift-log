-- Notificaciones fase 4: avisos nuevos.

-- 1) Cola de avisos de cambios de plan hechos fuera de la web (el servidor
--    MCP de la IA). El MCP escribe con la sesión del coach; el cron de cada
--    15 minutos de la web la procesa y avisa al atleta como si el cambio se
--    hubiera hecho en el portal.
create table if not exists public.notification_outbox (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid references public.coaches(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    kind text not null check (kind in ('training', 'diet', 'macros', 'cardio', 'supplements')),
    plan_id uuid,
    source text not null default 'mcp',
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index if not exists notification_outbox_pending_idx
    on public.notification_outbox (created_at)
    where processed_at is null;

alter table public.notification_outbox enable row level security;

-- El coach solo puede encolar avisos para sus atletas; leer y procesar lo hace
-- el servidor con service role.
drop policy if exists notification_outbox_insert_member on public.notification_outbox;
create policy notification_outbox_insert_member on public.notification_outbox
    for insert to authenticated
    with check (
        exists (
            select 1 from public.clients c
            where c.id = client_id
              and public.is_coach_member(c.coach_id)
        )
    );

-- 2) Atleta: entreno del día (opcional, apagado por defecto) y resumen de la
--    semana en el buzón (encendido).
alter table public.client_notification_preferences
    add column if not exists workout_reminder_enabled boolean not null default false,
    add column if not exists workout_reminder_time time not null default '08:00',
    add column if not exists week_summary_enabled boolean not null default true;

-- 3) Coach: resumen semanal por email los lunes.
alter table public.coach_notification_preferences
    add column if not exists weekly_digest_enabled boolean not null default true;
