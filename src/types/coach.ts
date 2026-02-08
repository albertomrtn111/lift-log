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
    status: 'active' | 'inactive' | 'pending'
    full_name: string
    email: string
    phone?: string
    start_date: string
    checkin_frequency_days: number
    next_checkin_date: string
    created_at: string
}

export interface ClientWithMeta extends Client {
    lastCheckinDate?: string
    lastAdherencePercent?: number
    daysUntilCheckin: number
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

export interface CalendarEvent {
    id: string
    clientId: string
    clientName: string
    date: string
    type: 'checkin'
    isUrgent: boolean
}

export interface CoachStats {
    activeClients: number
    pendingReviews: number
    upcomingCheckins: number
    nextCheckinClient?: string
    nextCheckinDate?: string
}

export type UserRole = 'coach' | 'client' | 'both' | 'none'
