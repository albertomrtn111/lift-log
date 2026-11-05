-- Modo Sala F0-3: invitaciones al equipo y registro de cambios.
--
-- Solo añade. Las dos tablas se escriben desde el servidor con la clave de servicio, después
-- de comprobar el rol de quien actúa; propietario y administrador las leen.

create table public.coach_invitations (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    email text not null,
    role text not null check (role in ('admin', 'coach', 'reception')),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
    -- La cuenta se creó con la invitación: al aceptar tiene que poner contraseña.
    needs_password boolean not null default false,
    invited_by uuid references public.profiles(id) on delete set null,
    expires_at timestamptz not null default now() + interval '7 days',
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index coach_invitations_one_pending
    on public.coach_invitations (coach_id, lower(email))
    where status = 'pending';

alter table public.coach_invitations enable row level security;

create policy coach_invitations_admin_select on public.coach_invitations
    for select to authenticated
    using (public.is_coach_admin(coach_id));

revoke all on public.coach_invitations from anon, authenticated;
grant select on public.coach_invitations to authenticated;

create table public.coach_member_events (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    action text not null check (action in (
        'invited', 'invitation_resent', 'invitation_revoked', 'joined', 'role_changed', 'removed'
    )),
    target_user_id uuid references public.profiles(id) on delete set null,
    target_email text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index coach_member_events_coach_idx on public.coach_member_events (coach_id, created_at desc);

alter table public.coach_member_events enable row level security;

create policy coach_member_events_admin_select on public.coach_member_events
    for select to authenticated
    using (public.is_coach_admin(coach_id));

revoke all on public.coach_member_events from anon, authenticated;
grant select on public.coach_member_events to authenticated;
