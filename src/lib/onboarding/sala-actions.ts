'use server'

import { getCoachActor } from '@/lib/auth/get-coach-actor'
import { updateCoachOnboardingState } from '@/lib/onboarding/coach-workspace'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageTeam } from '@/lib/team/team-rules'

const AGENDA_MODES = ['connected', 'own', 'none'] as const
export type AgendaMode = (typeof AGENDA_MODES)[number]

export interface SalaSetup {
    name: string
    address: string
    agendaMode: AgendaMode
}

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

async function requireSalaManager() {
    const actor = await getCoachActor()
    if (!canManageTeam(actor.role)) throw new Error('Solo el propietario y los administradores pueden hacerlo.')
    return actor
}

async function getMainLocation(coachId: string) {
    const { data } = await createAdminClient()
        .from('locations')
        .select('id, address, agenda_mode')
        .eq('coach_id', coachId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    return data
}

export async function getSalaSetupAction(): Promise<ActionResult<SalaSetup>> {
    try {
        const { coachId } = await requireSalaManager()
        const [{ data: space }, location] = await Promise.all([
            createAdminClient().from('coaches').select('name').eq('id', coachId).maybeSingle(),
            getMainLocation(coachId),
        ])
        return {
            success: true,
            data: {
                name: space?.name ?? '',
                address: location?.address ?? '',
                agendaMode: (location?.agenda_mode as AgendaMode | undefined) ?? 'none',
            },
        }
    } catch {
        return { success: false, error: 'No se pudieron cargar los datos del centro.' }
    }
}

export async function saveCenterAction(input: { name: string; address: string }): Promise<ActionResult> {
    const name = input.name.replace(/\s+/g, ' ').trim()
    if (name.length < 2 || name.length > 80) {
        return { success: false, error: 'El nombre debe tener entre 2 y 80 caracteres.' }
    }
    try {
        const { coachId } = await requireSalaManager()
        const admin = createAdminClient()
        const location = await getMainLocation(coachId)
        const [spaceResult, locationResult] = await Promise.all([
            admin.from('coaches').update({ name }).eq('id', coachId),
            location
                ? admin.from('locations').update({ name, address: input.address.trim() || null }).eq('id', location.id)
                : Promise.resolve({ error: null }),
        ])
        return spaceResult.error || locationResult.error
            ? { success: false, error: 'No se pudo guardar.' }
            : { success: true }
    } catch {
        return { success: false, error: 'No se pudo guardar.' }
    }
}

export async function finishSalaOnboardingAction(agendaMode: string): Promise<ActionResult> {
    if (!AGENDA_MODES.includes(agendaMode as AgendaMode)) return { success: false, error: 'Elige un modo de agenda.' }
    try {
        const { coachId } = await requireSalaManager()
        const admin = createAdminClient()
        const location = await getMainLocation(coachId)
        if (location) await admin.from('locations').update({ agenda_mode: agendaMode }).eq('id', location.id)

        await updateCoachOnboardingState(coachId, {
            studio_pending: false,
            studio_completed_at: new Date().toISOString(),
        })
        return { success: true }
    } catch {
        return { success: false, error: 'No se pudo terminar.' }
    }
}
