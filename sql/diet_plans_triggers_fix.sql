-- ============================================================================
-- 1. INSPECCIONAR TRIGGERS EXISTENTES
-- Ejecuta esto para ver qué triggers hay en diet_plans
-- ============================================================================
SELECT 
    trg.tgname,
    pg_get_triggerdef(trg.oid) as definition
FROM pg_trigger trg
JOIN pg_class tbl ON trg.tgrelid = tbl.oid
WHERE tbl.relname = 'diet_plans' AND trg.tgisinternal = false;

-- ============================================================================
-- 2. FUNCIÓN PARA GESTIONAR PLAN ACTIVO ÚNICO
-- Esta función asegura que al insertar/actualizar un plan a 'active',
-- se archiven los anteriores del mismo cliente.
-- CLAVE: Excluye el propio registro (id <> NEW.id) para no auto-archivarse.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_active_diet_plan()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo actuar si el estado es 'active'
    IF NEW.status = 'active' THEN
        UPDATE public.diet_plans
        SET 
            status = 'archived',
            effective_to = Current_Date
        WHERE 
            client_id = NEW.client_id 
            AND status = 'active' 
            AND id <> NEW.id; -- EXCLIUR EL PLAN ACTUAL
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. CREAR/REEMPLAZAR EL TRIGGER
-- Se ejecuta ANTES de insertar o actualizar para preparar el terreno.
-- ============================================================================
DROP TRIGGER IF EXISTS on_diet_plan_active_check ON public.diet_plans;

CREATE TRIGGER on_diet_plan_active_check
BEFORE INSERT OR UPDATE OF status ON public.diet_plans
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.handle_active_diet_plan();
