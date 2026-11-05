-- Modo Sala F0: base de sedes y selector de espacio.
--
-- Un espacio es una empresa y las sedes van dentro. Todo espacio nace con una sede, invisible
-- mientras sea la única. Las pantallas de varias sedes llegarán con una segunda sede real.

create table public.locations (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 80),
    address text,
    timezone text not null default 'Europe/Madrid',
    agenda_mode text not null default 'none' check (agenda_mode in ('connected', 'own', 'none')),
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, coach_id)
);

create index locations_coach_idx on public.locations (coach_id);

create trigger trg_locations_updated_at
    before update on public.locations
    for each row execute function public.set_updated_at();

alter table public.locations enable row level security;

create policy locations_member_read on public.locations
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy locations_admin_all on public.locations
    for all to authenticated
    using (public.is_coach_admin(coach_id))
    with check (public.is_coach_admin(coach_id));

-- Sedes en las que trabaja cada miembro: su filtro por defecto.
create table public.member_locations (
    location_id uuid not null,
    coach_id uuid not null,
    user_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (location_id, user_id),
    foreign key (location_id, coach_id) references public.locations (id, coach_id) on delete cascade
);

create index member_locations_user_idx on public.member_locations (user_id);

alter table public.member_locations enable row level security;

create policy member_locations_member_read on public.member_locations
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy member_locations_admin_all on public.member_locations
    for all to authenticated
    using (public.is_coach_admin(coach_id))
    with check (public.is_coach_admin(coach_id));

-- Sede habitual del cliente, para filtrar. El cliente sigue siendo de toda la empresa.
alter table public.clients
    add column home_location_id uuid references public.locations (id) on delete set null;

-- Sedes incluidas en cada plan. El precio se decide al final.
insert into public.plan_features (plan, feature, enabled, limit_value) values
    ('starter', 'max_locations', true, 1),
    ('pro', 'max_locations', true, 1),
    ('studio', 'max_locations', true, null),
    ('concierge', 'max_locations', true, null);

-- Todo espacio tiene su sede.
create or replace function public.create_default_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.locations (coach_id, name, timezone)
    values (new.id, 'Sede principal', coalesce(new.timezone, 'Europe/Madrid'));
    return new;
end;
$$;

revoke all on function public.create_default_location() from public, anon, authenticated;

create trigger trg_coaches_default_location
    after insert on public.coaches
    for each row execute function public.create_default_location();

insert into public.locations (coach_id, name, timezone)
select c.id, 'Sede principal', coalesce(c.timezone, 'Europe/Madrid')
from public.coaches c
where not exists (select 1 from public.locations l where l.coach_id = c.id);

-- Último espacio de cada usuario. Solo es una preferencia: cada lectura comprueba la membresía.
alter table public.profiles
    add column last_coach_id uuid references public.coaches (id) on delete set null;

-- Espacio con el que trabaja quien ha entrado: el último que eligió, si sigue siendo miembro;
-- si no, el primero al que se unió.
create or replace function public.active_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select cm.coach_id
    from public.coach_memberships cm
    left join public.profiles p on p.id = cm.user_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach', 'reception')
    order by (cm.coach_id is not distinct from p.last_coach_id) desc, cm.created_at asc
    limit 1
$$;

-- Espacios de quien ha entrado, para el selector.
create or replace function public.my_workspaces()
returns table (coach_id uuid, name text, role text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select
        cm.coach_id,
        coalesce(b.display_name, c.name) as name,
        cm.role,
        cm.coach_id = public.active_coach_id() as is_active
    from public.coach_memberships cm
    join public.coaches c on c.id = cm.coach_id
    left join public.workspace_branding b on b.coach_id = cm.coach_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach', 'reception')
    order by cm.created_at asc
$$;

-- El look & feel es el del espacio activo.
create or replace function public.my_workspace_branding()
returns setof public.workspace_branding
language sql
stable
security definer
set search_path = ''
as $$
    select b.*
    from public.workspace_branding b
    where b.coach_id = coalesce(
        public.active_coach_id(),
        (
            select c.coach_id
            from public.clients c
            where c.auth_user_id = auth.uid() or c.user_id = auth.uid()
            limit 1
        )
    )
    and public.coach_has_feature(b.coach_id, 'branding')
$$;

revoke all on function public.active_coach_id() from public, anon;
revoke all on function public.my_workspaces() from public, anon;

grant execute on function public.active_coach_id() to authenticated;
grant execute on function public.my_workspaces() to authenticated;
