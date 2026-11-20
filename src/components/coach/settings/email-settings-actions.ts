'use server'

import { revalidatePath } from 'next/cache'
import { getCoachActor } from '@/lib/auth/get-coach-actor'
import {
    getCoachEmailSettingsPublic,
    getCoachSmtpForEdit,
    saveCoachEmailSettings,
    deleteCoachEmailSettings,
    getCoachSmtpConfig,
    markCoachEmailVerified,
    type CoachEmailSettingsPublic,
} from '@/lib/email/coach-settings'
import { sendTestEmail, verifyCoachSmtp } from '@/lib/email/mailer'
import { isAllowedSmtpPort, parseSmtpHost, smtpPasswordRequired } from '@/lib/email/smtp-rules'
import { canManageTeam } from '@/lib/team/team-rules'

interface ActionResult {
    success: boolean
    error?: string
}

export type EmailSettingsView = CoachEmailSettingsPublic & { can_manage: boolean }

const NOT_ALLOWED = 'Solo el propietario y los administradores del espacio pueden cambiar el email de envío.'
const HOST_NOT_ALLOWED = 'Ese servidor de correo no se puede usar. Escribe el servidor SMTP de tu proveedor (por ejemplo, smtp.gmail.com).'
const CONNECTION_FAILED = 'No se ha podido conectar de forma segura con tu servidor de correo. Revisa el servidor y el puerto. No se ha guardado ningún cambio.'
const AUTH_FAILED = 'Tu servidor de correo no ha aceptado el usuario o la contraseña (en Gmail tiene que ser una contraseña de aplicación). No se ha guardado ningún cambio.'

class EmailSettingsError extends Error {}

/** Configurar o probar el correo del espacio: solo propietario y administradores del espacio activo. */
async function requireEmailManager() {
    const actor = await getCoachActor()
    if (!canManageTeam(actor.role)) throw new EmailSettingsError(NOT_ALLOWED)
    return actor
}

function failure(cause: unknown, fallback: string): ActionResult {
    if (cause instanceof EmailSettingsError) return { success: false, error: cause.message }
    console.error('[email-settings]', cause instanceof Error ? cause.message : cause)
    return { success: false, error: fallback }
}

/** Quita lo que podría romper la cabecera del remitente. */
function cleanFromName(value: unknown): string | null {
    const name = String(value ?? '').replace(/["<>\r\n]/g, '').trim().slice(0, 100)
    return name || null
}

export async function getEmailSettingsAction(): Promise<EmailSettingsView | null> {
    try {
        const { coachId, role } = await getCoachActor()
        const settings = await getCoachEmailSettingsPublic(coachId)
        if (canManageTeam(role)) return { ...settings, can_manage: true }
        // El resto del equipo solo ve si el espacio tiene correo propio
        return {
            configured: settings.configured,
            smtp_host: null,
            smtp_port: null,
            smtp_user: null,
            from_name: null,
            from_email: null,
            has_password: false,
            last_verified_at: settings.last_verified_at,
            verified: settings.verified,
            can_manage: false,
        }
    } catch {
        return null
    }
}

/**
 * Guarda el correo propio del espacio solo si la conexión se verifica. Si
 * cambian el servidor, el puerto o el usuario, hay que escribir otra vez la
 * contraseña.
 */
export async function saveEmailSettingsAction(input: {
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_pass?: string
    from_name?: string
    from_email?: string
}): Promise<ActionResult> {
    try {
        const { coachId } = await requireEmailManager()

        const parsedHost = parseSmtpHost(input?.smtp_host)
        if (!parsedHost.ok) {
            return { success: false, error: parsedHost.reason === 'empty' ? 'Escribe el servidor SMTP.' : HOST_NOT_ALLOWED }
        }
        const host = parsedHost.host
        const port = Number(input?.smtp_port)
        if (!isAllowedSmtpPort(port)) {
            return { success: false, error: 'Usa un puerto de envío de correo: 465 (SSL), 587 (STARTTLS), 2525 o 25.' }
        }
        const user = String(input?.smtp_user ?? '').trim()
        if (!user || user.length > 254) {
            return { success: false, error: 'Escribe el usuario (normalmente, tu email).' }
        }
        const fromEmail = String(input?.from_email ?? '').trim() || null
        if (fromEmail && (fromEmail.length > 254 || !/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(fromEmail))) {
            return { success: false, error: 'El email remitente no es válido' }
        }

        let pass = String(input?.smtp_pass ?? '').trim()
        if (!pass) {
            const stored = await getCoachSmtpForEdit(coachId)
            if (!stored) return { success: false, error: 'Escribe la contraseña.' }
            if (smtpPasswordRequired(stored, { host, port, user })) {
                return { success: false, error: 'Has cambiado el servidor, el puerto o el usuario: escribe de nuevo la contraseña.' }
            }
            if (!stored.pass) return { success: false, error: 'Escribe de nuevo la contraseña.' }
            pass = stored.pass
        }

        const check = await verifyCoachSmtp({ host, port, user, pass }, coachId)
        if (!check.ok) {
            const error = check.reason === 'host' ? HOST_NOT_ALLOWED : check.reason === 'auth' ? AUTH_FAILED : CONNECTION_FAILED
            return { success: false, error }
        }

        const result = await saveCoachEmailSettings(coachId, {
            smtp_host: host,
            smtp_port: port,
            smtp_user: user,
            smtp_pass: pass,
            from_name: cleanFromName(input?.from_name),
            from_email: fromEmail,
            verified_at: new Date().toISOString(),
        })
        if (!result.ok) return { success: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' }

        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        return failure(error, 'No se ha podido guardar. Inténtalo de nuevo.')
    }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireEmailManager()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return { success: false, error: 'Tu usuario no tiene email' }

        const config = await getCoachSmtpConfig(coachId)
        if (!config) {
            return { success: false, error: 'Guarda y verifica primero tu cuenta de correo.' }
        }

        const result = await sendTestEmail({ to: user.email, coachId })
        if (!result.ok) return { success: false, error: 'No se ha podido enviar el email de prueba.' }
        if (result.via !== 'coach') {
            return {
                success: false,
                error: 'El email salió por la cuenta general de la app porque tu servidor de correo falló. Revisa los datos.',
            }
        }

        await markCoachEmailVerified(coachId)
        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        return failure(error, 'No se ha podido enviar el email de prueba.')
    }
}

export async function deleteEmailSettingsAction(): Promise<ActionResult> {
    try {
        const { coachId } = await requireEmailManager()
        const result = await deleteCoachEmailSettings(coachId)
        if (!result.ok) return { success: false, error: 'No se ha podido eliminar. Inténtalo de nuevo.' }
        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        return failure(error, 'No se ha podido eliminar. Inténtalo de nuevo.')
    }
}
