-- Modo Sala F0-1, paso 1: base de roles. Solo añade: nadie gana ni pierde permisos.
--
-- is_coach_member e is_coach_admin no cambian aquí, y ninguna política existente usa
-- todavía las funciones nuevas. Los roles admin y reception quedan admitidos, pero nadie
-- los tendrá hasta que exista la invitación al equipo (F0-3).

-- Roles del equipo. client se mantiene por compatibilidad con las membresías antiguas.
alter table public.coach_memberships
    add constraint coach_memberships_role_check
    check (role in ('owner', 'admin', 'coach', 'reception', 'client'));

-- Cada espacio tiene un solo propietario activo.
create unique index coach_memberships_one_owner
    on public.coach_memberships (coach_id)
    where role = 'owner' and status = 'active';

-- Qué clientes ve cada profesional: todos (por defecto) o solo los asignados.
alter table public.coaches
    add column client_visibility text not null default 'all'
    check (client_visibility in ('all', 'assigned'));

-- Profesionales asignados a cada cliente.
create table public.client_professionals (
    client_id uuid not null references public.clients (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (id) on delete set null,
    primary key (client_id, user_id)
);

create index client_professionals_user_idx on public.client_professionals (user_id);

alter table public.client_professionals enable row level security;

create policy client_professionals_member_all on public.client_professionals
    for all to authenticated
    using (exists (
        select 1 from public.clients c
        where c.id = client_professionals.client_id
          and public.is_coach_member(c.coach_id)
    ))
    with check (exists (
        select 1 from public.clients c
        where c.id = client_professionals.client_id
          and public.is_coach_member(c.coach_id)
    ));

-- Equipo de NexTrain. Se gestiona solo con la clave de servicio; nunca desde un espacio.
create table public.platform_admins (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1 from public.platform_admins pa
        where pa.user_id = auth.uid()
    );
$$;

-- ¿Este usuario es el propio atleta? Sustituye a mezclar user_id y auth_user_id.
create or replace function public.is_client_self(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1 from public.clients c
        where c.id = p_client_id
          and (c.auth_user_id = auth.uid() or c.user_id = auth.uid())
    );
$$;

-- Miembro del equipo que puede ver a este cliente: con el espacio en «todos», cualquiera;
-- con «solo asignados», propietario, administrador, recepción y los profesionales asignados.
create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1
        from public.clients c
        join public.coaches sp on sp.id = c.coach_id
        join public.coach_memberships cm on cm.coach_id = c.coach_id
        where c.id = p_client_id
          and cm.user_id = auth.uid()
          and cm.status = 'active'
          and cm.role in ('owner', 'admin', 'coach', 'reception')
          and (
              sp.client_visibility = 'all'
              or cm.role in ('owner', 'admin', 'reception')
              or exists (
                  select 1 from public.client_professionals cp
                  where cp.client_id = c.id and cp.user_id = auth.uid()
              )
          )
    );
$$;

-- Como can_access_client, sin recepción: entrenamiento, nutrición, check-ins, salud y notas.
create or replace function public.can_see_training(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select public.can_access_client(p_client_id)
       and not exists (
           select 1
           from public.clients c
           join public.coach_memberships cm on cm.coach_id = c.coach_id
           where c.id = p_client_id
             and cm.user_id = auth.uid()
             and cm.status = 'active'
             and cm.role = 'reception'
       );
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_client_self(uuid) from public, anon;
revoke all on function public.can_access_client(uuid) from public, anon;
revoke all on function public.can_see_training(uuid) from public, anon;

grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_client_self(uuid) to authenticated, service_role;
grant execute on function public.can_access_client(uuid) to authenticated, service_role;
grant execute on function public.can_see_training(uuid) to authenticated, service_role;
