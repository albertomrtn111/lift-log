-- Registro de entregas de avisos (fase 1 de notificaciones).
-- Una fila por aviso intentado, al atleta o al coach: si llegó al buzón,
-- a cuántos dispositivos se envió el push y si salió email. Sirve para saber
-- a quién no le llegan los avisos y como candado de idempotencia de los
-- recordatorios (dedupe_key único).
-- Solo lo usa el servidor con service role: RLS activa y sin políticas.

create table if not exists public.notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    audience text not null check (audience in ('client', 'coach')),
    client_id uuid references public.clients(id) on delete cascade,
    coach_id uuid references public.coaches(id) on delete cascade,
    kind text not null,
    dedupe_key text,
    status text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
    skipped_reason text,
    inbox boolean not null default false,
    push_targets integer not null default 0,
    push_delivered integer not null default 0,
    push_pruned integer not null default 0,
    email_status text check (email_status in ('sent', 'failed', 'skipped')),
    created_at timestamptz not null default now(),
    check (
        (audience = 'client' and client_id is not null)
        or (audience = 'coach' and coach_id is not null)
    )
);

create unique index if not exists notification_deliveries_dedupe_key_idx
    on public.notification_deliveries (dedupe_key)
    where dedupe_key is not null;

create index if not exists notification_deliveries_client_idx
    on public.notification_deliveries (client_id, created_at desc)
    where client_id is not null;

create index if not exists notification_deliveries_coach_idx
    on public.notification_deliveries (coach_id, created_at desc)
    where coach_id is not null;

create index if not exists notification_deliveries_kind_idx
    on public.notification_deliveries (kind, created_at desc);

alter table public.notification_deliveries enable row level security;

-- Recordatorios de revisión pendiente: buscar rápido las revisiones sin responder.
create index if not exists checkins_pending_reminder_idx
    on public.checkins (created_at)
    where type = 'checkin' and status = 'pending';
