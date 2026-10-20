import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { FormField } from '@/types/forms'
import { onboardingStateFromCheckins } from './athlete-journey.js'
import {
    buildAthleteSteps,
    estimateFormSections,
    type AthleteOnboardingState,
} from './athlete-onboarding.js'

export interface AthleteWelcomeData {
    clientId: string
    /** Invitado con el flujo nuevo: solo a estos se les muestra la bienvenida */
    guided: boolean
    firstName: string
    coachName: string
    needsPassword: boolean
    state: AthleteOnboardingState
    hasPushSubscription: boolean
    stravaConnected: boolean
    form: {
        status: 'none' | 'pending' | 'completed'
        checkinId: string | null
        hasDraft: boolean
        sections: { title: string; questions: number; minutes: number }[]
        minutes: number
    }
    steps: ReturnType<typeof buildAthleteSteps>
}

/** Nombre con el que el atleta conoce a su coach: su nombre de pila o el del negocio */
export async function getCoachDisplayName(coachId: string): Promise<string> {
    const admin = createAdminClient()
    const [{ data: owner }, { data: coach }] = await Promise.all([
        admin
            .from('coach_memberships')
            .select('user_id')
            .eq('coach_id', coachId)
            .eq('role', 'owner')
            .eq('status', 'active')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle(),
        admin.from('coaches').select('name').eq('id', coachId).maybeSingle(),
    ])
    let firstName: string | undefined
    if (owner?.user_id) {
        const { data: profile } = await admin.from('profiles').select('full_name').eq('id', owner.user_id).maybeSingle()
        firstName = (profile?.full_name as string | null | undefined)?.trim().split(/\s+/)[0]
    }
    return firstName || (coach?.name as string | undefined)?.trim() || 'Tu entrenador'
}

/** Todo lo que necesita la bienvenida del atleta que ha iniciado sesión */
export async function getAthleteWelcomeData(userId: string): Promise<AthleteWelcomeData | null> {
    const admin = createAdminClient()
    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, full_name, preferences')
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!client) return null

    const clientId = client.id as string
    const [coachName, { count: pushCount }, { data: integration }, { data: onboardingCheckins }] = await Promise.all([
        getCoachDisplayName(client.coach_id as string),
        admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
        admin.from('athlete_integrations').select('status').eq('client_id', clientId).eq('provider', 'strava').maybeSingle(),
        admin
            .from('checkins')
            .select('id, status, raw_payload, form_template_id, created_at')
            .eq('client_id', clientId)
            .eq('type', 'onboarding')
            .order('created_at', { ascending: false }),
    ])

    const formStatus = onboardingStateFromCheckins((onboardingCheckins ?? []) as { status: string | null }[])
    const pending = (onboardingCheckins ?? []).find(checkin => checkin.status === 'pending') ?? null
    let sections: AthleteWelcomeData['form']['sections'] = []
    if (pending?.form_template_id) {
        const { data: template } = await admin.from('form_templates').select('schema').eq('id', pending.form_template_id).maybeSingle()
        sections = estimateFormSections(Array.isArray(template?.schema) ? template.schema as FormField[] : [])
    }
    const minutes = sections.reduce((sum, section) => sum + section.minutes, 0)
    const draft = (pending?.raw_payload as { _draft?: Record<string, unknown> } | null)?._draft

    const preferences = (client.preferences ?? {}) as { onboarding?: AthleteOnboardingState }
    const state = preferences.onboarding ?? {}
    const hasPushSubscription = (pushCount ?? 0) > 0
    const stravaConnected = Boolean(integration && !['disconnected', 'revoked', 'error'].includes(integration.status as string))

    return {
        clientId,
        guided: Boolean(state.guided),
        firstName: (client.full_name as string | null)?.trim().split(/\s+/)[0] || 'atleta',
        coachName,
        // signed_up_at no sirve: el trigger de vinculación lo rellena al crear la cuenta
        needsPassword: !state.password_set_at,
        state,
        hasPushSubscription,
        stravaConnected,
        form: {
            status: formStatus,
            checkinId: pending?.id ?? null,
            hasDraft: Boolean(draft && Object.keys(draft).length > 0),
            sections,
            minutes,
        },
        steps: buildAthleteSteps({ state, hasPushSubscription, stravaConnected, form: formStatus, formMinutes: minutes }),
    }
}
