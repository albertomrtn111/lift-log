import 'server-only'

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type PushSubscriptionRow = {
    id: string
    endpoint: string
    p256dh: string
    auth: string
}

type PushConfig = {
    supabaseUrl: string
    supabaseServiceRoleKey: string
    vapidSubject: string
    vapidPublicKey: string
    vapidPrivateKey: string
}

export interface PushPayload {
    title: string
    body: string
    url?: string
    tag?: string
    icon?: string
}

export interface PushSendResult {
    ok: boolean
    reason?:
        | 'disabled'
        | 'misconfigured'
        | 'dependency_missing'
        | 'db_error'
        | 'unexpected'
    subscriptionCount?: number
    deliveredCount?: number
    prunedCount?: number
}

function getPushConfig(): PushConfig | null {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const vapidSubject = process.env.VAPID_SUBJECT
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        return null
    }

    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
        return null
    }

    return {
        supabaseUrl,
        supabaseServiceRoleKey,
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey,
    }
}

function getAdminSupabase(config: PushConfig) {
    return createSupabaseAdmin(config.supabaseUrl, config.supabaseServiceRoleKey)
}

let cachedWebPush: typeof import('web-push') | null | undefined
let configuredVapidFingerprint: string | null = null

async function loadWebPush(): Promise<typeof import('web-push') | null> {
    if (cachedWebPush !== undefined) {
        return cachedWebPush
    }

    try {
        cachedWebPush = require('web-push') as typeof import('web-push')
        return cachedWebPush
    } catch (error) {
        console.warn('[push] web-push no está disponible. La capa push quedará deshabilitada.', error)
        cachedWebPush = null
        return null
    }
}

async function ensureWebPushConfigured(config: PushConfig): Promise<typeof import('web-push') | null> {
    const webpush = await loadWebPush()
    if (!webpush) return null

    const fingerprint = `${config.vapidSubject}|${config.vapidPublicKey}|${config.vapidPrivateKey}`
    if (configuredVapidFingerprint !== fingerprint) {
        webpush.setVapidDetails(
            config.vapidSubject,
            config.vapidPublicKey,
            config.vapidPrivateKey
        )
        configuredVapidFingerprint = fingerprint
    }

    return webpush
}

export function isPushServerConfigured(): boolean {
    return getPushConfig() !== null
}

/**
 * Transporte push server-only y opcional.
 * Nunca lanza errores al caller; devuelve un resultado estructurado y registra logs.
 */
export async function sendPushToClient(
    clientId: string,
    payload: PushPayload
): Promise<PushSendResult> {
    const config = getPushConfig()
    if (!config) {
        console.info('[push] Configuración ausente o incompleta; se omite el envío.')
        return { ok: false, reason: 'misconfigured' }
    }

    const webpush = await ensureWebPushConfigured(config)
    if (!webpush) {
        return { ok: false, reason: 'dependency_missing' }
    }

    try {
        const adminSupabase = getAdminSupabase(config)
        const { data: subscriptions, error } = await adminSupabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth, id')
            .eq('client_id', clientId)

        if (error) {
            console.error('[push] Error al leer suscripciones:', error)
            return { ok: false, reason: 'db_error' }
        }

        if (!subscriptions || subscriptions.length === 0) {
            return {
                ok: true,
                reason: 'disabled',
                subscriptionCount: 0,
                deliveredCount: 0,
                prunedCount: 0,
            }
        }

        let deliveredCount = 0
        let prunedCount = 0

        const notifications = (subscriptions as PushSubscriptionRow[]).map(async (subscription) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth,
                        },
                    },
                    JSON.stringify(payload)
                )
                deliveredCount += 1
            } catch (error: any) {
                console.error(
                    `[push] Error enviando notificación a ${subscription.id} (status ${error?.statusCode ?? 'n/a'}):`,
                    error?.message || error
                )

                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    const { error: deleteError } = await adminSupabase
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', subscription.id)

                    if (!deleteError) {
                        prunedCount += 1
                    }
                }
            }
        })

        await Promise.allSettled(notifications)

        return {
            ok: true,
            subscriptionCount: subscriptions.length,
            deliveredCount,
            prunedCount,
        }
    } catch (error) {
        console.error('[push] Error inesperado en sendPushToClient:', error)
        return { ok: false, reason: 'unexpected' }
    }
}
