import { createClient } from '@/lib/supabase/client'

export type CoachNotificationCategory = 'reviews' | 'messages' | 'tasks' | 'system'

export interface CoachNotification {
    id: string
    coach_id: string
    client_id: string | null
    category: CoachNotificationCategory
    kind: string
    title: string
    body: string | null
    url: string | null
    is_read: boolean
    read_at: string | null
    created_at: string
    updated_at: string
}

const COLUMNS = 'id, coach_id, client_id, category, kind, title, body, url, is_read, read_at, created_at, updated_at'

export async function getCoachNotifications(coachId: string, limit = 60): Promise<CoachNotification[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('coach_notifications')
        .select(COLUMNS)
        .eq('coach_id', coachId)
        .order('updated_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('getCoachNotifications error:', error)
        return []
    }
    return (data ?? []) as CoachNotification[]
}

export async function getCoachUnreadCount(coachId: string): Promise<number> {
    const supabase = createClient()
    const { count, error } = await supabase
        .from('coach_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_read', false)

    if (error) {
        console.error('getCoachUnreadCount error:', error)
        return 0
    }
    return count ?? 0
}

export async function markCoachNotificationsAsRead(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true
    const supabase = createClient()
    const { error } = await supabase
        .from('coach_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', ids)
        .eq('is_read', false)
    if (error) {
        console.error('markCoachNotificationsAsRead error:', error)
        return false
    }
    return true
}

export async function markAllCoachNotificationsAsRead(coachId: string): Promise<boolean> {
    const supabase = createClient()
    const { error } = await supabase
        .from('coach_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('coach_id', coachId)
        .eq('is_read', false)
    if (error) {
        console.error('markAllCoachNotificationsAsRead error:', error)
        return false
    }
    return true
}
