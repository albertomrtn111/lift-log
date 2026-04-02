import { createClient } from '@/lib/supabase/server'
import type { Client, ClientWithMeta } from '@/types/coach'

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardKPIs {
    pendingToday: number
    pendingWeek: number
    atRisk: number
    totalActive: number
    totalInactive: number
    /** Number of clients with daysUntilCheckin < 0 */
    overdueCount: number
}

export interface AtRiskClient extends ClientWithMeta {
    riskReason: 'overdue' | 'low_adherence' | 'no_recent_checkin'
    riskDetail: string
}

export interface RecentCheckin {
    id: string
    client_id: string
    client_name: string
    submitted_at: string
    weight_kg: number | null
    weight_avg_kg: number | null
    steps_avg: number | null
    training_adherence_pct: number | null
    nutrition_adherence_pct: number | null
    review_id: string | null
    review_status: 'draft' | 'approved' | 'rejected' | null
}

export interface CompletedReview {
    review_id: string
    checkin_id: string
    client_id: string
    client_name: string
    approved_at: string
}

export interface SidebarBadges {
    dashboardPending: number
    membersPendingSignup: number
}

// ============================================================================
// DASHBOARD KPIS
// ============================================================================

export async function getDashboardKPIs(coachId: string): Promise<DashboardKPIs> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    const weekEnd = weekFromNow.toISOString().split('T')[0]

    // Get all clients for the coach
    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, status, next_checkin_date')
        .eq('coach_id', coachId)

    if (error || !clients) {
        console.error('Error fetching dashboard KPIs:', error)
        return { pendingToday: 0, pendingWeek: 0, atRisk: 0, totalActive: 0, totalInactive: 0, overdueCount: 0 }
    }

    const activeClients = clients.filter(c => c.status === 'active')
    const inactiveClients = clients.filter(c => c.status === 'inactive')

    const pendingToday = activeClients.filter(c => c.next_checkin_date <= today).length
    const pendingWeek = activeClients.filter(c =>
        c.next_checkin_date > today && c.next_checkin_date <= weekEnd
    ).length

    // Count overdue: next_checkin_date < today
    const overdueCount = activeClients.filter(c => c.next_checkin_date < today).length

    // Count at-risk: overdue by more than 3 days
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const overdueDate = threeDaysAgo.toISOString().split('T')[0]
    const atRisk = activeClients.filter(c => c.next_checkin_date < overdueDate).length

    return {
        pendingToday,
        pendingWeek,
        atRisk,
        totalActive: activeClients.length,
        totalInactive: inactiveClients.length,
        overdueCount,
    }
}

// ============================================================================
// HELPER: Enrich clients with last adherence + pending review
// ============================================================================

async function enrichClientsWithMeta(
    clients: Client[],
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ClientWithMeta[]> {
    if (clients.length === 0) return []

    const clientIds = clients.map(c => c.id)
    const todayDate = new Date()

    // Get latest checkin per client (with adherence)
    const { data: checkins } = await supabase
        .from('checkins')
        .select('client_id, submitted_at, training_adherence_pct, nutrition_adherence_pct')
        .in('client_id', clientIds)
        .eq('type', 'checkin')
        .order('submitted_at', { ascending: false })

    // Get reviews for latest checkins to check pending status
    const latestCheckinIds: string[] = []
    const { data: allCheckins } = await supabase
        .from('checkins')
        .select('id, client_id, status')
        .in('client_id', clientIds)
        .eq('type', 'checkin')
        .order('submitted_at', { ascending: false })
    // Get reviews for those latest checkins
    const pendingReviewByClient = new Map<string, boolean>()
    for (const c of (allCheckins || [])) {
        if (!pendingReviewByClient.has(c.client_id)) {
            pendingReviewByClient.set(c.client_id, c.status === 'reviewed')
        }
    }

    // Build per-client adherence map
    const adherenceMap = new Map<string, { pct: number | null; at: string | null }>()
    for (const c of (checkins || [])) {
        if (!adherenceMap.has(c.client_id)) {
            const t = c.training_adherence_pct
            const n = c.nutrition_adherence_pct
            let avg: number | null = null
            if (t != null && n != null) avg = Math.round((t + n) / 2)
            else if (t != null) avg = t
            else if (n != null) avg = n

            adherenceMap.set(c.client_id, { pct: avg, at: c.submitted_at })
        }
    }

    return clients.map((client: Client) => {
        const nextCheckin = new Date(client.next_checkin_date)
        const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        const meta = adherenceMap.get(client.id)
        return {
            ...client,
            daysUntilCheckin,
            lastAdherencePct: meta?.pct ?? null,
            lastCheckinAt: meta?.at ?? null,
            hasPendingReview: pendingReviewByClient.get(client.id) ?? false,
        } as ClientWithMeta
    })
}

// ============================================================================
// DUE TODAY CLIENTS
// ============================================================================

export async function getDueTodayClients(coachId: string): Promise<ClientWithMeta[]> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .lte('next_checkin_date', today)
        .order('next_checkin_date', { ascending: true })

    if (error || !data) {
        console.error('Error fetching due today clients:', error)
        return []
    }

    return enrichClientsWithMeta(data, supabase)
}

// ============================================================================
// DUE SOON CLIENTS (next 7 days)
// ============================================================================

export async function getDueSoonClients(coachId: string, days: number = 7): Promise<ClientWithMeta[]> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const endDate = futureDate.toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .gt('next_checkin_date', today)
        .lte('next_checkin_date', endDate)
        .order('next_checkin_date', { ascending: true })

    if (error || !data) {
        console.error('Error fetching due soon clients:', error)
        return []
    }

    return enrichClientsWithMeta(data, supabase)
}

// ============================================================================
// AT RISK CLIENTS
// ============================================================================

export async function getAtRiskClients(coachId: string): Promise<AtRiskClient[]> {
    const supabase = await createClient()
    const today = new Date()
    const threeDaysAgo = new Date(today)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const overdueDate = threeDaysAgo.toISOString().split('T')[0]

    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Get active clients
    const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('coach_id', coachId)
        .eq('status', 'active')

    if (clientsError || !clients) {
        console.error('Error fetching clients for risk:', clientsError)
        return []
    }

    // Get recent checkins for all clients
    const clientIds = clients.map(c => c.id)
    const { data: checkins } = await supabase
        .from('checkins')
        .select('client_id, submitted_at, training_adherence_pct, nutrition_adherence_pct')
        .in('client_id', clientIds)
        .eq('type', 'checkin')
        .order('submitted_at', { ascending: false })

    const atRiskClients: AtRiskClient[] = []
    const todayDate = new Date()

    for (const client of clients) {
        const nextCheckin = new Date(client.next_checkin_date)
        const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        const daysOverdue = -daysUntilCheckin

        // Check overdue (more than 3 days)
        if (client.next_checkin_date < overdueDate) {
            atRiskClients.push({
                ...client,
                daysUntilCheckin,
                riskReason: 'overdue',
                riskDetail: `Atrasado ${daysOverdue} días`
            })
            continue
        }

        // Check for low adherence or no recent checkin
        const clientCheckins = checkins?.filter(c => c.client_id === client.id) || []
        const latestCheckin = clientCheckins[0]

        if (!latestCheckin) {
            // Check if client has been around for more than 30 days
            const clientStart = new Date(client.start_date)
            if (clientStart < thirtyDaysAgo) {
                atRiskClients.push({
                    ...client,
                    daysUntilCheckin,
                    riskReason: 'no_recent_checkin',
                    riskDetail: 'Sin check-in en 30+ días'
                })
            }
            continue
        }

        // Check low adherence
        const trainingAdh = latestCheckin.training_adherence_pct ?? 100
        const nutritionAdh = latestCheckin.nutrition_adherence_pct ?? 100

        if (trainingAdh < 60 || nutritionAdh < 60) {
            const lowType = trainingAdh < 60 && nutritionAdh < 60
                ? 'entrenamiento y nutrición'
                : trainingAdh < 60
                    ? 'entrenamiento'
                    : 'nutrición'
            atRiskClients.push({
                ...client,
                daysUntilCheckin,
                riskReason: 'low_adherence',
                riskDetail: `Adherencia baja (${lowType})`
            })
        }
    }

    return atRiskClients
}

// ============================================================================
// RECENT CHECKINS
// ============================================================================

export async function getRecentCheckins(coachId: string, limit: number = 10): Promise<RecentCheckin[]> {
    const supabase = await createClient()

    // Get recent checkins with client info
    const { data: checkins, error } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            submitted_at,
            status,
            raw_payload,
            clients!inner(full_name)
        `)
        .eq('coach_id', coachId)
        .eq('type', 'checkin')
        .order('submitted_at', { ascending: false })
        .limit(limit)

    if (error || !checkins) {
        console.error('Error fetching recent checkins:', error)
        return []
    }

    // Get reviews for these checkins
    const checkinIds = checkins.map(c => c.id)
    const { data: reviews } = await supabase
        .from('reviews')
        .select('id, checkin_id, status')
        .in('checkin_id', checkinIds)

    const reviewMap = new Map(reviews?.map(r => [r.checkin_id, r]) || [])

    return checkins.map(checkin => {
        const review = reviewMap.get(checkin.id)
        const clientData = checkin.clients as unknown as { full_name: string }

        return {
            id: checkin.id,
            client_id: checkin.client_id,
            client_name: clientData?.full_name || 'Cliente',
            submitted_at: checkin.submitted_at,
            weight_kg: null,
            weight_avg_kg: null,
            steps_avg: null,
            training_adherence_pct: null,
            nutrition_adherence_pct: null,
            review_id: review?.id || null,
            review_status: review?.status || null,
        }
    })
}

// ============================================================================
// COMPLETED TODAY (Mejora 6)
// ============================================================================

export async function getCompletedToday(coachId: string): Promise<CompletedReview[]> {
    const supabase = await createClient()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
            id,
            checkin_id,
            updated_at,
            checkins!inner(client_id, clients!inner(full_name))
        `)
        .eq('status', 'approved')
        .gte('updated_at', todayStart.toISOString())
        .order('updated_at', { ascending: false })

    if (error || !reviews) {
        return []
    }

    return reviews.map((r: any) => {
        const checkinData = r.checkins as any
        return {
            review_id: r.id,
            checkin_id: r.checkin_id,
            client_id: checkinData?.client_id || '',
            client_name: checkinData?.clients?.full_name || 'Cliente',
            approved_at: r.updated_at,
        }
    })
}

// ============================================================================
// COACH DISPLAY NAME (Mejora 3)
// ============================================================================

export async function getCoachDisplayName(userId: string): Promise<string> {
    const supabase = await createClient()

    // Try profiles first
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()

    if (profile?.full_name) return profile.full_name

    // Fallback: coaches table via coach_memberships
    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('coaches(name)')
        .eq('user_id', userId)
        .single()

    const coachData = membership?.coaches as unknown as { name: string } | null
    if (coachData?.name) return coachData.name

    return 'Coach'
}

// ============================================================================
// SIDEBAR BADGES (Mejora 9)
// ============================================================================

export async function getSidebarBadges(coachId: string): Promise<SidebarBadges> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Count pending today
    const { count: pendingCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .lte('next_checkin_date', today)

    // Count pending signup
    const { count: signupCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .is('auth_user_id', null)
        .eq('status', 'active')

    return {
        dashboardPending: pendingCount ?? 0,
        membersPendingSignup: signupCount ?? 0,
    }
}
