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
        return { pendingToday: 0, pendingWeek: 0, atRisk: 0, totalActive: 0, totalInactive: 0 }
    }

    const activeClients = clients.filter(c => c.status === 'active')
    const inactiveClients = clients.filter(c => c.status === 'inactive')

    const pendingToday = activeClients.filter(c => c.next_checkin_date <= today).length
    const pendingWeek = activeClients.filter(c =>
        c.next_checkin_date > today && c.next_checkin_date <= weekEnd
    ).length

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
    }
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

    const todayDate = new Date()
    return data.map((client: Client) => {
        const nextCheckin = new Date(client.next_checkin_date)
        const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        return { ...client, daysUntilCheckin } as ClientWithMeta
    })
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

    const todayDate = new Date()
    return data.map((client: Client) => {
        const nextCheckin = new Date(client.next_checkin_date)
        const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        return { ...client, daysUntilCheckin } as ClientWithMeta
    })
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
            weight_kg,
            weight_avg_kg,
            steps_avg,
            training_adherence_pct,
            nutrition_adherence_pct,
            clients!inner(full_name)
        `)
        .eq('coach_id', coachId)
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
            weight_kg: checkin.weight_kg,
            weight_avg_kg: checkin.weight_avg_kg,
            steps_avg: checkin.steps_avg,
            training_adherence_pct: checkin.training_adherence_pct,
            nutrition_adherence_pct: checkin.nutrition_adherence_pct,
            review_id: review?.id || null,
            review_status: review?.status || null,
        }
    })
}
