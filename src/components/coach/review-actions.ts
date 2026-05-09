'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendReviewEmail } from '@/lib/n8n'
import { revalidatePath } from 'next/cache'
import { resolveCheckinTemplateForClient } from '@/data/form-templates'
import { getFormUrl } from '@/lib/app-url'
import { toLocalDateStr } from '@/lib/date-utils'
import { sendReviewCreatedNotification } from '@/lib/notifications/client'
import {
    listSchedulesForClient,
    type ClientReviewScheduleWithTemplate,
} from '@/data/review-schedules'

interface SendReviewResult {
    success: boolean
    checkin_id?: string
    form_url?: string
    error?: string
    /**
     * Cuando hay >1 schedule activo y no se especificó scheduleId,
     * se devuelve esta lista para que el coach elija.
     */
    needsSelection?: ClientReviewScheduleWithTemplate[]
}

export async function sendReviewAction(
    clientId: string,
    coachId: string,
    scheduleId?: string,
): Promise<SendReviewResult> {
    // 1) Validate coach
    let supabase, validatedCoachId: string
    try {
        ;({ supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    // 2) Fetch client
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, email, full_name, next_checkin_date, checkin_frequency_days')
        .eq('id', clientId)
        .eq('coach_id', validatedCoachId)
        .single()

    if (clientErr || !client) return { success: false, error: 'Cliente no encontrado' }
    if (!client.email) return { success: false, error: 'El cliente no tiene email configurado' }

    // 3) Resolver schedule + plantilla
    let chosenSchedule: ClientReviewScheduleWithTemplate | null = null
    let formTemplateId: string | null = null
    let frequencyDays = client.checkin_frequency_days ?? 14
    let scheduledDate: string | null = client.next_checkin_date ?? null

    if (scheduleId) {
        // Caso A: el coach eligió uno explícitamente
        const allSchedules = await listSchedulesForClient(clientId)
        const found = allSchedules.find(s => s.id === scheduleId)
        if (!found) {
            return { success: false, error: 'Revisión no encontrada para este atleta' }
        }
        if (!found.is_active) {
            return { success: false, error: 'Esta revisión está pausada. Reactívala en el atleta antes de enviarla.' }
        }
        if (!found.review_template) {
            return { success: false, error: 'La plantilla de revisión asociada no existe' }
        }
        chosenSchedule = found
        formTemplateId = found.review_template.form_template_id
        frequencyDays = found.frequency_days
        scheduledDate = found.next_due_date ?? scheduledDate
    } else {
        // Caso B: buscar schedules activos
        const allSchedules = await listSchedulesForClient(clientId)
        const active = allSchedules.filter(s => s.is_active && s.review_template?.is_active)

        if (active.length > 1) {
            return { success: false, needsSelection: active }
        }

        if (active.length === 1) {
            const s = active[0]
            chosenSchedule = s
            formTemplateId = s.review_template?.form_template_id ?? null
            frequencyDays = s.frequency_days
            scheduledDate = s.next_due_date ?? scheduledDate
        } else {
            // Caso C: fallback legacy — usar resolveCheckinTemplateForClient
            const legacyTemplate = await resolveCheckinTemplateForClient({
                supabase,
                coachId: validatedCoachId,
                clientId,
            })
            if (!legacyTemplate) {
                return {
                    success: false,
                    error: 'Este atleta no tiene revisiones asignadas. Asígnale una en su perfil → Revisiones.',
                }
            }
            formTemplateId = legacyTemplate.id
        }
    }

    // 4) Calcular periodo
    const periodStart = scheduledDate
        ? (() => {
            const start = new Date(`${scheduledDate}T12:00:00`)
            start.setDate(start.getDate() - frequencyDays)
            return toLocalDateStr(start)
        })()
        : null

    // 5) Archivar checkins pendientes anteriores del mismo schedule (o globales si no hay schedule)
    const archiveQuery = supabase
        .from('checkins')
        .update({ status: 'archived' })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('type', 'checkin')
        .eq('status', 'pending')

    // Si hay schedule, solo archivar las de ESE schedule. Si no, archivar todas legacy.
    if (chosenSchedule) {
        await archiveQuery.eq('review_schedule_id', chosenSchedule.id)
    } else {
        await archiveQuery.is('review_schedule_id', null)
    }

    // 6) Insertar nueva revisión
    const { data: newCheckin, error: insertErr } = await supabase
        .from('checkins')
        .insert({
            coach_id: validatedCoachId,
            client_id: clientId,
            type: 'checkin',
            status: 'pending',
            period_start: periodStart,
            period_end: scheduledDate,
            form_template_id: formTemplateId,
            review_template_id: chosenSchedule?.review_template_id ?? null,
            review_schedule_id: chosenSchedule?.id ?? null,
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

    // 7) Marcar last_sent_at + adelantar next_due_date en el schedule (si aplica).
    //    Regla: avanzamos a "hoy + frequency_days" para que el siguiente envío
    //    cuente desde HOY (envío manual = reset del ciclo). Si el coach quiere
    //    una fecha distinta, puede ajustarla manualmente desde el modal del atleta.
    if (chosenSchedule) {
        const nextDue = new Date()
        nextDue.setDate(nextDue.getDate() + chosenSchedule.frequency_days)
        const nextDueDateStr = nextDue.toISOString().slice(0, 10)

        await supabase
            .from('client_review_schedules')
            .update({
                last_sent_at: new Date().toISOString(),
                next_due_date: nextDueDateStr,
            })
            .eq('id', chosenSchedule.id)
    }

    // 8) Webhook n8n — campos legacy + extras nuevos opcionales (aditivos, no rompen flows existentes)
    const webhookResult = await sendReviewEmail({
        clientId: client.id,
        coachId: validatedCoachId,
        clientEmail: client.email,
        clientName: client.full_name ?? '',
        checkinId,
        formTemplateId: formTemplateId ?? undefined,
        formUrl,
        reviewTemplateId: chosenSchedule?.review_template_id,
        reviewTemplateName: chosenSchedule?.review_template?.name,
        reviewType: chosenSchedule?.review_template?.review_type,
    })

    if (!webhookResult.ok) {
        console.warn('[sendReviewAction] n8n webhook failed (non-blocking):', webhookResult.error)
    }

    try {
        await sendReviewCreatedNotification(
            client.id,
            checkinId,
            chosenSchedule?.review_template?.name,
        )
    } catch (notificationError) {
        console.warn('[sendReviewAction] review notification failed (non-blocking):', notificationError)
    }

    // No actualizamos client.next_checkin_date (legacy fallback) — solo schedule.next_due_date.

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')

    return {
        success: true,
        checkin_id: checkinId,
        form_url: formUrl,
    }
}
