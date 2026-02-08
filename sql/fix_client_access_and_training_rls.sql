-- FIX CLIENT ACCESS AND TRAINING RLS POLICIES
-- Objective: Ensure clients can see their own records and training data via user_id join.

BEGIN;

-- 1. FIX: public.clients RLS
-- Allow clients to see their own record
DROP POLICY IF EXISTS "clients_select_self" ON public.clients;
CREATE POLICY "clients_select_self"
ON public.clients
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Opcional: permitir UPDATE limitado del cliente (ej. nombre)
DROP POLICY IF EXISTS "clients_update_self" ON public.clients;
CREATE POLICY "clients_update_self"
ON public.clients
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- 2. FIX: training_programs RLS
-- Error previo: USING (client_id = auth.uid())
DROP POLICY IF EXISTS "training_programs_client_select" ON public.training_programs;
CREATE POLICY "training_programs_client_select"
ON public.training_programs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c 
        WHERE c.id = public.training_programs.client_id 
        AND c.user_id = auth.uid() 
        AND c.status = 'active'
    )
);


-- 3. FIX: training_days RLS
DROP POLICY IF EXISTS "training_days_client_select" ON public.training_days;
CREATE POLICY "training_days_client_select"
ON public.training_days
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.training_programs tp
        JOIN public.clients c ON c.id = tp.client_id
        WHERE tp.id = public.training_days.program_id 
        AND c.user_id = auth.uid()
        AND c.status = 'active'
    )
);


-- 4. FIX: training_columns RLS
DROP POLICY IF EXISTS "training_columns_client_select" ON public.training_columns;
CREATE POLICY "training_columns_client_select"
ON public.training_columns
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.training_programs tp
        JOIN public.clients c ON c.id = tp.client_id
        WHERE tp.id = public.training_columns.program_id 
        AND c.user_id = auth.uid()
        AND c.status = 'active'
    )
);


-- 5. FIX: training_exercises RLS
DROP POLICY IF EXISTS "training_exercises_client_select" ON public.training_exercises;
CREATE POLICY "training_exercises_client_select"
ON public.training_exercises
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.training_programs tp
        JOIN public.clients c ON c.id = tp.client_id
        WHERE tp.id = public.training_exercises.program_id 
        AND c.user_id = auth.uid()
        AND c.status = 'active'
    )
);


-- 6. FIX: training_cells RLS
-- Select cells
DROP POLICY IF EXISTS "training_cells_client_select" ON public.training_cells;
CREATE POLICY "training_cells_client_select"
ON public.training_cells
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.training_programs tp
        JOIN public.clients c ON c.id = tp.client_id
        WHERE tp.id = public.training_cells.program_id 
        AND c.user_id = auth.uid()
        AND c.status = 'active'
    )
);

-- Update cells (adhering to column editable_by)
DROP POLICY IF EXISTS "training_cells_client_update" ON public.training_cells;
CREATE POLICY "training_cells_client_update"
ON public.training_cells
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.training_programs tp 
        JOIN public.clients c ON c.id = tp.client_id
        JOIN public.training_columns tc ON tc.program_id = tp.id
        WHERE tp.id = public.training_cells.program_id 
        AND tc.id = public.training_cells.column_id
        AND c.user_id = auth.uid()
        AND c.status = 'active'
        AND (tc.editable_by = 'client' OR tc.editable_by = 'both')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.training_programs tp 
        JOIN public.clients c ON c.id = tp.client_id
        JOIN public.training_columns tc ON tc.program_id = tp.id
        WHERE tp.id = public.training_cells.program_id 
        AND tc.id = public.training_cells.column_id
        AND c.user_id = auth.uid()
        AND c.status = 'active'
        AND (tc.editable_by = 'client' OR tc.editable_by = 'both')
    )
);

COMMIT;

-- Reload Schema for PostgREST
SELECT pg_notify('pgrst', 'reload schema');
