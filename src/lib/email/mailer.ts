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
 * Hay dos clases de email:
 *   - De acceso (sendAccessEmail): invitaciones, enlaces de acceso, contraseñas.
 *     Salen SIEMPRE por el correo de NexTrain, nunca por el del espacio.
 *   - Del espacio (sendWorkspaceEmail): revisiones, informes, avisos. Salen por
 *     el SMTP propio del espacio si está verificado; si no, por el de NexTrain.
 *
 * Si SMTP no está configurado, las funciones devuelven { ok: false } sin
 * lanzar — igual de non-blocking que era la llamada a n8n.
 */

import { promises as dnsPromises } from 'dns'
import { isIP } from 'net'
import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import { getCoachSmtpConfig, type CoachSmtpConfig } from '@/lib/email/coach-settings'
import { isAllowedSmtpPort, mayUseCoachSmtp, resolveSmtpTarget, smtpTlsOptions } from '@/lib/email/smtp-rules'
import { getEmailBrand, type EmailBrand } from '@/lib/branding/get-branding'

export interface EmailResult {
    ok: boolean
    error?: string
    /** 'coach' si salió por el SMTP del entrenador, 'global' si por el de la app */
    via?: 'coach' | 'global'
}

function isGlobalConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function buildGlobalTransport() {
    const port = Number(process.env.SMTP_PORT ?? 465)
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST as string,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER as string, pass: process.env.SMTP_PASS as string },
    })
}

const lookupAll = (host: string) => dnsPromises.lookup(host, { all: true, verbatim: true })

/**
 * Transporte del SMTP del espacio: conecta a la IP ya comprobada, con TLS
 * obligatorio y validando el certificado con el nombre del servidor.
 */
function buildCoachTransport(config: { host: string; port: number; user: string; pass: string }, address: string) {
    return nodemailer.createTransport({
        host: address,
        port: config.port,
        ...smtpTlsOptions(config.port),
        // El certificado se valida con el nombre del servidor, no con la IP
        tls: isIP(config.host) ? { rejectUnauthorized: true } : { servername: config.host, rejectUnauthorized: true },
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    })
}

/** Texto del error para el log del servidor: sin la contraseña y sin saltos de línea. */
function describeSmtpError(err: unknown, pass?: string): string {
    const code = (err as { code?: unknown })?.code
    const responseCode = (err as { responseCode?: unknown })?.responseCode
    let message = err instanceof Error ? err.message : String(err)
    if (pass) message = message.split(pass).join('***')
    message = message.replace(/[\r\n]+/g, ' ').slice(0, 300)
    return [code, responseCode, message].filter(Boolean).join(' · ')
}

export type CoachSmtpCheck = { ok: true } | { ok: false; reason: 'host' | 'auth' | 'connection' }

/**
 * Comprueba un SMTP del espacio antes de guardarlo: servidor público, TLS y
 * credenciales. No envía nada. El detalle del fallo queda solo en el log.
 */
export async function verifyCoachSmtp(
    config: { host: string; port: number; user: string; pass: string },
    coachId: string,
): Promise<CoachSmtpCheck> {
    const target = isAllowedSmtpPort(config.port)
        ? await resolveSmtpTarget(config.host, lookupAll)
        : { ok: false as const, reason: 'port' }
    if (!target.ok) {
        console.warn(`[mailer] SMTP del coach ${coachId} rechazado (${target.reason})`)
        return { ok: false, reason: 'host' }
    }
    try {
        await buildCoachTransport({ ...config, host: target.host }, target.address).verify()
        return { ok: true }
    } catch (err) {
        console.warn(`[mailer] Verificación SMTP del coach ${coachId} fallida: ${describeSmtpError(err, config.pass)}`)
        return { ok: false, reason: (err as { code?: unknown })?.code === 'EAUTH' ? 'auth' : 'connection' }
    }
}

function coachFrom(config: CoachSmtpConfig): string {
    const email = config.fromEmail || config.user
    return config.fromName ? `"${config.fromName}" <${email}>` : email
}

function globalFrom(): string {
    return process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost'
}

async function sendViaGlobal(options: Mail.Options): Promise<EmailResult> {
    if (!isGlobalConfigured()) {
        console.warn('[mailer] SMTP no configurado (ni coach ni global) — email no enviado')
        return { ok: false, error: 'SMTP no configurado' }
    }
    try {
        await buildGlobalTransport().sendMail({ ...options, from: globalFrom() })
        console.log(`[mailer] ✅ (global) Email enviado a ${options.to} — ${options.subject}`)
        return { ok: true, via: 'global' }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[mailer] ❌ Error enviando a ${options.to}:`, message)
        return { ok: false, error: message }
    }
}

/**
 * Emails que llevan un enlace o una credencial de acceso a una cuenta
 * (invitaciones, enlaces mágicos, contraseñas): SIEMPRE por el correo de
 * NexTrain. No recibe coachId a propósito.
 */
async function sendAccessEmail(options: Mail.Options): Promise<EmailResult> {
    return sendViaGlobal(options)
}

/**
 * Emails del espacio (revisiones, informes, avisos). Si el espacio tiene SMTP
 * propio verificado, salen desde SU cuenta; si no, o si falla, por el global.
 * Si por error llevan un enlace de acceso, salen por el global.
 */
async function sendWorkspaceEmail(options: Mail.Options, coachId?: string): Promise<EmailResult> {
    if (coachId && !mayUseCoachSmtp('workspace', [options.subject, options.html, options.text])) {
        console.error('[mailer] Email del espacio con enlace de acceso: sale por el correo de NexTrain')
        return sendViaGlobal(options)
    }
    if (coachId) {
        const coachConfig = await getCoachSmtpConfig(coachId).catch(() => null)
        if (coachConfig) {
            const target = isAllowedSmtpPort(coachConfig.port)
                ? await resolveSmtpTarget(coachConfig.host, lookupAll)
                : { ok: false as const, reason: 'port' }
            if (!target.ok) {
                console.error(`[mailer] SMTP del coach ${coachId} no permitido (${target.reason}) — probando SMTP global`)
            } else {
                try {
                    await buildCoachTransport({ ...coachConfig, host: target.host }, target.address).sendMail({
                        ...options,
                        from: coachFrom(coachConfig),
                    })
                    console.log(`[mailer] ✅ (coach ${coachId}) Email enviado a ${options.to} — ${options.subject}`)
                    return { ok: true, via: 'coach' }
                } catch (err) {
                    console.error(`[mailer] ❌ SMTP del coach ${coachId} falló (${describeSmtpError(err, coachConfig.pass)}) — probando SMTP global`)
                    // seguimos al fallback global
                }
            }
        }
    }
    return sendViaGlobal(options)
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

function loadEmailBrand(coachId?: string): Promise<EmailBrand | null> {
    return coachId ? getEmailBrand(coachId) : Promise.resolve(null)
}

function layout(title: string, bodyHtml: string, ctaLabel?: string, rawCtaUrl?: string, brand?: EmailBrand | null): string {
    const ctaUrl = rawCtaUrl ? escapeHtml(rawCtaUrl) : undefined
    const color = brand?.color ?? '#0058D8'
    const brandName = brand?.name ? escapeHtml(brand.name) : ''
    const header = brand?.logoUrl
        ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${brandName}" style="display:block;max-height:48px;max-width:200px;margin:0 0 20px;" />`
        : brandName
            ? `<p style="margin:0 0 20px;font-size:14px;font-weight:600;color:#111827;">${brandName}</p>`
            : ''
    const button = ctaLabel && ctaUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
             <tr><td style="border-radius:8px;background:${color};">
               <a href="${ctaUrl}" target="_blank"
                  style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                 ${ctaLabel}
               </a>
             </td></tr>
           </table>
           <p style="font-size:12px;color:#6b7280;text-align:center;margin:8px 0 0;">
             Si el botón no funciona, copia este enlace:<br/>
             <a href="${ctaUrl}" style="color:${color};word-break:break-all;">${ctaUrl}</a>
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
          ${header}<h1 style="margin:0 0 18px;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>
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
    const brand = await loadEmailBrand(params.coachId)
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

    return sendWorkspaceEmail(
        {
            to: params.to,
            subject,
            html: layout(`${rawReviewName} pendiente`, body, 'Completar mi revisión', params.formUrl, brand),
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
    const brand = await loadEmailBrand(params.coachId)
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

    return sendWorkspaceEmail(
        {
            to: params.to,
            subject,
            html: layout(`${rawReviewName} pendiente`, body, 'Completar mi revisión', params.formUrl, brand),
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
    const brand = await loadEmailBrand(params.coachId)
    const name = escapeHtml(params.clientName?.trim() || 'atleta')
    const body = `
        <p>Hola <strong>${name}</strong>, ¡bienvenido/a! 🎉</p>
        <p>Para empezar a trabajar juntos, tu entrenador necesita conocerte mejor.
        Completa el formulario inicial con tus datos, objetivos y fotos de partida.</p>
        <p>Con esa información prepararemos tu primer plan de entrenamiento y nutrición.</p>`

    return sendWorkspaceEmail(
        {
            to: params.to,
            subject: '🚀 Bienvenido/a — completa tu formulario inicial',
            html: layout('Formulario de inicio', body, 'Completar formulario inicial', params.formUrl, brand),
        },
        params.coachId
    )
}

export async function sendSessionReportEmail(params: {
    to: string
    clientName: string
    url: string
    coachId: string
    /** Textos de la sala. Vacíos, salen los de NexTrain. */
    subject?: string | null
    text?: string | null
}): Promise<EmailResult> {
    const brand = await loadEmailBrand(params.coachId)
    const name = escapeHtml(params.clientName.trim().split(/\s+/)[0] || 'atleta')
    const text = params.text || 'Aquí tienes el informe de tu sesión de entrenamiento. Se abre en el móvil, sin cuenta ni aplicación.'
    const body = `
        <p>Hola <strong>${name}</strong>,</p>
        <p>${escapeHtml(text)}</p>`
    return sendWorkspaceEmail(
        {
            to: params.to,
            subject: params.subject || `Tu informe de sesión${brand?.name ? ` en ${brand.name}` : ''}`,
            html: layout('Tu informe de sesión', body, 'Ver el informe', params.url, brand),
        },
        params.coachId
    )
}

/** Lleva una contraseña: sale siempre por el correo de NexTrain. */
export async function sendInviteEmailSmtp(params: {
    to: string
    clientName?: string
    tempPassword?: string | null
    appUrl: string
    coachId?: string
}): Promise<EmailResult> {
    const brand = await loadEmailBrand(params.coachId)
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

    return sendAccessEmail({
        to: params.to,
        subject: '🔑 Invitación a tu plataforma de entrenamiento',
        html: layout('Te han invitado', body, 'Acceder a la plataforma', `${params.appUrl}/login`, brand),
    })
}

export interface CoachDigestEmailSection {
    title: string
    items: Array<{ label: string; detail: string; url: string }>
}

/**
 * Resumen diario del coach. Sale siempre por el SMTP de la app (no por el
 * del coach): es un aviso de NexTrain al propio coach.
 */
export async function sendCoachDigestEmail(params: {
    to: string
    /** Sale primero por el SMTP propio del coach, como sus revisiones; si no, por el global */
    coachId: string
    coachName?: string | null
    dateLabel: string
    headline: string
    sections: CoachDigestEmailSection[]
    dashboardUrl: string
    settingsUrl: string
    /** Resumen semanal: asunto, saludo y título propios. */
    weekly?: boolean
}): Promise<EmailResult> {
    const name = escapeHtml(params.coachName?.trim().split(/\s+/)[0] || 'coach')
    const sectionsHtml = params.sections.map(section => `
        <h2 style="margin:24px 0 8px;font-size:15px;color:#111827;">${escapeHtml(section.title)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${section.items.map(item => `
            <tr>
              <td style="padding:8px 0;border-top:1px solid #e5e7eb;font-size:14px;">
                <a href="${escapeHtml(item.url)}" style="color:#0058D8;font-weight:600;text-decoration:none;">${escapeHtml(item.label)}</a>
                ${item.detail ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${escapeHtml(item.detail)}</div>` : ''}
              </td>
            </tr>`).join('')}
        </table>`).join('')

    const body = `
        <p>Buenos días, <strong>${name}</strong>. ${params.weekly ? 'Así fue la semana pasada y esto es lo que viene:' : 'Esto es lo que tienes pendiente hoy:'}</p>
        <p style="font-size:14px;color:#6b7280;">${escapeHtml(params.headline)}</p>
        ${sectionsHtml}
        <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
          Puedes cambiar la hora o desactivar ${params.weekly ? 'los resúmenes' : 'este resumen'} en
          <a href="${escapeHtml(params.settingsUrl)}" style="color:#6b7280;">Ajustes → Notificaciones</a>.
        </p>`

    return sendWorkspaceEmail({
        to: params.to,
        subject: params.weekly ? `Tu semana en NexTrain · ${params.dateLabel}` : `Tu día en NexTrain · ${params.dateLabel}`,
        html: layout(params.weekly ? `Resumen semanal, ${params.dateLabel}` : `Resumen de hoy, ${params.dateLabel}`, body, 'Abrir el panel', params.dashboardUrl),
    }, params.coachId)
}

/** Email de prueba para validar la configuración SMTP del coach */
export async function sendTestEmail(params: { to: string; coachId: string }): Promise<EmailResult> {
    const body = `
        <p>¡Buenas noticias! 🎉</p>
        <p>Tu cuenta de email está correctamente configurada. A partir de ahora,
        las revisiones, los formularios de onboarding y los informes que envíes a tus
        atletas saldrán desde esta dirección.</p>
        <p>Las invitaciones y los enlaces de acceso seguirán saliendo desde la dirección de NexTrain.</p>`

    return sendWorkspaceEmail(
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
    /** Solo para la marca del email: sale siempre por el correo de NexTrain */
    coachId?: string
    brand?: EmailBrand | null
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
        <p style="margin-top:20px;padding:12px 14px;border-radius:8px;background:#EAF1FD;color:#003A8F;font-size:14px;">
          📱 <strong>Ábrelo en el móvil donde vas a usar la app.</strong>
          Así la sesión quedará iniciada donde vas a entrenar.
        </p>
        <p style="font-size:13px;color:#6b7280;">${params.tempPassword
            ? `Si no puedes entrar, pide a ${coach} que te reenvíe la invitación.`
            : `El enlace vale 7 días. Si ha caducado, pide a ${coach} que te reenvíe la invitación.`}</p>`

    return {
        subject: `${params.coachName.trim()} te ha invitado a entrenar en NexTrain`,
        html: layout('Tu acceso a NexTrain', body, params.tempPassword ? 'Entrar en NexTrain' : 'Crear mi acceso', params.accessUrl, params.brand),
    }
}

/** Lleva un enlace de acceso o una contraseña: sale siempre por el correo de NexTrain. */
export async function sendAthleteInviteEmail(params: AthleteInviteEmailParams): Promise<EmailResult> {
    const brand = await loadEmailBrand(params.coachId)
    const { subject, html } = buildAthleteInviteEmail({ ...params, brand })
    return sendAccessEmail({ to: params.to, subject, html })
}

/** Email de invitación al equipo de un espacio. */
export interface TeamInviteEmailParams {
    to: string
    inviterName: string
    spaceName: string
    roleLabel: string
    accessUrl: string
    /** Solo para la marca del email: sale siempre por el correo de NexTrain */
    coachId?: string
    brand?: EmailBrand | null
}

export function buildTeamInviteEmail(params: TeamInviteEmailParams): { subject: string; html: string } {
    const inviter = escapeInviteText(params.inviterName.trim())
    const space = escapeInviteText(params.spaceName.trim())
    const role = escapeInviteText(params.roleLabel)

    const body = `
        <p>Hola:</p>
        <p>${inviter} te ha invitado a unirte a <strong>${space}</strong> en NexTrain como <strong>${role}</strong>.</p>
        <p>Abre el enlace para aceptar. Caduca en 7 días.</p>
        <p style="font-size:13px;color:#6b7280;">Si no esperabas esta invitación, puedes ignorar este email.</p>`

    return {
        subject: `${params.inviterName.trim()} te ha invitado a ${params.spaceName.trim()} en NexTrain`,
        html: layout('Invitación al equipo', body, 'Aceptar la invitación', params.accessUrl, params.brand),
    }
}

/** Lleva un enlace de acceso: sale siempre por el correo de NexTrain. */
export async function sendTeamInviteEmail(params: TeamInviteEmailParams): Promise<EmailResult> {
    const brand = await loadEmailBrand(params.coachId)
    const { subject, html } = buildTeamInviteEmail({ ...params, brand })
    return sendAccessEmail({ to: params.to, subject, html })
}
