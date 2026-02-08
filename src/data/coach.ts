import { createClient } from '@/lib/supabase/server'
import type { Coach, CoachMembership, CoachStats, UserRole } from '@/types/coach'

/**
 * Check if user has coach access (owner or coach role)
 */
export async function getCoachMembership(userId: string): Promise<CoachMembership | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('coach_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .single()

    if (error || !data) return null
    return data as CoachMembership
}

/**
 * Get coach info by ID
 */
export async function getCoachInfo(coachId: string): Promise<Coach | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('coaches')
        .select('*')
        .eq('id', coachId)
        .single()

    if (error || !data) return null
    return data as Coach
}

/**
 * Get coach stats for dashboard
 */
export async function getCoachStats(coachId: string): Promise<CoachStats> {
    const supabase = await createClient()

    // Get active clients count
    const { count: activeClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('status', 'active')

    // Get pending reviews (reviews with status='draft')
    const { count: pendingReviews } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('status', 'draft')

    // Get upcoming check-ins in next 7 days
    const today = new Date().toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: upcomingData } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .gte('next_checkin_date', today)
        .lte('next_checkin_date', nextWeek)
        .order('next_checkin_date', { ascending: true })
        .limit(1)

    return {
        activeClients: activeClients || 0,
        pendingReviews: pendingReviews || 0,
        upcomingCheckins: upcomingData?.length || 0,
        nextCheckinClient: upcomingData?.[0]?.full_name,
        nextCheckinDate: upcomingData?.[0]?.next_checkin_date,
    }
}

/**
 * Determine user's role (for login redirect)
 */
export async function getUserRole(userId: string): Promise<UserRole> {
    const supabase = await createClient()

    // Check for coach membership
    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)

    const isCoach = (membership?.length ?? 0) > 0

    // Check for client record
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)

    const isClient = (client?.length ?? 0) > 0

    if (isCoach && isClient) return 'both'
    if (isCoach) return 'coach'
    if (isClient) return 'client'
    return 'none'
}

/**
 * Get coach ID for current user
 */
export async function getCoachIdForUser(userId: string): Promise<string | null> {
    const membership = await getCoachMembership(userId)
    return membership?.coach_id || null
}
