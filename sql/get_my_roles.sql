-- Function to resolve roles for the authenticated user bypassing RLS
create or replace function public.get_my_roles()
returns table (
  is_client boolean,
  is_coach boolean,
  client_id uuid,
  coach_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _auth_uid uuid := auth.uid();
  _client_id uuid;
  _coach_id uuid;
begin
  -- Search for client record
  select id into _client_id
  from public.clients
  where user_id = _auth_uid
    and status = 'active'
  limit 1;

  -- Search for coach membership
  select coach_id into _coach_id
  from public.coach_memberships
  where user_id = _auth_uid
    and status = 'active'
    and role in ('owner', 'coach')
  limit 1;

  return query
  select 
    (_client_id is not null) as is_client,
    (_coach_id is not null) as is_coach,
    _client_id as client_id,
    _coach_id as coach_id;
end;
$$;

-- Allow authenticated users to call this
grant execute on function public.get_my_roles() to authenticated;
