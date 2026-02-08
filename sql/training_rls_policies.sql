-- ALINEACIÓN DE RLS Y POLÍTICAS DE ENTRENAMIENTO
-- Objetivo: RLS robusto para coaches (is_coach_member) y clientes.

BEGIN;

-- 1. ASEGURAR ON DELETE CASCADE (Idempotente)
-- training_days
ALTER TABLE public.training_days 
DROP CONSTRAINT IF EXISTS training_days_program_id_fkey,
ADD CONSTRAINT training_days_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE;

-- training_columns
ALTER TABLE public.training_columns 
DROP CONSTRAINT IF EXISTS training_columns_program_id_fkey,
ADD CONSTRAINT training_columns_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE;

-- training_exercises
ALTER TABLE public.training_exercises 
DROP CONSTRAINT IF EXISTS training_exercises_program_id_fkey,
ADD CONSTRAINT training_exercises_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE,
DROP CONSTRAINT IF EXISTS training_exercises_day_id_fkey,
ADD CONSTRAINT training_exercises_day_id_fkey 
FOREIGN KEY (day_id) REFERENCES public.training_days(id) ON DELETE CASCADE;

-- training_cells
ALTER TABLE public.training_cells 
DROP CONSTRAINT IF EXISTS training_cells_program_id_fkey,
ADD CONSTRAINT training_cells_program_id_fkey 
FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE,
DROP CONSTRAINT IF EXISTS training_cells_day_id_fkey,
ADD CONSTRAINT training_cells_day_id_fkey 
FOREIGN KEY (day_id) REFERENCES public.training_days(id) ON DELETE CASCADE,
DROP CONSTRAINT IF EXISTS training_cells_exercise_id_fkey,
ADD CONSTRAINT training_cells_exercise_id_fkey 
FOREIGN KEY (exercise_id) REFERENCES public.training_exercises(id) ON DELETE CASCADE,
DROP CONSTRAINT IF EXISTS training_cells_column_id_fkey,
ADD CONSTRAINT training_cells_column_id_fkey 
FOREIGN KEY (column_id) REFERENCES public.training_columns(id) ON DELETE CASCADE;

-- 2. HABILITAR RLS
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_cells ENABLE ROW LEVEL SECURITY;

-- 3. LIMPIEZA DE POLÍTICAS EXISTENTES (Evitar duplicados o conflictos)
DROP POLICY IF EXISTS programs_rw_member ON public.training_programs;
DROP POLICY IF EXISTS programs_select_member ON public.training_programs;
DROP POLICY IF EXISTS programs_select_self ON public.training_programs;

DROP POLICY IF EXISTS training_days_coach_all ON public.training_days;
DROP POLICY IF EXISTS training_days_select_client ON public.training_days;

DROP POLICY IF EXISTS columns_rw_member ON public.training_columns;
DROP POLICY IF EXISTS columns_select_member ON public.training_columns;
DROP POLICY IF EXISTS columns_select_self ON public.training_columns;

DROP POLICY IF EXISTS exercises_rw_member ON public.training_exercises;
DROP POLICY IF EXISTS exercises_select_self ON public.training_exercises;

DROP POLICY IF EXISTS cells_rw_member ON public.training_cells;
DROP POLICY IF EXISTS cells_insert_self ON public.training_cells;
DROP POLICY IF EXISTS cells_select_self ON public.training_cells;
DROP POLICY IF EXISTS cells_update_self ON public.training_cells;

-- 4. NUEVAS POLÍTICAS DE ENTRENAMIENTO (OWNER/COACH)

-- training_programs
CREATE POLICY training_programs_coach_all ON public.training_programs
    FOR ALL TO authenticated
    USING (is_coach_member(coach_id))
    WITH CHECK (is_coach_member(coach_id));

CREATE POLICY training_programs_client_select ON public.training_programs
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

-- training_days
CREATE POLICY training_days_coach_all ON public.training_days
    FOR ALL TO authenticated
    USING (is_coach_member(coach_id))
    WITH CHECK (is_coach_member(coach_id));

CREATE POLICY training_days_client_select ON public.training_days
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.training_programs tp WHERE tp.id = program_id AND tp.client_id = auth.uid()));

-- training_columns
CREATE POLICY training_columns_coach_all ON public.training_columns
    FOR ALL TO authenticated
    USING (is_coach_member(coach_id))
    WITH CHECK (is_coach_member(coach_id));

CREATE POLICY training_columns_client_select ON public.training_columns
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.training_programs tp WHERE tp.id = program_id AND tp.client_id = auth.uid()));

-- training_exercises
CREATE POLICY training_exercises_coach_all ON public.training_exercises
    FOR ALL TO authenticated
    USING (is_coach_member(coach_id))
    WITH CHECK (is_coach_member(coach_id));

CREATE POLICY training_exercises_client_select ON public.training_exercises
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.training_programs tp WHERE tp.id = program_id AND tp.client_id = auth.uid()));

-- training_cells
CREATE POLICY training_cells_coach_all ON public.training_cells
    FOR ALL TO authenticated
    USING (is_coach_member(coach_id))
    WITH CHECK (is_coach_member(coach_id));

CREATE POLICY training_cells_client_select ON public.training_cells
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.training_programs tp WHERE tp.id = program_id AND tp.client_id = auth.uid()));

CREATE POLICY training_cells_client_update ON public.training_cells
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.training_programs tp 
            JOIN public.training_columns tc ON tc.program_id = tp.id
            WHERE tp.id = public.training_cells.program_id 
            AND tc.id = public.training_cells.column_id
            AND tp.client_id = auth.uid()
            AND (tc.editable_by = 'client' OR tc.editable_by = 'both')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.training_programs tp 
            JOIN public.training_columns tc ON tc.program_id = tp.id
            WHERE tp.id = public.training_cells.program_id 
            AND tc.id = public.training_cells.column_id
            AND tp.client_id = auth.uid()
            AND (tc.editable_by = 'client' OR tc.editable_by = 'both')
        )
    );

COMMIT;

-- Recargar esquema para PostgREST
SELECT pg_notify('pgrst', 'reload schema');
