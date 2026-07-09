import { createClient } from '@/lib/supabase/client'

export type NotificationType = 'general' | 'message' | 'plan_updated' | 'check_in' | 'macro_updated' | 'supplement'

export interface ClientNotification {
    id: string
    client_id: string
    title: string
    body: string | null
    url: string | null
    type: NotificationType
    is_read: boolean
    read_at: string | null
    created_at: string
}

// Cache del clientId por usuario: getNotifications, getUnreadCount y la
// suscripción realtime lo comparten en vez de repetir auth + query cada vez.
const clientIdCache = new Map<string, Promise<string | null>>()

export async function getCurrentClientId(): Promise<string | null> {
    const supabase = createClient()
    // getSession lee del storage local (sin roundtrip); RLS valida el token igualmente
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return null

    let cached = clientIdCache.get(userId)
    if (!cached) {
        cached = (async () => {
            const { data } = await supabase
                .from('clients')
                .select('id')
                .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
                .eq('status', 'active')
                .maybeSingle()
            return data?.id ?? null
        })()
        clientIdCache.set(userId, cached)
        // No cachear fallos: permite reintentar en el siguiente refresh
        void cached.then((id) => { if (!id) clientIdCache.delete(userId) })
    }
    return cached
}

export async function getNotifications(limit = 50): Promise<ClientNotification[]> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return []

    const { data, error } = await supabase
        .from('client_notifications')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('getNotifications error:', error)
        return []
    }
    return (data ?? []) as ClientNotification[]
}

export async function getUnreadCount(): Promise<number> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return 0

    const { count, error } = await supabase
        .from('client_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_read', false)

    if (error) {
        console.error('getUnreadCount error:', error)
        return 0
    }
    return count ?? 0
}

export async function markAsRead(id: string): Promise<boolean> {
    const supabase = createClient()
    const { error } = await supabase
        .from('client_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
    if (error) {
        console.error('markAsRead error:', error)
        return false
    }
    return true
}

export async function markAllAsRead(): Promise<boolean> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return false

    const { error } = await supabase
        .from('client_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('is_read', false)

    if (error) {
        console.error('markAllAsRead error:', error)
        return false
    }
    return true
}
