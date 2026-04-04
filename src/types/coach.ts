// Coach Portal Types

export interface Coach {
    id: string
    name: string
    slug: string
    created_by: string
    created_at: string
}

export interface CoachMembership {
    id: string
    coach_id: string
    user_id: string
    role: 'owner' | 'coach' | 'viewer'
    status: 'active' | 'inactive' | 'pending'
    created_at: string
}

export interface Client {
    id: string
    coach_id: string
    user_id: string | null // NULL until client registers
    auth_user_id: string | null // NULL until client signs up — canonical linkage field
    status: 'active' | 'inactive' | 'pending'
    full_name: string
    email: string
    phone?: string
    start_date: string
    checkin_frequency_days: number
    next_checkin_date: string
    onboarding_status: 'pending' | 'active' | 'completed'
    invite_status: 'pending' | 'sent'
    invited_at: string | null
    created_at: string
    payment_amount?: number | null
    payment_day?: number | null
    payment_notes?: string | null
}

export interface ClientWithMeta extends Client {
    lastCheckinDate?: string
    lastAdherencePercent?: number
    daysUntilCheckin: number
    /** Average of training + nutrition adherence from latest checkin (0-100) */
    lastAdherencePct?: number | null
    /** true if the client has a submitted checkin without an approved review */
    hasPendingReview?: boolean
    /** ISO string of the most recent checkin */
    lastCheckinAt?: string | null
}

export interface Checkin {
    id: string
    client_id: string
    date: string
    weight?: number
    steps?: number
    sleep_hours?: number
    adherence_percent?: number
    notes?: string
    created_at: string
}

export interface Review {
    id: string
    client_id: string
    checkin_id?: string
    coach_id: string
    date: string
    summary?: string
    next_steps?: string
    status: 'draft' | 'sent' | 'acknowledged'
    created_at: string
}

export type CalendarEventStatus = 'completed' | 'pending_review' | 'scheduled' | 'missing'
export type CalendarNoteKind = 'note' | 'reminder' | 'alert'

export interface CalendarEvent {
    id: string
    clientId: string
    clientName: string
    date: string
    type: 'checkin'
    isUrgent: boolean
    status: CalendarEventStatus
    projected?: boolean
    checkinId?: string
    reviewId?: string
    reviewStatus?: 'draft' | 'approved' | 'rejected' | null
    checkinStatus?: 'pending' | 'reviewed' | 'archived' | null
    submittedAt?: string | null
    expectedDate?: string | null
    source?: 'scheduled' | 'submitted'
    checkinSource?: string | null
    weightKg?: number | null
    trainingAdherencePct?: number | null
    nutritionAdherencePct?: number | null
    sleepAvgH?: number | null
    aiStatus?: 'idle' | 'pending' | 'completed' | 'failed' | null
    rawMetricCount?: number
    rawResponseCount?: number
}

export interface CalendarNote {
    id: string
    date: string
    kind: CalendarNoteKind
    content: string
    clientId: string | null
    clientName: string | null
    createdAt: string
    updatedAt: string
}

export interface CalendarData {
    events: CalendarEvent[]
    notes: CalendarNote[]
    notesEnabled: boolean
}

export interface CoachStats {
    activeClients: number
    pendingReviews: number
    upcomingCheckins: number
    nextCheckinClient?: string
    nextCheckinDate?: string
}

export type UserRole = 'coach' | 'client' | 'both' | 'none'
