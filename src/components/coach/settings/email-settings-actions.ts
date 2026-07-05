'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import {
    getCoachEmailSettingsPublic,
    saveCoachEmailSettings,
    deleteCoachEmailSettings,
    getCoachSmtpConfig,
    markCoachEmailVerified,
    type CoachEmailSettingsPublic,
} from '@/lib/email/coach-settings'
import { buildTransport, sendTestEmail } from '@/lib/email/mailer'

interface ActionResult {
    success: boolean
    error?: string
}

export async function getEmailSettingsAction(): Promise<CoachEmailSettingsPublic | null> {
    try {
        const { coachId } = await requireActiveCoachId()
        return await getCoachEmailSettingsPublic(coachId)
    } catch {
        return null
    }
}

export async function saveEmailSettingsAction(input: {
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_pass?: string
    from_name?: string
    from_email?: string
}): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()

        // Validaciones básicas
        const host = input.smtp_host?.trim()
        const user = input.smtp_user?.trim()
        const port = Number(input.smtp_port)
        if (!host || !user) {
            return { success: false, error: 'Servidor SMTP y usuario son obligatorios' }
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return { success: false, error: 'Puerto inválido' }
        }
        if (input.from_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.from_email.trim())) {
            return { success: false, error: 'El email remitente no es válido' }
        }

        const result = await saveCoachEmailSettings(coachId, {
            smtp_host: host,
            smtp_port: port,
            smtp_user: user,
            smtp_pass: input.smtp_pass,
            from_name: input.from_name,
            from_email: input.from_email,
        })

        if (!result.ok) return { success: false, error: result.error }

        // Verificar credenciales contra el servidor (no envía nada)
        const config = await getCoachSmtpConfig(coachId)
        if (config) {
            try {
                await buildTransport(config).verify()
                await markCoachEmailVerified(coachId)
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    success: false,
                    error: `Guardado, pero la conexión SMTP falló: ${message}. Revisa host, puerto y contraseña (en Gmail debe ser una contraseña de aplicación).`,
                }
            }
        }

        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al guardar'
        return { success: false, error: message }
    }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return { success: false, error: 'Tu usuario no tiene email' }

        const config = await getCoachSmtpConfig(coachId)
        if (!config) {
            return { success: false, error: 'Configura y guarda primero tu cuenta SMTP' }
        }

        const result = await sendTestEmail({ to: user.email, coachId })
        if (!result.ok) return { success: false, error: result.error }
        if (result.via !== 'coach') {
            return {
                success: false,
                error: 'El email salió por el SMTP global (tu configuración falló). Revisa los datos.',
            }
        }

        await markCoachEmailVerified(coachId)
        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al enviar la prueba'
        return { success: false, error: message }
    }
}

export async function deleteEmailSettingsAction(): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        const result = await deleteCoachEmailSettings(coachId)
        if (!result.ok) return { success: false, error: result.error }
        revalidatePath('/coach/settings')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al eliminar'
        return { success: false, error: message }
    }
}
