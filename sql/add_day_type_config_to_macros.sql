-- Añadir soporte para macros por tipo de día (entreno/descanso)
-- Cuando es NULL = configuración simple (usa las columnas kcal/protein_g/carbs_g/fat_g directamente).
-- Cuando tiene valor = configuración por tipo de día.
-- Estructura esperada:
-- {
--   "training": { "kcal": 2500, "protein_g": 180, "carbs_g": 300, "fat_g": 70 },
--   "rest":     { "kcal": 1800, "protein_g": 160, "carbs_g": 150, "fat_g": 65 }
-- }

ALTER TABLE macro_plans
  ADD COLUMN IF NOT EXISTS day_type_config jsonb DEFAULT NULL;
