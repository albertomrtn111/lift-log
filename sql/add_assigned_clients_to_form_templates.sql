-- Allow assigning check-in templates to specific clients.
-- The app keeps assignments exclusive per client at the application layer.

ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS assigned_client_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_form_templates_assigned_client_ids
  ON public.form_templates
  USING GIN (assigned_client_ids);

CREATE OR REPLACE FUNCTION public.resolve_checkin_template_for_client(
  p_coach_id uuid,
  p_client_id uuid
)
RETURNS TABLE (
  id uuid,
  title text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ft.id,
    ft.title
  FROM public.form_templates ft
  WHERE ft.coach_id = p_coach_id
    AND ft.type = 'checkin'
    AND ft.is_active = true
    AND (
      p_client_id = ANY(ft.assigned_client_ids)
      OR ft.is_default = true
    )
  ORDER BY
    CASE
      WHEN p_client_id = ANY(ft.assigned_client_ids) THEN 0
      ELSE 1
    END,
    ft.created_at DESC
  LIMIT 1;
$$;
