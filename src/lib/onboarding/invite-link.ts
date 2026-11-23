import 'server-only'

import { createHmac } from 'node:crypto'
import { getAppUrl } from '@/lib/app-url'
import { createInviteToken, INVITE_LINK_MS, inviteUrl, type InviteKind } from '@/lib/auth/invite-tokens.js'

/**
 * Clave con la que se firman los enlaces de invitación. Si no hay una propia
 * (INVITE_LINK_SECRET), se deriva de la clave de servicio de Supabase, que
 * solo existe en el servidor.
 */
export function inviteLinkSecret(): string {
    const own = process.env.INVITE_LINK_SECRET?.trim()
    if (own) return own
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!serviceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para firmar la invitación')
    return createHmac('sha256', serviceKey).update('nextrain:invite-links').digest('base64url')
}

/** Enlace del email: página propia de NexTrain, válida 7 días (NXT-145) */
export function buildInvitePageUrl(kind: InviteKind, id: string, now = Date.now()): string {
    const token = createInviteToken({ kind, id, expiresAt: now + INVITE_LINK_MS }, inviteLinkSecret())
    return inviteUrl(getAppUrl(), token)
}
