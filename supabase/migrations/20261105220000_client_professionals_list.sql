-- Modo Sala F0-8: profesionales asignados a un cliente, con su nombre, para el MCP.
-- Los nombres vienen de profiles, que cada usuario solo puede leer para sí mismo.

create or replace function public.client_professionals_list(p_client_id uuid)
returns table (user_id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.can_access_client(p_client_id) then
        raise exception 'No tienes acceso a este cliente.' using errcode = '42501';
    end if;

    return query
    select cp.user_id, p.full_name, cm.role
    from public.client_professionals cp
    join public.clients c on c.id = cp.client_id
    join public.profiles p on p.id = cp.user_id
    left join public.coach_memberships cm
        on cm.user_id = cp.user_id and cm.coach_id = c.coach_id and cm.status = 'active'
    where cp.client_id = p_client_id
    order by p.full_name;
end;
$$;

revoke all on function public.client_professionals_list(uuid) from public, anon;
grant execute on function public.client_professionals_list(uuid) to authenticated;
