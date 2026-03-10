'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendOnboardingEmail } from '@/lib/n8n'
import { revalidatePath } from 'next/cache'

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

    // 3) Find default onboarding template
    const { data: template, error: tplErr } = await supabase
        .from('form_templates')
        .select('id')
        .eq('coach_id', validatedCoachId)
        .eq('type', 'onboarding')
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .single()

    if (tplErr || !template) {
        return {
            success: false,
            error:
                'No tienes una plantilla default de onboarding. Crea una en Formularios y márcala como default.',
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

    // 5) Always create a fresh onboarding checkin with the current default template
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
