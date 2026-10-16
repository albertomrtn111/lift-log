'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayInTimezone } from '@/lib/reviews/scheduler'
import { addDays } from '@/lib/onboarding/sample-athlete-data.js'
import { ensureInviteTemplates, type InviteTemplateOptions } from '@/lib/onboarding/default-templates'
import { sendAthleteInvite } from '@/lib/onboarding/athlete-invite'
import { createClientAction } from './actions'

export async function getInviteTemplateOptionsAction(coachId: string): Promise<
    { success: true; options: InviteTemplateOptions } | { success: false; error: string }
> {
    try {
        const { coachId: validatedCoachId } = await requireActiveCoachId(coachId)
        return { success: true, options: await ensureInviteTemplates(validatedCoachId) }
    } catch (error) {
        console.error('[getInviteTemplateOptionsAction]', error)
        return { success: false, error: 'No se pudieron cargar tus formularios.' }
    }
}

export interface InviteAthleteInput {
    coachId: string
    fullName: string
    email: string
    onboardingTemplateId: string | null
    reviewTemplateId: string | null
    reviewFrequencyDays: number
    phone?: string
    startDate?: string
    paymentAmount?: number
    paymentDay?: number
    password?: string
}

/**
 * "Enviar invitación": da de alta al atleta, le asigna lo que recibirá
 * (onboarding y revisión periódica) y le manda el email de acceso.
 */
export async function inviteAthleteAction(input: InviteAthleteInput): Promise<{
    success: boolean
    clientId?: string
    error?: string
    warnings?: string[]
}> {
    let coachId: string
    let userId: string
    try {
        ({ coachId, userId } = await requireActiveCoachId(input.coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    const fullName = input.fullName.trim()
    const email = input.email.trim().toLowerCase()
    if (!fullName) return { success: false, error: 'Escribe el nombre del atleta.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'El email no es válido.' }
    if (!Number.isInteger(input.reviewFrequencyDays) || input.reviewFrequencyDays < 1 || input.reviewFrequencyDays > 365) {
        return { success: false, error: 'La frecuencia de la revisión debe estar entre 1 y 365 días.' }
    }

    const admin = createAdminClient()
    if (input.reviewTemplateId) {
        const { data: template } = await admin
            .from('review_templates')
            .select('id')
            .eq('id', input.reviewTemplateId)
            .eq('coach_id', coachId)
            .maybeSingle()
        if (!template) return { success: false, error: 'La revisión elegida no existe.' }
    }

    const startDate = input.startDate || todayInTimezone()
    const created = await createClientAction({
        coach_id: coachId,
        full_name: fullName,
        email,
        phone: input.phone?.trim() || undefined,
        start_date: startDate,
        checkin_frequency_days: input.reviewFrequencyDays,
        password: input.password || undefined,
        payment_amount: input.paymentAmount,
        payment_day: input.paymentDay,
        onboarding_template_id: input.onboardingTemplateId ?? undefined,
    })

    if (!created.success || !created.client) {
        return { success: false, error: [created.error, created.details].filter(Boolean).join(' · ') || 'No se pudo crear el atleta.' }
    }

    const clientId = created.client.id as string
    const warnings = [created.billingWarning, created.authWarning].filter((value): value is string => Boolean(value))

    // Revisión periódica (la primera, al cumplirse la frecuencia desde el inicio)
    if (input.reviewTemplateId) {
        const { error } = await admin.from('client_review_schedules').upsert({
            coach_id: coachId,
            client_id: clientId,
            review_template_id: input.reviewTemplateId,
            frequency_days: input.reviewFrequencyDays,
            next_due_date: addDays(startDate, input.reviewFrequencyDays),
            is_active: true,
        }, { onConflict: 'client_id,review_template_id' })
        if (error) {
            console.error('[inviteAthleteAction] schedule:', error)
            warnings.push('No se pudo programar la revisión; asígnala desde su ficha.')
        }
    }

    // Formulario de onboarding: queda pendiente y el atleta lo rellena dentro de la app
    if (input.onboardingTemplateId) {
        await admin
            .from('checkins')
            .update({ status: 'archived' })
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .eq('type', 'onboarding')
            .eq('status', 'pending')
        const { error } = await admin.from('checkins').insert({
            coach_id: coachId,
            client_id: clientId,
            type: 'onboarding',
            status: 'pending',
            form_template_id: input.onboardingTemplateId,
            source: 'coach_portal',
            raw_payload: {},
        })
        if (error) {
            console.error('[inviteAthleteAction] onboarding:', error)
            warnings.push('No se pudo preparar el formulario de onboarding; envíalo desde su ficha.')
        }
    }

    // Con contraseña inicial el email ya salió al crear la cuenta
    if (!input.password) {
        const sent = await sendAthleteInvite({ coachId, coachUserId: userId, clientId })
        if (!sent.ok) warnings.push(`El atleta se ha creado, pero la invitación no se pudo enviar: ${sent.error}`)
    }

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')
    revalidatePath('/coach/dashboard')
    return { success: true, clientId, warnings }
}
