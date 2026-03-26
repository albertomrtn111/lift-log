import webpush from 'web-push'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// Configurar VAPID una sola vez
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
)

// Cliente admin para leer push_subscriptions sin RLS
const adminSupabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
        const { data: subscriptions, error } = await adminSupabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth, id')
            .eq('client_id', clientId)

        if (error || !subscriptions || subscriptions.length === 0) return

        const notifications = subscriptions.map(async (sub) => {
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
            } catch (err: any) {
                // Si el endpoint ya no es válido (410 Gone), eliminar la suscripción
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await adminSupabase
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id)
                }
                // No relanzar — notificaciones son best-effort
            }
        })

        await Promise.allSettled(notifications)
    } catch {
        // Silencioso: las notificaciones no deben bloquear operaciones principales
    }
}
