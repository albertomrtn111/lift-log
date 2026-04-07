'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendReviewEmail } from '@/lib/n8n'
import { revalidatePath } from 'next/cache'
import { resolveCheckinTemplateForClient } from '@/data/form-templates'
import { getFormUrl } from '@/lib/app-url'

interface SendReviewResult {
    success: boolean
    checkin_id?: string
    form_url?: string
    error?: string
}

export async function sendReviewAction(
    clientId: string,
    coachId: string
): Promise<SendReviewResult> {
    // 1) Validate coach
    let supabase, validatedCoachId: string
    try {
        ; ({ supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    // 2) Fetch client
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, email, full_name')
        .eq('id', clientId)
        .eq('coach_id', validatedCoachId)
        .single()

    if (clientErr || !client) return { success: false, error: 'Cliente no encontrado' }
    if (!client.email) return { success: false, error: 'El cliente no tiene email configurado' }

    // 3) Resolve the assigned checkin template for this client.
    // Falls back to the default active check-in template if the client
    // has no explicit assignment yet.
    const template = await resolveCheckinTemplateForClient({
        supabase,
        coachId: validatedCoachId,
        clientId,
    })

    if (!template) {
        return {
            success: false,
            error: 'No tienes una plantilla de revisión asignada a este cliente. Asígnala desde su perfil en Clientes o desde Formularios.',
        }
    }

    // 4) Archive existing pending review checkins for this client
    await supabase
        .from('checkins')
        .update({ status: 'archived' })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('type', 'checkin')
        .eq('status', 'pending')

    // 5) Create fresh review checkin
    const { data: newCheckin, error: insertErr } = await supabase
        .from('checkins')
        .insert({
            coach_id: validatedCoachId,
            client_id: clientId,
            type: 'checkin',
            status: 'pending',
            form_template_id: template.id,
            source: 'coach_portal',
            raw_payload: {},
        })
        .select('id')
        .single()

    if (insertErr || !newCheckin) {
        console.error('[sendReviewAction] Insert error:', insertErr)
        return { success: false, error: insertErr?.message || 'Error al crear la revisión' }
    }

    const checkinId = newCheckin.id
    const formUrl = getFormUrl(checkinId)

    // 6) Call n8n webhook (non-blocking, just sends the email)
    const webhookResult = await sendReviewEmail({
        clientId: client.id,
        coachId: validatedCoachId,
        clientEmail: client.email,
        clientName: client.full_name ?? '',
        checkinId,
        formTemplateId: template.id,
        formUrl,
    })

    if (!webhookResult.ok) {
        console.warn('[sendReviewAction] n8n webhook failed (non-blocking):', webhookResult.error)
    }

    // NOTE: We intentionally do NOT update next_checkin_date here.
    // The scheduled review date must remain unchanged.

    revalidatePath('/coach/members')

    return {
        success: true,
        checkin_id: checkinId,
        form_url: formUrl,
    }
}
