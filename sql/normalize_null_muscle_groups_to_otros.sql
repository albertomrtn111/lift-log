ALTER TABLE public.training_exercises
ALTER COLUMN muscle_group SET DEFAULT 'otros';

UPDATE public.training_exercises
SET muscle_group = 'otros'
WHERE muscle_group IS NULL;
