ALTER TABLE public.reviews
DROP CONSTRAINT IF EXISTS reviews_ai_status_check;

ALTER TABLE public.reviews
ADD CONSTRAINT reviews_ai_status_check
CHECK (ai_status IN ('idle', 'pending', 'completed', 'failed'));

ALTER TABLE public.reviews
ALTER COLUMN ai_status SET DEFAULT 'idle';

SELECT pg_notify('pgrst', 'reload schema');
