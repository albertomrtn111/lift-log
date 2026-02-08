import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/coach'
import type { UserModeResolution } from '@/lib/mode-utils'

export interface UserProfile {
    full_name: string | null
    email: string | null
    avatar_url: string | null
}

export interface UserContext {
    userId: string
    isCoach: boolean
    isClient: boolean
    role: UserRole
    coachId: string | null      // If user is a coach (their coach business ID)
    clientId: string | null     // If user is a client (their client record ID)
    clientCoachId: string | null // The coach that manages this client
    profile: UserProfile | null // Identity (Profiles > Auth > Clients)
    clientRecord: {
        id: string
        full_name: string | null
        coach_id: string
        status: string
    } | null
}

/**
 * Server-side function to get complete user context
 * Returns all role and relationship information for routing decisions
 */
export async function getUserContext(userId: string): Promise<UserContext> {
    const supabase = await createClient()

    // Fetch auth user, profile, and roles via RPC (Security Definer)
    const [authResult, profileResult, rolesResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
            .from('profiles')
            .select('full_name, email, avatar_url')
            .eq('id', userId)
            .limit(1)
            .maybeSingle(),
        supabase.rpc('get_my_roles')
    ])

    // Log errors in development
    if (process.env.NODE_ENV === 'development') {
        if (profileResult.error) console.error('[getUserContext] Profile fetch error:', profileResult.error)
        if (rolesResult.error) console.error('[getUserContext] Roles RPC error:', rolesResult.error)
    }

    const authUser = authResult.data.user
    const profileData = profileResult.data

    // Robust parsing (Handle Array or Single Object)
    const rolesData = rolesResult.data
    const roles = Array.isArray(rolesData) ? rolesData[0] : rolesData

    // Identity Resolution
    const emailFallback = authUser?.email || null
    const derivedNameFromEmail = emailFallback ? emailFallback.split('@')[0] : 'Usuario'

    const profile: UserProfile = {
        full_name: profileData?.full_name || roles?.full_name || derivedNameFromEmail,
        email: profileData?.email || emailFallback || 'Sin email',
        avatar_url: profileData?.avatar_url || null,
    }

    const isCoach = !!roles?.is_coach
    const coachId = roles?.coach_id || null

    const isClient = !!roles?.is_client
    const clientId = roles?.client_id || null
    const clientCoachId = null // Minimal info for context

    // Determine role
    let role: UserRole = 'none'
    if (isCoach && isClient) role = 'both'
    else if (isCoach) role = 'coach'
    else if (isClient) role = 'client'

    return {
        userId,
        isCoach,
        isClient,
        role,
        coachId,
        clientId,
        clientCoachId,
        profile,
        clientRecord: isClient ? {
            id: clientId!,
            full_name: profile.full_name,
            coach_id: '',
            status: 'active'
        } : null
    }
}

/**
 * Quick check functions for layouts (use getUserContext for full info)
 */
export async function requireCoachAccess(userId: string): Promise<UserContext> {
    const context = await getUserContext(userId)
    if (!context.isCoach) {
        throw new Error('UNAUTHORIZED_COACH')
    }
    return context
}

export async function requireClientAccess(userId: string): Promise<UserContext> {
    const context = await getUserContext(userId)
    if (!context.isClient) {
        throw new Error('UNAUTHORIZED_CLIENT')
    }
    return context
}

/**
 * High-level mode resolution for entry-point redirection
 */
export async function resolveUserMode(userId: string): Promise<UserModeResolution> {
    const context = await getUserContext(userId)
    return context.role as UserModeResolution
}
