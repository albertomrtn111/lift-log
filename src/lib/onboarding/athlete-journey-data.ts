import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildAthleteJourney, onboardingStateFromCheckins, type Journey } from './athlete-journey.js'

/** Atletas recientes cuyo alta aún no se ha completado (para "Atletas en camino") */
const RECENT_DAYS = 45
const MAX_ROWS = 6

export interface AthleteJourneyRow {
    clientId: string
    name: string
    email: string
    invitedAt: string | null
    journey: Journey
}

export async function getAthleteJourneys(coachId: string): Promise<AthleteJourneyRow[]> {
    const admin = createAdminClient()
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: clients, error } = await admin
        .from('clients')
        .select('id, full_name, email, invited_at, signed_up_at, accepted_at, created_at')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .eq('is_sample', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })

    if (error) {
        console.warn('[getAthleteJourneys]', error.message)
        return []
    }
    if (!clients?.length) return []

    const ids = clients.map(client => client.id as string)
    const [{ data: subscriptions }, { data: onboardingCheckins }] = await Promise.all([
        admin.from('push_subscriptions').select('client_id').in('client_id', ids),
        admin.from('checkins').select('client_id, status').in('client_id', ids).eq('type', 'onboarding'),
    ])

    const withPush = new Set((subscriptions ?? []).map(row => row.client_id as string))

    return clients
        .map(client => ({
            clientId: client.id as string,
            name: (client.full_name as string | null) || (client.email as string),
            email: client.email as string,
            invitedAt: client.invited_at as string | null,
            journey: buildAthleteJourney({
                invitedAt: client.invited_at as string | null,
                signedUpAt: client.signed_up_at as string | null,
                acceptedAt: client.accepted_at as string | null,
                hasPushSubscription: withPush.has(client.id as string),
                onboarding: onboardingStateFromCheckins(
                    (onboardingCheckins ?? []).filter(row => row.client_id === client.id) as { status: string | null }[]
                ),
            }),
        }))
        .filter(row => !row.journey.complete)
        .slice(0, MAX_ROWS)
}
