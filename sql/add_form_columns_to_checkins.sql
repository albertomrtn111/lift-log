-- Add form-based columns to checkins table
-- Existing rows get safe defaults: type='checkin', status='reviewed', source='legacy'

ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'checkin',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'reviewed',
  ADD COLUMN IF NOT EXISTS form_template_id uuid REFERENCES public.form_templates(id),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS raw_payload jsonb DEFAULT '{}'::jsonb;

-- Index for quick lookup of pending onboarding per client
CREATE INDEX IF NOT EXISTS idx_checkins_onboarding_pending
  ON public.checkins (coach_id, client_id, type, status)
  WHERE type = 'onboarding' AND status = 'pending';
