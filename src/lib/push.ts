import webpush from 'web-push'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// Lazy initialization — env vars may not be available at build time
let vapidConfigured = false
function ensureVapidConfigured() {
    if (vapidConfigured) return true
    if (!process.env.VAPID_SUBJECT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        return false
    }
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    )
    vapidConfigured = true
    return true
}

function getAdminSupabase() {
    return createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export interface PushPayload {
    title: string
    body: string
    url?: string
    tag?: string
    icon?: string
}

/**
 * Envía notificación push a todos los dispositivos de un cliente.
 * No lanza errores — falla silenciosamente para no bloquear el flujo principal.
 */
export async function sendPushToClient(
    clientId: string,
    payload: PushPayload
): Promise<void> {
    try {
        // Verificar que VAPID está configurado
        if (!ensureVapidConfigured()) {
            console.error('[push] VAPID env vars no configuradas — notificaciones deshabilitadas')
            return
        }

        const adminSupabase = getAdminSupabase()
        const { data: subscriptions, error } = await adminSupabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth, id')
            .eq('client_id', clientId)

        if (error) {
            console.error('[push] Error al leer suscripciones:', error)
            return
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.warn(`[push] ⚠️ Cliente ${clientId} no tiene suscripciones en DB. ¿Se registró correctamente?`)
            return
        }

        console.log(`[push] Enviando notificación a ${subscriptions.length} dispositivo(s) del cliente ${clientId}`)

        const notifications = subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string; id: string }) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            }

            try {
                await webpush.sendNotification(
                    pushSubscription,
                    JSON.stringify(payload)
                )
                console.log(`[push] Notificación enviada correctamente a endpoint: ${sub.endpoint.substring(0, 50)}...`)
            } catch (err: any) {
                console.error(`[push] Error enviando notificación (status ${err.statusCode}):`, err.message)
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`[push] Endpoint caducado, eliminando suscripción ${sub.id}`)
                    await getAdminSupabase()
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id)
                }
            }
        })

        await Promise.allSettled(notifications)
    } catch (err) {
        console.error('[push] Error inesperado en sendPushToClient:', err)
    }
}
