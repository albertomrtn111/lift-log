-- Modo Sala F4-1: capa de agenda común y conexión con el software del centro.
--
-- Los datos solo bajan: NexTrain nunca escribe en el software externo. Sin una conexión activa no
-- se lee nada. De la cita solo se guarda lo necesario: ni precios, ni notas, ni DNI, ni bonos.

create table public.agenda_settings (
    coach_id uuid primary key references public.coaches (id) on delete cascade,
    mode text not null default 'none' check (mode in ('none', 'own', 'connected')),
    updated_at timestamptz not null default now()
);

create table public.external_connections (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    location_id uuid references public.locations (id) on delete set null,
    provider text not null check (provider in ('fisiotrack')),
    status text not null default 'disconnected' check (status in ('disconnected', 'active', 'error')),
    -- Nombre del secreto en Vault. El token nunca se guarda aquí.
    vault_secret_name text,
    last_sync_at timestamptz,
    last_full_sync_at timestamptz,
    last_error text,
    -- Citas de la última ventana completa: sirve para notar una respuesta incompleta.
    typical_window_count integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (coach_id, provider)
);

create table public.agenda_services (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    provider text not null default 'nextrain' check (provider in ('nextrain', 'fisiotrack')),
    external_id text,
    name text not null check (length(btrim(name)) between 1 and 160),
    duration_min integer check (duration_min is null or duration_min between 1 and 1440),
    kind text not null default 'training' check (kind in ('training', 'physio', 'online', 'none')),
    group_mode text not null default 'auto' check (group_mode in ('auto', 'individual', 'shared')),
    creates_session boolean not null default true,
    classified_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (coach_id, provider, external_id)
);

create table public.external_patients (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    provider text not null check (provider in ('fisiotrack')),
    external_id text not null,
    full_name text not null,
    birth_date date,
    phone text,
    email text,
    client_id uuid references public.clients (id) on delete set null,
    updated_at timestamptz not null default now(),
    unique (coach_id, provider, external_id)
);

create index external_patients_client_idx on public.external_patients (client_id);

create table public.external_staff_map (
    coach_id uuid not null references public.coaches (id) on delete cascade,
    provider text not null check (provider in ('fisiotrack')),
    external_id text not null,
    external_name text not null,
    user_id uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (coach_id, provider, external_id)
);

create table public.agenda_appointments (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    location_id uuid references public.locations (id) on delete set null,
    provider text not null default 'nextrain' check (provider in ('nextrain', 'fisiotrack')),
    external_id text,
    external_patient_id uuid references public.external_patients (id) on delete set null,
    client_id uuid references public.clients (id) on delete set null,
    external_staff_id text,
    professional_id uuid references public.profiles (id) on delete set null,
    service_id uuid references public.agenda_services (id) on delete set null,
    starts_at timestamptz not null,
    ends_at timestamptz,
    status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'canceled')),
    attendance text not null default 'unmarked' check (attendance in ('unmarked', 'attended', 'absent')),
    session_id uuid references public.studio_sessions (id) on delete set null,
    external_updated_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (coach_id, provider, external_id)
);

create index agenda_appointments_day_idx on public.agenda_appointments (coach_id, starts_at);
create index agenda_appointments_client_idx on public.agenda_appointments (client_id, starts_at);
create index agenda_appointments_session_idx on public.agenda_appointments (session_id);

alter table public.agenda_settings enable row level security;
alter table public.external_connections enable row level security;
alter table public.agenda_services enable row level security;
alter table public.external_patients enable row level security;
alter table public.external_staff_map enable row level security;
alter table public.agenda_appointments enable row level security;

-- Solo lectura para el equipo: escribe la sincronización y, más adelante, las funciones de ajustes.
create policy agenda_settings_read on public.agenda_settings
    for select to authenticated using (public.is_coach_member(coach_id));
create policy external_connections_read on public.external_connections
    for select to authenticated using (public.is_coach_member(coach_id));
create policy agenda_services_read on public.agenda_services
    for select to authenticated using (public.is_coach_member(coach_id));
create policy external_patients_read on public.external_patients
    for select to authenticated using (public.is_coach_member(coach_id));
create policy external_staff_map_read on public.external_staff_map
    for select to authenticated using (public.is_coach_member(coach_id));
create policy agenda_appointments_read on public.agenda_appointments
    for select to authenticated using (public.is_coach_member(coach_id));

-- El token solo sale de Vault para la sincronización, nunca hacia el navegador.
create or replace function public.agenda_connection_token(p_connection_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_token text;
begin
    select s.decrypted_secret into v_token
    from public.external_connections c
    join vault.decrypted_secrets s on s.name = c.vault_secret_name
    where c.id = p_connection_id and c.status <> 'disconnected';
    return v_token;
end;
$$;

revoke all on function public.agenda_connection_token(uuid) from public, anon, authenticated;
grant execute on function public.agenda_connection_token(uuid) to service_role;
