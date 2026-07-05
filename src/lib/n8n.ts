/**
 * DEPRECATED — 2026-07-05
 *
 * Los flujos de revisiones, onboarding e invitaciones ya NO pasan por n8n:
 *   - Emails:             src/lib/email/mailer.ts  (SMTP con nodemailer)
 *   - Cron de revisiones: src/lib/reviews/scheduler.ts + /api/cron/reviews
 *                         (disparado por pg_cron desde Supabase)
 *
 * n8n queda únicamente para el flujo de pagos, que no toca este código.
 * Este fichero se mantiene vacío a propósito para dejar constancia del cambio;
 * se puede borrar sin efectos.
 */

export {}
