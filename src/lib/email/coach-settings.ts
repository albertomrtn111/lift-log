/**
 * Configuración SMTP por entrenador — server-side only.
 *
 * La contraseña se cifra con AES-256-GCM usando EMAIL_SETTINGS_ENCRYPTION_KEY
 * (64 caracteres hex = 32 bytes). La tabla coach_email_settings tiene RLS sin
 * policies: solo se accede desde el servidor con el service role.
 */

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isVerifiedSmtpSettings } from '@/lib/email/smtp-rules'

// ---------------------------------------------------------------------------
// Cifrado
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
    const hex = process.env.EMAIL_SETTINGS_ENCRYPTION_KEY
    if (!hex || hex.length !== 64) {
        throw new Error(
            'EMAIL_SETTINGS_ENCRYPTION_KEY no configurada (debe ser 64 caracteres hex). ' +
            'Genera una con: openssl rand -hex 32'
        )
    }
    return Buffer.from(hex, 'hex')
}

export function encryptSecret(plain: string): string {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    // formato: iv.tag.payload (base64)
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptSecret(payload: string): string {
    const key = getEncryptionKey()
    const [ivB64, tagB64, dataB64] = payload.split('.')
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado inválido')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]).toString('utf8')
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Config completa (con password en claro) — SOLO para uso interno del mailer */
export interface CoachSmtpConfig {
    host: string
    port: number
    user: string
    pass: string
    fromName: string | null
    fromEmail: string | null
}

/** Versión segura para la UI: nunca incluye la contraseña */
export interface CoachEmailSettingsPublic {
    configured: boolean
    smtp_host: string | null
    smtp_port: number | null
    smtp_user: string | null
    from_name: string | null
    from_email: string | null
    has_password: boolean
    last_verified_at: string | null
    /** Verificado después del último cambio: solo entonces se usa para enviar */
    verified: boolean
}

/** Se guarda solo lo que ya se ha verificado contra el servidor. */
export interface SaveCoachEmailSettingsInput {
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_pass: string
    from_name?: string | null
    from_email?: string | null
    /** Momento de la verificación; se guarda también como último cambio */
    verified_at: string
}

/** Lo guardado, para decidir si hace falta volver a pedir la contraseña. */
export interface CoachSmtpForEdit {
    host: string
    port: number
    user: string
    /** null si no se puede descifrar */
    pass: string | null
}

// ---------------------------------------------------------------------------
// Acceso a datos (service role)
// ---------------------------------------------------------------------------

/**
 * Config descifrada para enviar emails. null si el coach no tiene SMTP propio
 * o si no se ha verificado después del último cambio.
 */
export async function getCoachSmtpConfig(coachId: string): Promise<CoachSmtpConfig | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coach_email_settings')
        .select('smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, from_name, from_email, last_verified_at, updated_at')
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) return null
    if (!isVerifiedSmtpSettings(data)) return null

    try {
        return {
            host: data.smtp_host,
            port: data.smtp_port,
            user: data.smtp_user,
            pass: decryptSecret(data.smtp_pass_encrypted),
            fromName: data.from_name,
            fromEmail: data.from_email,
        }
    } catch (err) {
        console.error('[coach-settings] Error descifrando SMTP del coach', coachId, err)
        return null
    }
}

/** Versión para UI, sin contraseña */
export async function getCoachEmailSettingsPublic(coachId: string): Promise<CoachEmailSettingsPublic> {
    const admin = createAdminClient()
    const { data } = await admin
        .from('coach_email_settings')
        .select('smtp_host, smtp_port, smtp_user, from_name, from_email, last_verified_at, updated_at, smtp_pass_encrypted')
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!data) {
        return {
            configured: false,
            smtp_host: null,
            smtp_port: null,
            smtp_user: null,
            from_name: null,
            from_email: null,
            has_password: false,
            last_verified_at: null,
            verified: false,
        }
    }

    return {
        configured: true,
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_user: data.smtp_user,
        from_name: data.from_name,
        from_email: data.from_email,
        has_password: Boolean(data.smtp_pass_encrypted),
        last_verified_at: data.last_verified_at,
        verified: isVerifiedSmtpSettings(data),
    }
}

/** Lo guardado (con la contraseña descifrada) para reutilizarla con el mismo servidor. */
export async function getCoachSmtpForEdit(coachId: string): Promise<CoachSmtpForEdit | null> {
    const admin = createAdminClient()
    const { data } = await admin
        .from('coach_email_settings')
        .select('smtp_host, smtp_port, smtp_user, smtp_pass_encrypted')
        .eq('coach_id', coachId)
        .maybeSingle()
    if (!data) return null

    let pass: string | null = null
    try {
        pass = data.smtp_pass_encrypted ? decryptSecret(data.smtp_pass_encrypted) : null
    } catch {
        console.error('[coach-settings] No se pudo descifrar la contraseña SMTP guardada del coach', coachId)
    }
    return { host: data.smtp_host, port: data.smtp_port, user: data.smtp_user, pass }
}

export async function saveCoachEmailSettings(
    coachId: string,
    input: SaveCoachEmailSettingsInput
): Promise<{ ok: boolean; error?: string }> {
    const admin = createAdminClient()
    const pass = input.smtp_pass.trim()
    if (!pass) return { ok: false, error: 'Falta la contraseña' }

    const { error } = await admin.from('coach_email_settings').upsert(
        {
            coach_id: coachId,
            smtp_host: input.smtp_host.trim(),
            smtp_port: input.smtp_port,
            smtp_user: input.smtp_user.trim(),
            smtp_pass_encrypted: encryptSecret(pass),
            from_name: input.from_name?.trim() || null,
            from_email: input.from_email?.trim() || null,
            updated_at: input.verified_at,
            last_verified_at: input.verified_at,
        },
        { onConflict: 'coach_id' }
    )

    if (error) {
        console.error('[coach-settings] No se pudo guardar el SMTP del coach', coachId, error.message)
        return { ok: false, error: 'No se pudo guardar' }
    }
    return { ok: true }
}

export async function markCoachEmailVerified(coachId: string): Promise<void> {
    const admin = createAdminClient()
    await admin
        .from('coach_email_settings')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('coach_id', coachId)
}

export async function deleteCoachEmailSettings(coachId: string): Promise<{ ok: boolean; error?: string }> {
    const admin = createAdminClient()
    const { error } = await admin.from('coach_email_settings').delete().eq('coach_id', coachId)
    if (error) {
        console.error('[coach-settings] No se pudo borrar el SMTP del coach', coachId, error.message)
        return { ok: false, error: 'No se pudo eliminar' }
    }
    return { ok: true }
}
