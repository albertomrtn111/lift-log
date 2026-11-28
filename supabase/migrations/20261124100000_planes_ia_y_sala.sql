-- NXT-152: qué incluye cada plan, decidido por el dueño el 2026-11-24.
--
-- * IA dentro de la app (Gemini): desde Pro. Starter solo tiene el asistente externo por MCP,
--   que no pasa por aquí.
-- * Modo Sala no va en ningún plan: de momento es solo para ClubØ, como excepción por espacio
--   en coach_feature_overrides. Las excepciones de los espacios que ya lo usan se crean aparte,
--   antes de aplicar esta migración, para que no pierdan la sala ni un momento.
-- * Marca propia (branding): solo Studio y Concierge, como ya estaba.

insert into public.plan_features (plan, feature, enabled, limit_value) values
    ('starter', 'ai', false, null),
    ('pro', 'ai', true, null),
    ('studio', 'ai', true, null),
    ('concierge', 'ai', true, null)
on conflict (plan, feature) do update set enabled = excluded.enabled, limit_value = excluded.limit_value;

update public.plan_features set enabled = false where feature = 'studio_mode';
