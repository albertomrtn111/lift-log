'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendOnboardingEmail } from '@/lib/n8n'
import { revalidatePath } from 'next/cache'
import { resolveOnboardingTemplateForClient } from '@/data/form-templates'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface SendOnboardingResult {
    success: boolean
    checkin_id?: string
    form_url?: string
    error?: string
}

export async function sendOnboardingAction(
    clientId: string,
    coachId: string
): Promise<SendOnboardingResult> {
    // 1) Validate coach membership
    let supabase, validatedCoachId: string
    try {
        ; ({ supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    // 2) Fetch client (must belong to this coach)
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, email, full_name')
        .eq('id', clientId)
        .eq('coach_id', validatedCoachId)
        .single()

    if (clientErr || !client) {
        return { success: false, error: 'Cliente no encontrado' }
    }

    // ✅ NEW: require email to send
    if (!client.email) {
        return { success: false, error: 'El cliente no tiene email configurado' }
    }

    // 3) Resolve the assigned onboarding template for this client.
    // Falls back to the default active onboarding template if the client
    // has no explicit assignment yet.
    const template = await resolveOnboardingTemplateForClient({
        supabase,
        coachId: validatedCoachId,
        clientId,
    })

    if (!template) {
        return {
            success: false,
            error:
                'No tienes una plantilla de onboarding disponible para este cliente. Asigna una en Formularios o define una por defecto.',
        }
    }

    // 4) Cancel any existing pending onboarding checkins for this client
    // so they can't be accessed anymore, then always create a fresh one
    await supabase
        .from('checkins')
        .update({ status: 'cancelled' })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('type', 'onboarding')
        .eq('status', 'pending')

    // 5) Always create a fresh onboarding checkin with the resolved template
    const { data: newCheckin, error: insertErr } = await supabase
        .from('checkins')
        .insert({
            coach_id: validatedCoachId,
            client_id: clientId,
            type: 'onboarding',
            status: 'pending',
            form_template_id: template.id,
            source: 'coach_portal',
            raw_payload: {},
        })
        .select('id')
        .single()

    if (insertErr || !newCheckin) {
        console.error('[sendOnboardingAction] Insert error:', insertErr)
        return { success: false, error: insertErr?.message || 'Error al crear el onboarding' }
    }

    const checkinId = newCheckin.id

    // 6) Build URL
    const formUrl = `${BASE_URL}/forms/${checkinId}`

    // 7) Call n8n (non-blocking)
    const webhookResult = await sendOnboardingEmail({
        clientId: client.id,
        coachId: validatedCoachId,
        clientEmail: client.email,
        clientName: client.full_name ?? '',
        checkinId,
        formTemplateId: template.id,
        formUrl,
    })

    if (!webhookResult.ok) {
        console.warn('[sendOnboardingAction] n8n webhook failed (non-blocking):', webhookResult.error)
    }

    revalidatePath('/coach/members')

    return {
        success: true,
        checkin_id: checkinId,
        form_url: formUrl,
    }
}
