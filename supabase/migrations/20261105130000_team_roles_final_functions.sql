-- Modo Sala F0-1, último paso de base de datos: clientes, cobros y funciones de permisos.
--
-- is_coach_member pasa a ser quien entrena (propietario, administrador y profesional).
-- is_coach_admin pasa a ser propietario y administrador. Recepción sigue fuera de estas
-- funciones: recibirá sus permisos cuando existan sus pantallas, sin ver campos de pago ni
-- notas de clients. Nadie tiene todavía los roles admin ni reception, así que hoy solo cambia
-- que un profesional deja de poder editar el espacio y los cobros.

-- clients: se quitan los duplicados y el equipo entra por training_client_ids().
drop policy if exists clients_delete_admin on public.clients;
drop policy if exists clients_insert_member on public.clients;
drop policy if exists clients_select_by_coach on public.clients;
drop policy if exists clients_select_member on public.clients;
drop policy if exists clients_update_by_coach on public.clients;
drop policy if exists clients_update_member on public.clients;
drop policy if exists clients_write_by_coach on public.clients;

create policy clients_team_select on public.clients
    for select to authenticated
    using (id in (select public.training_client_ids()));

create policy clients_team_insert on public.clients
    for insert to authenticated
    with check (public.is_coach_member(coach_id));

create policy clients_team_update on public.clients
    for update to authenticated
    using (id in (select public.training_client_ids()))
    with check (public.is_coach_member(coach_id));

create policy clients_team_delete on public.clients
    for delete to authenticated
    using (id in (select public.training_client_ids()));

-- Cobros: propietario y administrador.
drop policy if exists payment_records_delete on public.payment_records;
drop policy if exists payment_records_insert on public.payment_records;
drop policy if exists payment_records_select on public.payment_records;
drop policy if exists payment_records_update on public.payment_records;

create policy payment_records_admin_all on public.payment_records
    for all to authenticated
    using (public.is_coach_admin(coach_id))
    with check (public.is_coach_admin(coach_id));

create or replace function public.is_coach_member(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1
        from public.coach_memberships cm
        where cm.coach_id = p_coach_id
          and cm.user_id = auth.uid()
          and cm.status = 'active'
          and cm.role in ('owner', 'admin', 'coach')
    );
$$;

create or replace function public.is_coach_admin(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select exists (
        select 1
        from public.coach_memberships m
        where m.coach_id = p_coach_id
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role in ('owner', 'admin')
    );
$$;

-- El resto de funciones que comprueban el rol admiten también al administrador.
do $$
declare
    f record;
    v_def text;
begin
    for f in
        select p.oid
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prokind = 'f'
          and p.proname not in ('is_coach_member', 'is_coach_admin')
          and p.prosrc ~ $q$'owner', *'coach'$q$
    loop
        v_def := regexp_replace(pg_get_functiondef(f.oid), $q$'owner', *'coach'$q$, $q$'owner', 'admin', 'coach'$q$, 'g');
        execute v_def;
    end loop;
end;
$$;
