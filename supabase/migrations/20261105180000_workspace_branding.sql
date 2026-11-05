-- Modo Sala F0-6: look & feel de cada espacio.
--
-- Una fila por espacio. Sin fila, o si el plan no incluye `branding`, todo se ve con la marca
-- NexTrain. Los ficheros van al bucket público de R2; aquí solo se guarda su URL.

create table public.workspace_branding (
    coach_id uuid primary key references public.coaches (id) on delete cascade,
    display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
    primary_color text check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
    accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
    logo_light_url text,
    logo_dark_url text,
    icon_url text,
    report_footer text check (report_footer is null or length(report_footer) <= 300),
    updated_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_workspace_branding_updated_at
    before update on public.workspace_branding
    for each row execute function public.set_updated_at();

alter table public.workspace_branding enable row level security;

create policy workspace_branding_member_read on public.workspace_branding
    for select to authenticated
    using (public.is_coach_member(coach_id));

create policy workspace_branding_admin_insert on public.workspace_branding
    for insert to authenticated
    with check (public.is_coach_admin(coach_id) and public.coach_has_feature(coach_id, 'branding'));

create policy workspace_branding_admin_update on public.workspace_branding
    for update to authenticated
    using (public.is_coach_admin(coach_id) and public.coach_has_feature(coach_id, 'branding'))
    with check (public.is_coach_admin(coach_id) and public.coach_has_feature(coach_id, 'branding'));

-- Look & feel que ve quien ha entrado: el de su equipo o, si es atleta, el de su entrenador.
-- Sin filas si el espacio no tiene o si su plan no lo incluye.
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
        (
            select cm.coach_id
            from public.coach_memberships cm
            where cm.user_id = auth.uid()
              and cm.status = 'active'
              and cm.role in ('owner', 'admin', 'coach', 'reception')
            limit 1
        ),
        (
            select c.coach_id
            from public.clients c
            where c.auth_user_id = auth.uid() or c.user_id = auth.uid()
            limit 1
        )
    )
    and public.coach_has_feature(b.coach_id, 'branding')
$$;

revoke all on function public.my_workspace_branding() from public, anon;
grant execute on function public.my_workspace_branding() to authenticated;
