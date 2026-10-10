-- Medidas diarias adicionales (VFC, puntuación del sueño, fatiga).
-- Aplicada en SaaS Asesorias el 2026-10-10. Solo añade columnas.
--
-- · client_metrics: valores del día. Peso, pasos y horas de sueño siguen igual.
-- · clients.daily_metrics_enabled: adicionales que el coach pide a cada atleta.

alter table public.client_metrics
    add column if not exists hrv_ms numeric null,
    add column if not exists sleep_score smallint null,
    add column if not exists fatigue smallint null;

alter table public.client_metrics
    drop constraint if exists client_metrics_hrv_ms_check,
    add constraint client_metrics_hrv_ms_check check (hrv_ms is null or (hrv_ms > 0 and hrv_ms <= 400)),
    drop constraint if exists client_metrics_sleep_score_check,
    add constraint client_metrics_sleep_score_check check (sleep_score is null or sleep_score between 0 and 100),
    drop constraint if exists client_metrics_fatigue_check,
    add constraint client_metrics_fatigue_check check (fatigue is null or fatigue between 1 and 5);

alter table public.clients
    add column if not exists daily_metrics_enabled text[] not null default '{}';

alter table public.clients
    drop constraint if exists clients_daily_metrics_enabled_check,
    add constraint clients_daily_metrics_enabled_check
        check (daily_metrics_enabled <@ array['hrv', 'sleep_score', 'fatigue']::text[]);
