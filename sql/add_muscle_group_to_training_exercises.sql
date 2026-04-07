ALTER TABLE public.training_exercises
ADD COLUMN IF NOT EXISTS muscle_group TEXT NULL;

ALTER TABLE public.training_exercises
ALTER COLUMN muscle_group SET DEFAULT 'otros';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'training_exercises_muscle_group_check'
    ) THEN
        ALTER TABLE public.training_exercises
        DROP CONSTRAINT training_exercises_muscle_group_check;
    END IF;

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
END $$;

UPDATE public.training_exercises
SET muscle_group = 'otros'
WHERE muscle_group IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_exercises_muscle_group
    ON public.training_exercises (muscle_group);
