-- Fase 3: «Revisiones por email» es una preferencia nueva (por defecto, sí).
-- Antes, apagar «Revisiones» también quitaba el email; quien lo tenía apagado
-- conserva esa decisión para el email.
update public.client_notification_preferences
set reviews_email_enabled = false,
    updated_at = now()
where reviews_enabled = false
  and reviews_email_enabled = true;
