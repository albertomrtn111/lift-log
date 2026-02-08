-- RLS Policies for clients table
-- Execute these in Supabase SQL Editor

-- 1. Allow coaches/owners to SELECT their clients
CREATE POLICY "clients_select_by_coach"
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_memberships m
    WHERE m.coach_id = clients.coach_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'coach')
  )
);

-- 2. Allow coaches/owners to INSERT clients for their coach
CREATE POLICY "clients_insert_by_coach"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coach_memberships m
    WHERE m.coach_id = clients.coach_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'coach')
  )
);

-- 3. Allow coaches/owners to UPDATE their clients
CREATE POLICY "clients_update_by_coach"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_memberships m
    WHERE m.coach_id = clients.coach_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'coach')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coach_memberships m
    WHERE m.coach_id = clients.coach_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'coach')
  )
);

-- Note: We do NOT add DELETE policy - clients should be deactivated, not deleted
