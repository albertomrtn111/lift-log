-- Add AI assistant tracking fields to coach reviews
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS ai_status TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL,
ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS ai_error TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reviews_ai_status_check'
    ) THEN
        ALTER TABLE public.reviews
        ADD CONSTRAINT reviews_ai_status_check
        CHECK (ai_status IN ('idle', 'pending', 'completed', 'failed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reviews_ai_status
    ON public.reviews (ai_status);

CREATE INDEX IF NOT EXISTS idx_reviews_checkin_id
    ON public.reviews (checkin_id);
