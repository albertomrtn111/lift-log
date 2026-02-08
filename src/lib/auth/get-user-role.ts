import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/coach'

/**
 * Server-side helper to determine user's role
 * Used for smart redirect after login
 */
export async function getUserRole(userId: string): Promise<UserRole> {
    const supabase = await createClient()

    // Check for coach membership (owner or coach role)
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
 * Get the coach ID for a user (if they are a coach)
 */
export async function getCoachIdForUser(userId: string): Promise<string | null> {
    const supabase = await createClient()

    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('coach_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)
        .single()

    return membership?.coach_id || null
}

/**
 * Check if user has coach access (for server components)
 */
export async function hasCoachAccess(userId: string): Promise<boolean> {
    const supabase = await createClient()

    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)
        .single()

    return !!membership
}
