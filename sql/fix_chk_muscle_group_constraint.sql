-- ============================================================
-- FIX: Elimina el constraint antiguo "chk_training_exercises_muscle_group"
-- que convive con "training_exercises_muscle_group_check" y tiene
-- una lista de valores distinta (o no incluye 'otros').
--
-- Ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

-- 1. Borrar el constraint conflictivo (nombre antiguo con prefijo chk_)
ALTER TABLE public.training_exercises
DROP CONSTRAINT IF EXISTS chk_training_exercises_muscle_group;

-- 2. Aseguramos que el constraint correcto existe con la lista completa
ALTER TABLE public.training_exercises
DROP CONSTRAINT IF EXISTS training_exercises_muscle_group_check;

ALTER TABLE public.training_exercises
ADD CONSTRAINT training_exercises_muscle_group_check
CHECK (
    muscle_group IS NULL OR muscle_group IN (
        'hombro',
        'pecho',
        'espalda',
        'abdomen',
        'cuádriceps',
        'femorales',
        'gemelos',
        'tríceps',
        'bíceps',
        'glúteo',
        'aductores',
        'otros'
    )
);

-- 3. Aseguramos DEFAULT correcto
ALTER TABLE public.training_exercises
ALTER COLUMN muscle_group SET DEFAULT 'otros';

-- 4. Normalizamos filas con NULL (por si quedaron de antes)
UPDATE public.training_exercises
SET muscle_group = 'otros'
WHERE muscle_group IS NULL;
