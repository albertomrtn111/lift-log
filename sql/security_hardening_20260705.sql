-- ============================================================================
-- SECURITY HARDENING (2026-07-05)
-- Aplicado en Supabase como migración: security_hardening_rls_and_definer_functions
-- Copia de referencia para el repo.
--
-- 1) RLS habilitado en las 9 tablas que lo tenían desactivado
-- 2) activate_client_for_coach ahora valida membership del llamador
-- 3) SECURITY DEFINER functions: REVOKE de PUBLIC/anon, GRANT solo a
--    authenticated (necesario para evaluar policies RLS) + service_role
-- ============================================================================

-- 1) RLS (sin policies: acceso solo via service role hasta definir policies)
ALTER TABLE public.diet_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_template_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_template_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invite_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bak_diet_plans_20260207_145924 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bak_diet_meals_20260207_145924 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bak_diet_meal_options_20260207_145924 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bak_diet_meal_items_20260207_145924 ENABLE ROW LEVEL SECURITY;

-- 2) activate_client_for_coach: check de membership al inicio
--    (cuerpo idéntico al original + guard)
CREATE OR REPLACE FUNCTION public.activate_client_for_coach(
  p_coach_id uuid,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL::text,
  p_start_date text DEFAULT NULL::text,
  p_checkin_frequency_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_existing_id uuid;
  v_start date := COALESCE(p_start_date::date, CURRENT_DATE);
  v_next_checkin date := v_start + p_checkin_frequency_days;
  v_result jsonb;
begin
  -- SECURITY: only active members (owner/coach) of this coach may call this
  IF NOT public.is_coach_member(p_coach_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no es miembro activo de este coach';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.clients
  WHERE email = p_email AND coach_id = p_coach_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
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
    INSERT INTO public.clients (
      coach_id, user_id, auth_user_id, full_name, email, phone, status,
      start_date, checkin_frequency_days, next_checkin_date,
      onboarding_status, invite_status, created_at, updated_at
    )
    VALUES (
      p_coach_id, NULL, NULL, p_full_name, p_email, p_phone, 'active',
      v_start, p_checkin_frequency_days, v_next_checkin,
      'pending', 'pending', NOW(), NOW()
    )
    RETURNING id INTO v_client_id;
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'coach_id', c.coach_id,
    'user_id', c.user_id,
    'auth_user_id', c.auth_user_id,
    'full_name', c.full_name,
    'email', c.email,
    'phone', c.phone,
    'status', c.status,
    'start_date', c.start_date,
    'checkin_frequency_days', c.checkin_frequency_days,
    'next_checkin_date', c.next_checkin_date,
    'onboarding_status', c.onboarding_status,
    'invite_status', c.invite_status,
    'invited_at', c.invited_at
  ) INTO v_result
  FROM public.clients c
  WHERE c.id = v_client_id;

  RETURN v_result;
end;
$function$;

-- 3) Lockdown de funciones SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.activate_client_for_coach(uuid, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.activate_client_for_coach(uuid, text, text, text, text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_client_write_cell(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_client_write_cell(uuid, uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_coach_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_coach_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_roles() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_client(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_client(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_client_for_diet_option(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_client_for_diet_option(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_client_for_diet_plan(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_client_for_diet_plan(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_client_in_coach(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_client_in_coach(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_client_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_client_user(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_coach_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_coach_for_diet_option(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach_for_diet_option(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_coach_for_diet_plan(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach_for_diet_plan(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_coach_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach_member(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_coach_owner(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach_owner(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_plan_for_current_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_plan_for_current_user(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_program_client(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_program_client(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.diet_meal_items_fill_owner() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diet_meal_items_fill_owner() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.diet_meal_options_fill_owner() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diet_meal_options_fill_owner() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.diet_meals_fill_owner() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.diet_meals_fill_owner() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_form_templates_coach_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_form_templates_coach_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.handle_new_auth_user() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.link_client_on_profile_insert() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.link_client_on_profile_insert() TO authenticated, service_role;
