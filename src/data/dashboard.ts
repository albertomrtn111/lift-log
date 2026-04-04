import { startOfDay, startOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Client, ClientWithMeta } from '@/types/coach'

export interface DashboardKPIs {
    pendingToday: number
    checkinsThisWeek: number
    requiresAttention: number
    activeClients: number
    inactiveClients: number
    pendingReviews: number
    highPriorityAttention: number
    upcomingThisWeek: number
    clientsWithoutProgram: number
}

export type AttentionReasonCode =
    | 'pending_review'
    | 'overdue_checkin'
    | 'low_adherence'
    | 'no_active_program'
    | 'no_recent_checkin'
    | 'stale_weight'

export interface AttentionReason {
    code: AttentionReasonCode
    label: string
    severity: 'high' | 'medium'
}

export interface AttentionClient extends ClientWithMeta {
    attentionReasons: AttentionReason[]
    primaryReason: string
    primarySeverity: 'high' | 'medium'
    riskReason: AttentionReasonCode
    riskDetail: string
    hasActiveProgram: boolean
    latestReviewStatus: 'draft' | 'approved' | 'rejected' | null
    latestReviewAIStatus: 'idle' | 'pending' | 'completed' | 'failed' | null
    lastMetricDate: string | null
    daysSinceLastCheckin: number | null
    daysSinceLastMetric: number | null
}

export type AtRiskClient = AttentionClient

export interface DashboardActionItem {
    id: string
    type: AttentionReasonCode | 'due_today'
    priority: 'high' | 'medium' | 'low'
    client_id: string
    client_name: string
    title: string
    description: string
    href: string
    ctaLabel: string
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
    weight_delta_kg: number | null
    review_id: string | null
    review_status: 'draft' | 'approved' | 'rejected' | null
    review_ai_status: 'idle' | 'pending' | 'completed' | 'failed' | null
    needs_review: boolean
}

export interface CompletedReview {
    review_id: string
    checkin_id: string
    client_id: string
    client_name: string
    approved_at: string
}

export interface WeeklyOperations {
    dueThisWeek: ClientWithMeta[]
    upcomingCount: number
    pendingReviews: number
    clientsWithoutProgram: number
    checkinsReceivedThisWeek: number
}

export interface ActivityItem {
    id: string
    type: 'checkin_received' | 'review_approved' | 'program_activated'
    client_id: string
    client_name: string
    timestamp: string
    title: string
    description: string
    href: string
}

export interface DashboardNotification {
    id: string
    type: 'chat_message' | 'checkin_received'
    client_id: string
    client_name: string
    title: string
    preview: string | null
    timestamp: string
    href: string
    ctaLabel: string
}

export interface CoachDashboardData {
    coachName: string
    kpis: DashboardKPIs
    actions: DashboardActionItem[]
    notifications: DashboardNotification[]
    attentionClients: AttentionClient[]
    recentCheckins: RecentCheckin[]
    weeklyOperations: WeeklyOperations
    activity: ActivityItem[]
}

export interface SidebarBadges {
    dashboardPending: number
    membersPendingSignup: number
}

interface CheckinRecord {
    id: string
    client_id: string
    submitted_at: string
    status: 'pending' | 'reviewed' | 'archived'
    weight_kg: number | null
    weight_avg_kg: number | null
    steps_avg: number | null
    training_adherence_pct: number | null
    nutrition_adherence_pct: number | null
    created_at: string
}

interface ReviewRecord {
    id: string
    checkin_id: string
    status: 'draft' | 'approved' | 'rejected'
    ai_status: 'idle' | 'pending' | 'completed' | 'failed' | null
    ai_summary: string | null
    created_at: string
}

interface MetricRecord {
    client_id: string
    metric_date: string
    weight_kg: number | null
    steps: number | null
    sleep_h: number | null
}

interface ProgramRecord {
    id: string
    client_id: string
    name: string
    effective_from: string
    created_at: string
}

interface MessageRecord {
    id: string
    client_id: string
    content: string
    created_at: string
    message_type: 'chat' | 'review_feedback'
    read_at: string | null
}

const ATTENTION_PRIORITY: Record<AttentionReasonCode, number> = {
    pending_review: 6,
    overdue_checkin: 5,
    low_adherence: 4,
    no_active_program: 3,
    no_recent_checkin: 2,
    stale_weight: 1,
}

function toDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string | null | undefined): Date | null {
    if (!dateKey) return null
    return new Date(`${dateKey}T12:00:00`)
}

function differenceInFullDays(target: string | Date, base: Date): number {
    const targetDate = typeof target === 'string' ? new Date(target) : target
    const diffMs = startOfDay(targetDate).getTime() - startOfDay(base).getTime()
    return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function timeAgoLabel(dateIso: string, today: Date): string {
    const diffDays = Math.max(0, -differenceInFullDays(dateIso, today))
    if (diffDays === 0) return 'hoy'
    if (diffDays === 1) return 'ayer'
    return `hace ${diffDays} días`
}

function getAverageAdherence(checkin: CheckinRecord | null): number | null {
    if (!checkin) return null
    const values = [checkin.training_adherence_pct, checkin.nutrition_adherence_pct].filter(
        (value): value is number => value != null
    )
    if (values.length === 0) return null
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function getPrimaryWeight(checkin: CheckinRecord | null): number | null {
    if (!checkin) return null
    return checkin.weight_avg_kg ?? checkin.weight_kg ?? null
}

function getClientSortName(client: Client): string {
    return client.full_name?.trim() || client.email || 'Cliente'
}

function buildClientMeta(
    client: Client,
    today: Date,
    latestCheckin: CheckinRecord | null,
    latestReview: ReviewRecord | null,
): ClientWithMeta {
    const nextCheckinDate = parseDateKey(client.next_checkin_date)
    const daysUntilCheckin = nextCheckinDate ? differenceInFullDays(nextCheckinDate, today) : 9999
    const lastAdherencePct = getAverageAdherence(latestCheckin)
    const hasPendingReview = Boolean(
        latestCheckin &&
        latestCheckin.status !== 'archived' &&
        (
            latestReview?.status === 'draft' ||
            (!latestReview && latestCheckin.status === 'reviewed')
        )
    )

    return {
        ...client,
        daysUntilCheckin,
        lastAdherencePct,
        lastCheckinAt: latestCheckin?.submitted_at ?? null,
        hasPendingReview,
    }
}

function buildAttentionReasons(params: {
    client: Client
    clientMeta: ClientWithMeta
    latestCheckin: CheckinRecord | null
    latestReview: ReviewRecord | null
    lastMetricDate: string | null
    hasActiveProgram: boolean
    today: Date
}): AttentionReason[] {
    const { client, clientMeta, latestCheckin, latestReview, lastMetricDate, hasActiveProgram, today } = params
    const reasons: AttentionReason[] = []
    const avgAdherence = getAverageAdherence(latestCheckin)
    const daysSinceLastCheckin = latestCheckin ? -differenceInFullDays(latestCheckin.submitted_at, today) : null
    const daysSinceLastMetric = lastMetricDate ? -differenceInFullDays(lastMetricDate, today) : null

    if (clientMeta.hasPendingReview && latestCheckin) {
        const ageLabel = daysSinceLastCheckin === 0 ? 'recibido hoy' : `recibido ${timeAgoLabel(latestCheckin.submitted_at, today)}`
        reasons.push({
            code: 'pending_review',
            label: `Check-in pendiente de revisar · ${ageLabel}`,
            severity: 'high',
        })
    }

    if (clientMeta.daysUntilCheckin < -2) {
        reasons.push({
            code: 'overdue_checkin',
            label: `Check-in atrasado ${Math.abs(clientMeta.daysUntilCheckin)} días`,
            severity: 'high',
        })
    }

    if (avgAdherence != null && avgAdherence < 70) {
        reasons.push({
            code: 'low_adherence',
            label: `Adherencia baja (${avgAdherence}%)`,
            severity: avgAdherence < 60 ? 'high' : 'medium',
        })
    }

    if (!hasActiveProgram) {
        reasons.push({
            code: 'no_active_program',
            label: 'Sin programa activo',
            severity: 'medium',
        })
    }

    const noRecentThreshold = Math.max(30, client.checkin_frequency_days * 2)
    if (!latestCheckin) {
        const daysSinceStart = -differenceInFullDays(client.start_date, today)
        if (daysSinceStart >= 30) {
            reasons.push({
                code: 'no_recent_checkin',
                label: 'Sin ningún check-in reciente',
                severity: 'medium',
            })
        }
    } else if (daysSinceLastCheckin != null && daysSinceLastCheckin > noRecentThreshold) {
        reasons.push({
            code: 'no_recent_checkin',
            label: `Sin check-in en ${daysSinceLastCheckin} días`,
            severity: 'medium',
        })
    }

    if (daysSinceLastMetric != null && daysSinceLastMetric > 14) {
        reasons.push({
            code: 'stale_weight',
            label: `Peso sin actualizar hace ${daysSinceLastMetric} días`,
            severity: 'medium',
        })
    }

    return reasons.sort((left, right) => {
        const severityDiff =
            (right.severity === 'high' ? 1 : 0) - (left.severity === 'high' ? 1 : 0)
        if (severityDiff !== 0) return severityDiff
        return ATTENTION_PRIORITY[right.code] - ATTENTION_PRIORITY[left.code]
    })
}

function buildActionFromAttentionClient(client: AttentionClient, today: Date): DashboardActionItem {
    const primaryReason = client.attentionReasons[0]
    const common = {
        id: `${client.id}-${primaryReason.code}`,
        client_id: client.id,
        client_name: client.full_name,
        href: `/coach/clients?client=${client.id}`,
    }

    switch (primaryReason.code) {
        case 'pending_review': {
            const aiReady = client.latestReviewStatus === 'draft' && client.latestReviewAIStatus === 'completed'
            return {
                ...common,
                type: 'pending_review',
                priority: 'high',
                title: aiReady ? `Validar borrador IA de ${client.full_name}` : `Revisar check-in de ${client.full_name}`,
                description: aiReady
                    ? `El borrador IA está listo. Último check-in ${timeAgoLabel(client.lastCheckinAt || today.toISOString(), today)}.`
                    : primaryReason.label,
                ctaLabel: aiReady ? 'Abrir revisión' : 'Abrir cliente',
            }
        }
        case 'overdue_checkin':
            return {
                ...common,
                type: 'overdue_checkin',
                priority: 'high',
                title: `Hacer seguimiento a ${client.full_name}`,
                description: primaryReason.label,
                ctaLabel: 'Abrir cliente',
            }
        case 'low_adherence':
            return {
                ...common,
                type: 'low_adherence',
                priority: primaryReason.severity === 'high' ? 'high' : 'medium',
                title: `Revisar adherencia de ${client.full_name}`,
                description: primaryReason.label,
                ctaLabel: 'Abrir cliente',
            }
        case 'no_active_program':
            return {
                ...common,
                type: 'no_active_program',
                priority: 'medium',
                title: `Asignar programa a ${client.full_name}`,
                description: 'Cliente activo sin programación de entrenamiento visible.',
                ctaLabel: 'Abrir cliente',
            }
        case 'no_recent_checkin':
            return {
                ...common,
                type: 'no_recent_checkin',
                priority: 'medium',
                title: `Retomar seguimiento con ${client.full_name}`,
                description: primaryReason.label,
                ctaLabel: 'Abrir cliente',
            }
        case 'stale_weight':
        default:
            return {
                ...common,
                type: 'stale_weight',
                priority: 'low',
                title: `Actualizar progreso de ${client.full_name}`,
                description: primaryReason.label,
                ctaLabel: 'Abrir cliente',
            }
    }
}

function compareActions(left: DashboardActionItem, right: DashboardActionItem): number {
    const priorityScore = { high: 3, medium: 2, low: 1 }
    const diff = priorityScore[right.priority] - priorityScore[left.priority]
    if (diff !== 0) return diff
    return left.client_name.localeCompare(right.client_name, 'es')
}

function buildRecentCheckins(
    checkins: CheckinRecord[],
    clientsById: Map<string, Client>,
    checkinsByClient: Map<string, CheckinRecord[]>,
    reviewsByCheckinId: Map<string, ReviewRecord>,
    limit: number,
): RecentCheckin[] {
    return checkins.slice(0, limit).map((checkin) => {
        const client = clientsById.get(checkin.client_id)
        const sameClientCheckins = checkinsByClient.get(checkin.client_id) ?? []
        const currentIndex = sameClientCheckins.findIndex((entry) => entry.id === checkin.id)
        const previousCheckin = currentIndex >= 0 ? sameClientCheckins[currentIndex + 1] ?? null : null
        const currentWeight = getPrimaryWeight(checkin)
        const previousWeight = getPrimaryWeight(previousCheckin)
        const review = reviewsByCheckinId.get(checkin.id) ?? null
        const needsReview = Boolean(review?.status === 'draft' || (!review && checkin.status === 'reviewed'))

        return {
            id: checkin.id,
            client_id: checkin.client_id,
            client_name: client?.full_name || client?.email || 'Cliente',
            submitted_at: checkin.submitted_at,
            weight_kg: checkin.weight_kg,
            weight_avg_kg: checkin.weight_avg_kg,
            steps_avg: checkin.steps_avg,
            training_adherence_pct: checkin.training_adherence_pct,
            nutrition_adherence_pct: checkin.nutrition_adherence_pct,
            weight_delta_kg:
                currentWeight != null && previousWeight != null
                    ? Number((currentWeight - previousWeight).toFixed(1))
                    : null,
            review_id: review?.id ?? null,
            review_status: review?.status ?? null,
            review_ai_status: review?.ai_status ?? null,
            needs_review: needsReview,
        }
    })
}

export async function getCoachDashboardData(coachId: string, userId: string): Promise<CoachDashboardData> {
    const supabase = await createClient()
    const today = startOfDay(new Date())
    const todayKey = toDateKey(today)
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const [
        clientsResult,
        coachName,
        approvedReviewsResult,
    ] = await Promise.all([
        supabase
            .from('clients')
            .select('*')
            .eq('coach_id', coachId)
            .order('full_name', { ascending: true }),
        getCoachDisplayName(userId),
        supabase
            .from('reviews')
            .select(`
                id,
                checkin_id,
                created_at,
                checkins!inner(
                    client_id,
                    clients!inner(full_name)
                )
            `)
            .eq('coach_id', coachId)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(8),
    ])

    if (clientsResult.error || !clientsResult.data) {
        console.error('Error fetching dashboard clients:', clientsResult.error)
        return {
            coachName,
            kpis: {
                pendingToday: 0,
                checkinsThisWeek: 0,
                requiresAttention: 0,
                activeClients: 0,
                inactiveClients: 0,
                pendingReviews: 0,
                highPriorityAttention: 0,
                upcomingThisWeek: 0,
                clientsWithoutProgram: 0,
            },
            actions: [],
            notifications: [],
            attentionClients: [],
            recentCheckins: [],
            weeklyOperations: {
                dueThisWeek: [],
                upcomingCount: 0,
                pendingReviews: 0,
                clientsWithoutProgram: 0,
                checkinsReceivedThisWeek: 0,
            },
            activity: [],
        }
    }

    const clients = clientsResult.data as Client[]
    const activeClients = clients.filter((client) => client.status === 'active')
    const inactiveClients = clients.filter((client) => client.status === 'inactive')
    const clientsById = new Map(clients.map((client) => [client.id, client]))
    const clientIds = activeClients.map((client) => client.id)

    if (clientIds.length === 0) {
        return {
            coachName,
            kpis: {
                pendingToday: 0,
                checkinsThisWeek: 0,
                requiresAttention: 0,
                activeClients: 0,
                inactiveClients: inactiveClients.length,
                pendingReviews: 0,
                highPriorityAttention: 0,
                upcomingThisWeek: 0,
                clientsWithoutProgram: 0,
            },
            actions: [],
            notifications: [],
            attentionClients: [],
            recentCheckins: [],
            weeklyOperations: {
                dueThisWeek: [],
                upcomingCount: 0,
                pendingReviews: 0,
                clientsWithoutProgram: 0,
                checkinsReceivedThisWeek: 0,
            },
            activity: [],
        }
    }

    const [
        checkinsResult,
        metricsResult,
        programsResult,
        messagesResult,
    ] = await Promise.all([
        supabase
            .from('checkins')
            .select('id, client_id, submitted_at, status, weight_kg, weight_avg_kg, steps_avg, training_adherence_pct, nutrition_adherence_pct, created_at')
            .eq('coach_id', coachId)
            .eq('type', 'checkin')
            .not('submitted_at', 'is', null)
            .in('client_id', clientIds)
            .order('submitted_at', { ascending: false }),
        supabase
            .from('client_metrics')
            .select('client_id, metric_date, weight_kg, steps, sleep_h')
            .in('client_id', clientIds)
            .order('metric_date', { ascending: false }),
        supabase
            .from('training_programs')
            .select('id, client_id, name, effective_from, created_at')
            .in('client_id', clientIds)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
        supabase
            .from('messages')
            .select('id, client_id, content, created_at, message_type, read_at')
            .eq('coach_id', coachId)
            .eq('sender_role', 'client')
            .eq('message_type', 'chat')
            .is('read_at', null)
            .in('client_id', clientIds)
            .order('created_at', { ascending: false })
            .limit(20),
    ])

    const checkins = (checkinsResult.data ?? []) as CheckinRecord[]
    const checkinIds = checkins.map((checkin) => checkin.id)

    const reviewsResult = checkinIds.length > 0
        ? await supabase
            .from('reviews')
            .select('id, checkin_id, status, ai_status, ai_summary, created_at')
            .in('checkin_id', checkinIds)
        : { data: [], error: null }

    if (checkinsResult.error) console.error('Error fetching dashboard checkins:', checkinsResult.error)
    if (metricsResult.error) console.error('Error fetching dashboard metrics:', metricsResult.error)
    if (programsResult.error) console.error('Error fetching dashboard programs:', programsResult.error)
    if (reviewsResult.error) console.error('Error fetching dashboard reviews:', reviewsResult.error)
    if (messagesResult.error) console.error('Error fetching dashboard messages:', messagesResult.error)

    const reviews = (reviewsResult.data ?? []) as ReviewRecord[]
    const metrics = (metricsResult.data ?? []) as MetricRecord[]
    const programs = (programsResult.data ?? []) as ProgramRecord[]
    const messages = (messagesResult.data ?? []) as MessageRecord[]

    const checkinsByClient = new Map<string, CheckinRecord[]>()
    for (const checkin of checkins) {
        const list = checkinsByClient.get(checkin.client_id) ?? []
        list.push(checkin)
        checkinsByClient.set(checkin.client_id, list)
    }

    const reviewsByCheckinId = new Map<string, ReviewRecord>()
    for (const review of reviews) {
        const current = reviewsByCheckinId.get(review.checkin_id)
        if (!current || new Date(review.created_at) > new Date(current.created_at)) {
            reviewsByCheckinId.set(review.checkin_id, review)
        }
    }

    const latestMetricByClient = new Map<string, MetricRecord>()
    for (const metric of metrics) {
        if (!latestMetricByClient.has(metric.client_id)) {
            latestMetricByClient.set(metric.client_id, metric)
        }
    }

    const activeProgramByClient = new Map<string, ProgramRecord>()
    for (const program of programs) {
        if (!activeProgramByClient.has(program.client_id)) {
            activeProgramByClient.set(program.client_id, program)
        }
    }

    const enrichedClients: AttentionClient[] = activeClients.map((client) => {
        const latestCheckin = (checkinsByClient.get(client.id) ?? [])[0] ?? null
        const latestReview = latestCheckin ? reviewsByCheckinId.get(latestCheckin.id) ?? null : null
        const clientMeta = buildClientMeta(client, today, latestCheckin, latestReview)
        const lastMetricDate = latestMetricByClient.get(client.id)?.metric_date ?? null
        const hasActiveProgram = activeProgramByClient.has(client.id)
        const attentionReasons = buildAttentionReasons({
            client,
            clientMeta,
            latestCheckin,
            latestReview,
            lastMetricDate,
            hasActiveProgram,
            today,
        })

        return {
            ...clientMeta,
            attentionReasons,
            primaryReason: attentionReasons[0]?.label ?? '',
            primarySeverity: attentionReasons[0]?.severity ?? 'medium',
            riskReason: attentionReasons[0]?.code ?? 'no_recent_checkin',
            riskDetail: attentionReasons[0]?.label ?? 'Requiere atención',
            hasActiveProgram,
            latestReviewStatus: latestReview?.status ?? null,
            latestReviewAIStatus: latestReview?.ai_status ?? null,
            lastMetricDate,
            daysSinceLastCheckin: latestCheckin ? -differenceInFullDays(latestCheckin.submitted_at, today) : null,
            daysSinceLastMetric: lastMetricDate ? -differenceInFullDays(lastMetricDate, today) : null,
        }
    })

    const attentionClients = enrichedClients
        .filter((client) => client.attentionReasons.length > 0)
        .sort((left, right) => {
            const severityDiff =
                (right.primarySeverity === 'high' ? 1 : 0) - (left.primarySeverity === 'high' ? 1 : 0)
            if (severityDiff !== 0) return severityDiff
            const reasonDiff =
                ATTENTION_PRIORITY[right.attentionReasons[0].code] - ATTENTION_PRIORITY[left.attentionReasons[0].code]
            if (reasonDiff !== 0) return reasonDiff
            if ((left.daysUntilCheckin ?? 9999) !== (right.daysUntilCheckin ?? 9999)) {
                return left.daysUntilCheckin - right.daysUntilCheckin
            }
            return getClientSortName(left).localeCompare(getClientSortName(right), 'es')
        })

    const actionItems = attentionClients.map((client) => buildActionFromAttentionClient(client, today))
    const dueTodayOnlyActions = enrichedClients
        .filter((client) => client.daysUntilCheckin === 0 && !client.hasPendingReview)
        .map<DashboardActionItem>((client) => ({
            id: `${client.id}-due-today`,
            type: 'due_today',
            priority: 'medium',
            client_id: client.id,
            client_name: client.full_name,
            title: `Hoy toca check-in de ${client.full_name}`,
            description: 'Seguimiento previsto para hoy.',
            href: `/coach/clients?client=${client.id}`,
            ctaLabel: 'Abrir cliente',
        }))

    const actions = [...actionItems, ...dueTodayOnlyActions]
        .sort(compareActions)
        .slice(0, 8)

    const recentCheckins = buildRecentCheckins(
        checkins,
        clientsById,
        checkinsByClient,
        reviewsByCheckinId,
        8
    )

    const checkinsThisWeek = checkins.filter(
        (checkin) => new Date(checkin.submitted_at) >= weekStart
    ).length

    // Build notifications: unread chats (grouped per client) + check-ins received in last 72h
    const threeDaysAgo = new Date(today)
    threeDaysAgo.setDate(today.getDate() - 3)

    const unreadByClient = new Map<string, MessageRecord>()
    for (const message of messages) {
        if (!unreadByClient.has(message.client_id)) {
            unreadByClient.set(message.client_id, message)
        }
    }

    const chatNotifications: DashboardNotification[] = Array.from(unreadByClient.values()).map((message) => {
        const client = clientsById.get(message.client_id)
        const clientName = client?.full_name || client?.email || 'Cliente'
        return {
            id: `chat-${message.id}`,
            type: 'chat_message' as const,
            client_id: message.client_id,
            client_name: clientName,
            title: `Nuevo mensaje de ${clientName}`,
            preview: message.content.length > 80 ? message.content.slice(0, 80) + '…' : message.content,
            timestamp: message.created_at,
            href: `/coach/clients?client=${message.client_id}`,
            ctaLabel: 'Ir al chat',
        }
    })

    const checkinNotifications: DashboardNotification[] = checkins
        .filter((checkin) => new Date(checkin.submitted_at) >= threeDaysAgo)
        .slice(0, 8)
        .map((checkin) => {
            const client = clientsById.get(checkin.client_id)
            const clientName = client?.full_name || client?.email || 'Cliente'
            const review = reviewsByCheckinId.get(checkin.id)
            return {
                id: `checkin-notif-${checkin.id}`,
                type: 'checkin_received' as const,
                client_id: checkin.client_id,
                client_name: clientName,
                title: `Nuevo check-in de ${clientName}`,
                preview: null,
                timestamp: checkin.submitted_at,
                href: `/coach/clients?client=${checkin.client_id}`,
                ctaLabel: review ? 'Abrir revisión' : 'Abrir cliente',
            }
        })

    const notifications: DashboardNotification[] = [...chatNotifications, ...checkinNotifications]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10)

    const dueThisWeek = enrichedClients
        .filter((client) => {
            const nextCheckin = parseDateKey(client.next_checkin_date)
            return nextCheckin && nextCheckin > today && nextCheckin <= weekEnd
        })
        .sort((left, right) => left.daysUntilCheckin - right.daysUntilCheckin)

    const pendingReviewCount = enrichedClients.filter((client) => client.hasPendingReview).length
    const highPriorityAttention = attentionClients.filter((client) => client.primarySeverity === 'high').length
    const clientsWithoutProgram = enrichedClients.filter((client) => !client.hasActiveProgram).length

    const approvedReviewActivities = ((approvedReviewsResult.data ?? []) as unknown as Array<{
        id: string
        checkin_id: string
        created_at: string
        checkins: Array<{ client_id: string; clients: Array<{ full_name: string }> | null }> | null
    }>).map((review) => {
        const checkinRelation = review.checkins?.[0] ?? null
        const clientName = checkinRelation?.clients?.[0]?.full_name ?? 'Cliente'

        return {
            id: `review-${review.id}`,
            type: 'review_approved' as const,
            client_id: checkinRelation?.client_id ?? '',
            client_name: clientName,
            timestamp: review.created_at,
            title: 'Review aprobada',
            description: `Feedback enviado a ${clientName}.`,
            href: checkinRelation?.client_id ? `/coach/clients?client=${checkinRelation.client_id}` : '/coach/dashboard',
        }
    })

    const checkinActivities = recentCheckins.slice(0, 5).map((checkin) => ({
        id: `checkin-${checkin.id}`,
        type: 'checkin_received' as const,
        client_id: checkin.client_id,
        client_name: checkin.client_name,
        timestamp: checkin.submitted_at,
        title: 'Check-in recibido',
        description: `${checkin.client_name} envió su revisión.`,
        href: `/coach/clients?client=${checkin.client_id}`,
    }))

    const tenDaysAgo = new Date(today)
    tenDaysAgo.setDate(today.getDate() - 10)
    const programActivities = programs
        .filter((program) => parseDateKey(program.effective_from) && parseDateKey(program.effective_from)! >= tenDaysAgo)
        .slice(0, 5)
        .map((program) => ({
            id: `program-${program.id}`,
            type: 'program_activated' as const,
            client_id: program.client_id,
            client_name: clientsById.get(program.client_id)?.full_name || 'Cliente',
            timestamp: `${program.effective_from}T12:00:00`,
            title: 'Programa activo',
            description: `${program.name} está activo para ${clientsById.get(program.client_id)?.full_name || 'Cliente'}.`,
            href: `/coach/clients?client=${program.client_id}`,
        }))

    const activity = [...checkinActivities, ...approvedReviewActivities, ...programActivities]
        .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
        .slice(0, 8)

    return {
        coachName,
        kpis: {
            pendingToday: actions.filter((action) => action.priority === 'high').length,
            checkinsThisWeek,
            requiresAttention: attentionClients.length,
            activeClients: activeClients.length,
            inactiveClients: inactiveClients.length,
            pendingReviews: pendingReviewCount,
            highPriorityAttention,
            upcomingThisWeek: dueThisWeek.length,
            clientsWithoutProgram,
        },
        actions,
        notifications,
        attentionClients,
        recentCheckins,
        weeklyOperations: {
            dueThisWeek,
            upcomingCount: dueThisWeek.length,
            pendingReviews: pendingReviewCount,
            clientsWithoutProgram,
            checkinsReceivedThisWeek: checkinsThisWeek,
        },
        activity,
    }
}

export async function getCoachDisplayName(userId: string): Promise<string> {
    const supabase = await createClient()

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()

    if (profile?.full_name) return profile.full_name

    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('coaches(name)')
        .eq('user_id', userId)
        .single()

    const coachData = membership?.coaches as unknown as { name: string } | null
    if (coachData?.name) return coachData.name

    return 'Coach'
}

export async function getSidebarBadges(coachId: string): Promise<SidebarBadges> {
    const supabase = await createClient()
    const today = toDateKey(new Date())

    const { count: pendingCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .lte('next_checkin_date', today)

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
