'use server'

import { createNewClient, setClientStatus, updateClientDetails, UpdateClientInput } from '@/data/members'
import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendInviteEmailSmtp } from '@/lib/email/mailer'
import { getAppUrl } from '@/lib/app-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncClientTemplateAssignment } from '@/data/form-templates'
import { getBillingPeriodFromDate } from '@/lib/billing-period'

export async function deactivateClientAction(clientId: string) {
    const result = await setClientStatus(clientId, 'inactive')

    if (result.success) {
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
    }

    return result
}

export async function reactivateClientAction(clientId: string) {
    const result = await setClientStatus(clientId, 'active')

    if (result.success) {
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
    }

    return result
}

export async function updateClientAction(clientId: string, data: UpdateClientInput) {
    let supabase, coachId: string
    try {
        ; ({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return {
            success: false,
            error: 'No autorizado: ' + e.message,
        }
    }

    const { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .single()

    if (clientError || !clientRow) {
        return { success: false, error: 'Cliente no encontrado o sin permisos' }
    }

    const { checkin_template_id, onboarding_template_id, ...clientUpdates } = data
    const result = await updateClientDetails(clientId, clientUpdates)

    if (result.success) {
        if (result.client && Number(result.client.payment_amount ?? 0) > 0) {
            try {
                const period = getBillingPeriodFromDate(result.client.start_date)
                const { error: billingError } = await supabase
                    .from('payment_records')
                    .upsert({
                        coach_id: coachId,
                        client_id: clientId,
                        year: period.year,
                        month: period.month,
                        amount: result.client.payment_amount,
                        status: 'pending',
                    }, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })

                if (billingError) {
                    return { success: false, error: 'Los datos se guardaron, pero no se pudo crear el primer periodo en Pagos.' }
                }
                revalidatePath('/coach/billing')
            } catch {
                return { success: false, error: 'Los datos se guardaron, pero la fecha de alta no permite crear el primer periodo en Pagos.' }
            }
        }

        // Solo sincronizar la asignación si la clave está explícitamente en el payload.
        // (undefined = "no tocar", null = "desasignar", string = "asignar a este template")
        if ('checkin_template_id' in data) {
            const checkinAssignment = await syncClientTemplateAssignment({
                supabase,
                coachId,
                clientId,
                type: 'checkin',
                templateId: checkin_template_id ?? null,
            })

            if (!checkinAssignment.success) {
                return { success: false, error: checkinAssignment.error }
            }
        }

        if ('onboarding_template_id' in data) {
            const onboardingAssignment = await syncClientTemplateAssignment({
                supabase,
                coachId,
                clientId,
                type: 'onboarding',
                templateId: onboarding_template_id ?? null,
            })

            if (!onboardingAssignment.success) {
                return { success: false, error: onboardingAssignment.error }
            }
        }

        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        revalidatePath('/coach/forms')
    }

    return result
}

export async function createClientAction(data: {
    coach_id: string
    full_name: string
    email: string
    phone?: string
    start_date: string
    checkin_frequency_days: number
    password?: string
    payment_amount?: number
    payment_day?: number
    payment_notes?: string
    checkin_template_id?: string
    onboarding_template_id?: string
}) {
    // Validate coach_id against membership
    let coachId: string, supabase
    try {
        ({ coachId, supabase } = await requireActiveCoachId(data.coach_id))
    } catch (e: any) {
        return {
            success: false,
            error: 'No autorizado: ' + e.message,
            details: 'El usuario no tiene permisos de coach para este workspace'
        }
    }

    if (!data.full_name || !data.email || !data.start_date) {
        return {
            success: false,
            error: 'Faltan campos obligatorios',
            details: 'full_name, email y start_date son requeridos'
        }
    }

    // Validate password if provided
    if (data.password && data.password.length < 8) {
        return {
            success: false,
            error: 'La contraseña debe tener al menos 8 caracteres',
        }
    }

    if (data.payment_amount !== undefined && (!Number.isFinite(data.payment_amount) || data.payment_amount < 0)) {
        return { success: false, error: 'La cuota mensual no es válida.' }
    }
    if (data.payment_day !== undefined && (!Number.isInteger(data.payment_day) || data.payment_day < 1 || data.payment_day > 31)) {
        return { success: false, error: 'El día de cobro debe estar entre 1 y 31.' }
    }
    if (data.payment_notes && data.payment_notes.length > 500) {
        return { success: false, error: 'Las notas de pago son demasiado largas.' }
    }

    // 1. Create client record in public.clients via RPC
    const result = await createNewClient({ ...data, coach_id: coachId })

    if (!result.success || !result.client) {
        return {
            success: false,
            error: result.error || 'Error al crear el cliente',
            details: result.details
        }
    }

    const client = result.client
    console.log(`[createClientAction] Client created: ${client.id} (${client.email})`)

    let billingWarning: string | undefined
    if (Number(client.payment_amount ?? 0) > 0) {
        try {
            const period = getBillingPeriodFromDate(client.start_date || data.start_date)
            const { error: billingError } = await supabase
                .from('payment_records')
                .upsert({
                    coach_id: coachId,
                    client_id: client.id,
                    year: period.year,
                    month: period.month,
                    amount: client.payment_amount,
                    status: 'pending',
                }, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })

            if (billingError) {
                console.error('[createClientAction] Error creating initial payment record:', billingError.message)
                billingWarning = 'La cuota se guardó, pero no se pudo crear el primer periodo en Pagos.'
            } else {
                revalidatePath('/coach/billing')
            }
        } catch (error) {
            console.error('[createClientAction] Invalid billing start period:', error)
            billingWarning = 'La cuota se guardó, pero la fecha de alta no permitió crear el primer periodo en Pagos.'
        }
    }

    const checkinAssignment = await syncClientTemplateAssignment({
        supabase,
        coachId,
        clientId: client.id,
        type: 'checkin',
        templateId: data.checkin_template_id ?? null,
    })

    if (!checkinAssignment.success) {
        return {
            success: false,
            error: checkinAssignment.error || 'No se pudo asignar la revisión al cliente',
        }
    }

    const onboardingAssignment = await syncClientTemplateAssignment({
        supabase,
        coachId,
        clientId: client.id,
        type: 'onboarding',
        templateId: data.onboarding_template_id ?? null,
    })

    if (!onboardingAssignment.success) {
        return {
            success: false,
            error: onboardingAssignment.error || 'No se pudo asignar el onboarding al cliente',
        }
    }

    // 2. If password provided, create Supabase Auth user with SERVICE ROLE
    if (data.password) {
        try {
            const admin = createAdminClient()

            console.log(`[createClientAction] Creating auth user for ${client.email}...`)
            const { data: authData, error: authError } = await admin.auth.admin.createUser({
                email: client.email,
                password: data.password,
                email_confirm: true, // Skip email verification
                user_metadata: {
                    full_name: client.full_name,
                },
            })

            if (authError) {
                console.error(`[createClientAction] Auth createUser error:`, authError.message)

                // Check for "already registered" error
                if (
                    authError.message.toLowerCase().includes('already') ||
                    authError.message.toLowerCase().includes('exists') ||
                    authError.message.toLowerCase().includes('registered')
                ) {
                    return {
                        success: true,
                        client,
                        billingWarning,
                        authWarning: 'Ya existe un usuario con ese email en Auth. El cliente se creó pero sin contraseña nueva. El usuario puede iniciar sesión con su contraseña existente o usar "Recuperar contraseña".',
                    }
                }

                return {
                    success: true,
                    client,
                    billingWarning,
                    authWarning: `Cliente creado, pero error al crear usuario Auth: ${authError.message}`,
                }
            }

            const authUserId = authData.user.id
            console.log(`[createClientAction] Auth user created: ${authUserId}`)

            // 3. Link auth_user_id to public.clients
            const supabase = await createClient()
            const { error: updateError } = await supabase
                .from('clients')
                .update({
                    auth_user_id: authUserId,
                    signed_up_at: new Date().toISOString(),
                    invite_status: 'accepted',
                    onboarding_updated_at: new Date().toISOString(),
                })
                .eq('id', client.id)

            if (updateError) {
                console.error(`[createClientAction] Error linking auth_user_id:`, updateError.message)
                return {
                    success: true,
                    client,
                    billingWarning,
                    authWarning: `Usuario Auth creado pero no se pudo vincular: ${updateError.message}`,
                }
            }

            console.log(`[createClientAction] auth_user_id linked successfully`)

            // 4. Send invite email with temp password (non-blocking)
            sendInviteEmailSmtp({
                to: client.email,
                clientName: client.full_name ?? undefined,
                tempPassword: data.password,
                appUrl: getAppUrl(),
                coachId,
            }).catch((err) => {
                console.warn('[createClientAction] invite email failed (non-blocking):', err)
            })
        } catch (err: any) {
            console.error(`[createClientAction] Unexpected error in auth user creation:`, err)
            return {
                success: true,
                client,
                billingWarning,
                authWarning: `Cliente creado, pero error inesperado al crear usuario Auth: ${err.message}`,
            }
        }
    } else {
        // No password — send invite email without password (non-blocking)
        sendInviteEmailSmtp({
            to: client.email,
            clientName: client.full_name ?? undefined,
            appUrl: getAppUrl(),
            coachId,
        }).catch((err) => {
            console.warn('[createClientAction] invite email failed (non-blocking):', err)
        })
    }

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')
    revalidatePath('/coach/forms')
    return { success: true, client, billingWarning }
}
