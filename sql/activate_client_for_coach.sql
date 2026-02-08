-- ACTIVATE CLIENT FOR COACH RPC
-- Manual UPSERT for clients (no unique constraint on email+coach_id)
-- SECURITY DEFINER to bypass RLS

BEGIN;

DROP FUNCTION IF EXISTS public.activate_client_for_coach(uuid, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.activate_client_for_coach(
  p_coach_id uuid,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_start_date text DEFAULT NULL,
  p_checkin_frequency_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_client_id uuid;
  v_existing_id uuid;
  v_start date := COALESCE(p_start_date::date, CURRENT_DATE);
  v_next_checkin date := v_start + p_checkin_frequency_days;
  v_result jsonb;
begin
  -- 1. Check if client already exists for this coach (by email)
  SELECT id INTO v_existing_id
  FROM public.clients
  WHERE email = p_email AND coach_id = p_coach_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE existing client to active
    UPDATE public.clients SET
      full_name = p_full_name,
      phone = p_phone,
      status = 'active',
      start_date = v_start,
      checkin_frequency_days = p_checkin_frequency_days,
      next_checkin_date = v_next_checkin,
      updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING id INTO v_client_id;
  ELSE
    -- INSERT new client
    INSERT INTO public.clients (
      coach_id,
      user_id,
      full_name,
      email,
      phone,
      status,
      start_date,
      checkin_frequency_days,
      next_checkin_date,
      created_at,
      updated_at
    )
    VALUES (
      p_coach_id,
      NULL,
      p_full_name,
      p_email,
      p_phone,
      'active',
      v_start,
      p_checkin_frequency_days,
      v_next_checkin,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_client_id;
  END IF;

  -- 2. Build result JSON
  SELECT jsonb_build_object(
    'id', c.id,
    'coach_id', c.coach_id,
    'user_id', c.user_id,
    'full_name', c.full_name,
    'email', c.email,
    'phone', c.phone,
    'status', c.status,
    'start_date', c.start_date,
    'checkin_frequency_days', c.checkin_frequency_days,
    'next_checkin_date', c.next_checkin_date
  ) INTO v_result
  FROM public.clients c
  WHERE c.id = v_client_id;

  RETURN v_result;
end;
$$;

GRANT EXECUTE ON FUNCTION public.activate_client_for_coach(uuid, text, text, text, text, integer) TO authenticated;

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
