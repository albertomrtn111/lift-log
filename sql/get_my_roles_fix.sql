-- FIX GET_MY_ROLES RPC (STABLE VERSION)
-- Objective: Always return 1 row with boolean fields, bypassing RLS.

BEGIN;

-- 1. DROP EXISTING TO AVOID "return type" ERRORS
DROP FUNCTION IF EXISTS public.get_my_roles();

-- 2. CREATE NEW FUNCTION WITH STABLE SIGNATURE
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE (
  is_client boolean,
  is_coach boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _auth_uid uuid := auth.uid();
begin
  -- If not logged in, return false/false
  if _auth_uid is null then
    return query select false, false;
    return;
  end if;

  return query
  select
    EXISTS(
      SELECT 1 FROM public.clients c
      WHERE c.user_id = _auth_uid AND c.status = 'active'
    ) as is_client,
    EXISTS(
      SELECT 1 FROM public.coach_memberships m
      WHERE m.user_id = _auth_uid 
        AND m.status = 'active'
        AND m.role IN ('owner', 'coach')
    ) as is_coach;
end;
$$;

-- 3. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO anon; -- For safety in middleware if auth is missing/stale

COMMIT;

-- 4. RELOAD SCHEMA
SELECT pg_notify('pgrst', 'reload schema');
