ALTER TABLE public.training_exercises
ALTER COLUMN muscle_group SET DEFAULT 'otros';

UPDATE public.training_exercises
SET muscle_group = 'otros'
WHERE muscle_group IS NULL;

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
