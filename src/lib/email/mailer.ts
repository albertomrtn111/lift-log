/**
 * Email sender — server-side only (sustituye a los webhooks de n8n).
 *
 * Usa SMTP vía nodemailer. Config por variables de entorno:
 *   SMTP_HOST      p.ej. smtp.gmail.com
 *   SMTP_PORT      p.ej. 465 (SSL) o 587 (STARTTLS)
 *   SMTP_USER      usuario/cuenta
 *   SMTP_PASS      contraseña (en Gmail: contraseña de aplicación)
 *   SMTP_FROM      remitente, p.ej. "NexTrain <no-reply@ascenttech.cloud>"
 *
 * Si SMTP no está configurado, las funciones devuelven { ok: false } sin
 * lanzar — igual de non-blocking que era la llamada a n8n.
 */

import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import { getCoachSmtpConfig, type CoachSmtpConfig } from '@/lib/email/coach-settings'

export interface EmailResult {
    ok: boolean
    error?: string
    /** 'coach' si salió por el SMTP del entrenador, 'global' si por el de la app */
    via?: 'coach' | 'global'
}

function isGlobalConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function buildTransport(config: { host: string; port: number; user: string; pass: string }) {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
    })
}

function globalTransportConfig() {
    return {
        host: process.env.SMTP_HOST as string,
        port: Number(process.env.SMTP_PORT ?? 465),
        user: process.env.SMTP_USER as string,
        pass: process.env.SMTP_PASS as string,
    }
}

function coachFrom(config: CoachSmtpConfig): string {
    const email = config.fromEmail || config.user
    return config.fromName ? `"${config.fromName}" <${email}>` : email
}

function globalFrom(): string {
    return process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost'
}

/**
 * Envía un email. Si se pasa coachId y el entrenador tiene SMTP propio
 * configurado, sale desde SU cuenta; si no, cae al SMTP global de la app.
 */
async function send(options: Mail.Options, coachId?: string): Promise<EmailResult> {
    // 1) SMTP del coach (si existe)
    if (coachId) {
        const coachConfig = await getCoachSmtpConfig(coachId).catch(() => null)
        if (coachConfig) {
            try {
                await buildTransport(coachConfig).sendMail({
                    from: coachFrom(coachConfig),
                    ...options,
                })
                console.log(`[mailer] ✅ (coach ${coachId}) Email enviado a ${options.to} — ${options.subject}`)
                return { ok: true, via: 'coach' }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(`[mailer] ❌ SMTP del coach ${coachId} falló (${message}) — probando SMTP global`)
                // seguimos al fallback global
            }
        }
    }

    // 2) SMTP global de la app
    if (!isGlobalConfigured()) {
        console.warn('[mailer] SMTP no configurado (ni coach ni global) — email no enviado')
        return { ok: false, error: 'SMTP no configurado' }
    }
    try {
        await buildTransport(globalTransportConfig()).sendMail({ from: globalFrom(), ...options })
        console.log(`[mailer] ✅ (global) Email enviado a ${options.to} — ${options.subject}`)
        return { ok: true, via: 'global' }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[mailer] ❌ Error enviando a ${options.to}:`, message)
        return { ok: false, error: message }
    }
}

/** Escapa texto que va dentro del HTML del email (nombres, plantillas, etc.). */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// Layout base
// ---------------------------------------------------------------------------

function layout(title: string, bodyHtml: string, ctaLabel?: string, rawCtaUrl?: string): string {
    const ctaUrl = rawCtaUrl ? escapeHtml(rawCtaUrl) : undefined
    const button = ctaLabel && ctaUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
             <tr><td style="border-radius:8px;background:#111827;">
               <a href="${ctaUrl}" target="_blank"
                  style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                 ${ctaLabel}
               </a>
             </td></tr>
           </table>
           <p style="font-size:12px;color:#6b7280;text-align:center;margin:8px 0 0;">
             Si el botón no funciona, copia este enlace:<br/>
             <a href="${ctaUrl}" style="color:#2563eb;word-break:break-all;">${ctaUrl}</a>
           </p>`
        : ''

    return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:12px;padding:36px 32px;text-align:left;">
        <tr><td>
          <h1 style="margin:0 0 18px;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#374151;">
            ${bodyHtml}
          </div>
          ${button}
        </td></tr>
      </table>
      <p style="font-size:11px;color:#9ca3af;margin-top:16px;">
        Este email se ha enviado automáticamente desde NexTrain.
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Emails de la app (mismos flujos que cubría n8n)
// ---------------------------------------------------------------------------

export async function sendReviewEmailSmtp(params: {
    to: string
    clientName?: string
    formUrl: string
    reviewTemplateName?: string
    periodEnd?: string | null
    coachId?: string
}): Promise<EmailResult> {
    const name = escapeHtml(params.clientName?.trim() || 'atleta')
    const rawReviewName = params.reviewTemplateName?.trim() || 'Revisión'
    const reviewName = escapeHtml(rawReviewName)
    const subject = `📋 Tu ${rawReviewName.toLowerCase()} está lista — completa tu check-in`

    const body = `
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu entrenador ha preparado tu <strong>${reviewName}</strong>.
        Rellena el formulario con tus datos y fotos de progreso para que pueda
        valorar cómo ha ido el periodo y ajustar tu plan.</p>
        <p>Cuanto antes lo completes, antes tendrás tu feedback. 💪</p>`

    return send(
        {
            to: params.to,
            subject,
            html: layout(`${rawReviewName} pendiente`, body, 'Completar mi revisión', params.formUrl),
        },
        params.coachId
    )
}

/** Último recordatorio de una revisión sin responder (el día antes de que se archive). */
export async function sendReviewReminderEmailSmtp(params: {
    to: string
    clientName?: string
    formUrl: string
    reviewTemplateName?: string
    archivesTomorrow: boolean
    coachId?: string
}): Promise<EmailResult> {
    const name = escapeHtml(params.clientName?.trim() || 'atleta')
    const rawReviewName = params.reviewTemplateName?.trim() || 'Revisión'
    const reviewName = escapeHtml(rawReviewName)
    const subject = params.archivesTomorrow
        ? `⏰ Último día para enviar tu ${rawReviewName.toLowerCase()}`
        : `⏰ Tu ${rawReviewName.toLowerCase()} sigue pendiente`

    const deadline = params.archivesTomorrow
        ? '<p>Mañana se archiva y tu entrenador ya no podrá revisarla.</p>'
        : ''
    const body = `
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu entrenador sigue esperando tu <strong>${reviewName}</strong> para valorar
        cómo ha ido el periodo y ajustar tu plan.</p>
        ${deadline}`

    return send(
        {
            to: params.to,
            subject,
            html: layout(`${rawReviewName} pendiente`, body, 'Completar mi revisión', params.formUrl),
        },
        params.coachId
    )
}

export async function sendOnboardingEmailSmtp(params: {
    to: string
    clientName?: string
    formUrl: string
    coachId?: string
}): Promise<EmailResult> {
    const name = escapeHtml(params.clientName?.trim() || 'atleta')
    const body = `
        <p>Hola <strong>${name}</strong>, ¡bienvenido/a! 🎉</p>
        <p>Para empezar a trabajar juntos, tu entrenador necesita conocerte mejor.
        Completa el formulario inicial con tus datos, objetivos y fotos de partida.</p>
        <p>Con esa información prepararemos tu primer plan de entrenamiento y nutrición.</p>`

    return send(
        {
            to: params.to,
            subject: '🚀 Bienvenido/a — completa tu formulario inicial',
            html: layout('Formulario de inicio', body, 'Completar formulario inicial', params.formUrl),
        },
        params.coachId
    )
}

export async function sendInviteEmailSmtp(params: {
    to: string
    clientName?: string
    tempPassword?: string | null
    appUrl: string
    coachId?: string
}): Promise<EmailResult> {
    const name = escapeHtml(params.clientName?.trim() || 'atleta')
    const passwordBlock = params.tempPassword
        ? `<p>Tu contraseña temporal es:</p>
           <p style="font-size:18px;font-weight:700;letter-spacing:1px;background:#f3f4f6;
                     padding:10px 16px;border-radius:8px;display:inline-block;">
             ${escapeHtml(params.tempPassword)}
           </p>
           <p>Al entrar por primera vez podrás cambiarla.</p>`
        : `<p>Regístrate con este mismo email para que tu cuenta quede vinculada con tu entrenador.</p>`

    const body = `
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu entrenador te ha invitado a su plataforma de seguimiento.
        Desde ahí verás tu plan de entrenamiento, dieta, revisiones y progreso.</p>
        ${passwordBlock}`

    return send(
        {
            to: params.to,
            subject: '🔑 Invitación a tu plataforma de entrenamiento',
            html: layout('Te han invitado', body, 'Acceder a la plataforma', `${params.appUrl}/login`),
        },
        params.coachId
    )
}

/** Email de prueba para validar la configuración SMTP del coach */
export async function sendTestEmail(params: { to: string; coachId: string }): Promise<EmailResult> {
    const body = `
        <p>¡Buenas noticias! 🎉</p>
        <p>Tu cuenta de email está correctamente configurada. A partir de ahora,
        las revisiones, invitaciones y formularios de onboarding que envíes a tus
        atletas saldrán desde esta dirección.</p>`

    return send(
        {
            to: params.to,
            subject: '✅ Email de prueba — configuración correcta',
            html: layout('Configuración verificada', body),
        },
        params.coachId
    )
}

// ---------------------------------------------------------------------------
// Invitación del onboarding guiado
// ---------------------------------------------------------------------------

/** Escapa texto que va dentro del HTML del email de invitación */
function escapeInviteText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * Email "Álex te ha invitado a entrenar en NexTrain". Un solo botón con el
 * enlace de acceso; si el coach puso contraseña inicial, se muestra y el
 * botón lleva al login.
 */
export interface AthleteInviteEmailParams {
    to: string
    athleteName?: string | null
    coachName: string
    businessName?: string | null
    accessUrl: string
    tempPassword?: string | null
    coachId?: string
}

export function buildAthleteInviteEmail(params: AthleteInviteEmailParams): { subject: string; html: string } {
    const athleteFirstName = escapeInviteText(params.athleteName?.trim().split(/\s+/)[0] || 'atleta')
    const coach = escapeInviteText(params.coachName.trim())
    const business = params.businessName?.trim() && params.businessName.trim() !== params.coachName.trim()
        ? ` (${escapeInviteText(params.businessName.trim())})`
        : ''

    const accessBlock = params.tempPassword
        ? `<p>Tu contraseña temporal es:</p>
           <p style="font-size:18px;font-weight:700;letter-spacing:1px;background:#f3f4f6;
                     padding:10px 16px;border-radius:8px;display:inline-block;">
             ${escapeInviteText(params.tempPassword)}
           </p>
           <p>Entra con tu email y esta contraseña; luego podrás cambiarla.</p>`
        : `<p>Solo tienes que crear tu contraseña. En unos minutos tendrás todo listo.</p>`

    const body = `
        <p>Hola, <strong>${athleteFirstName}</strong>:</p>
        <p>${coach}${business} te ha dado de alta en NexTrain, la app donde verás tu plan,
        registrarás tus entrenamientos y hablarás con ${coach}.</p>
        ${accessBlock}
        <p style="margin-top:20px;padding:12px 14px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:14px;">
          📱 <strong>Ábrelo en el móvil donde vas a usar la app.</strong>
          Si lo abres en otro dispositivo o navegador, el enlace puede no funcionar.
        </p>
        <p style="font-size:13px;color:#6b7280;">Si el enlace ha caducado, pide a ${coach} que te reenvíe la invitación.</p>`

    return {
        subject: `${params.coachName.trim()} te ha invitado a entrenar en NexTrain`,
        html: layout('Tu acceso a NexTrain', body, params.tempPassword ? 'Entrar en NexTrain' : 'Crear mi acceso', params.accessUrl),
    }
}

export async function sendAthleteInviteEmail(params: AthleteInviteEmailParams): Promise<EmailResult> {
    const { subject, html } = buildAthleteInviteEmail(params)
    return send({ to: params.to, subject, html }, params.coachId)
}
