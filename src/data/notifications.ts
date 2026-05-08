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

async function getCurrentClientId(): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()
    return client?.id ?? null
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
