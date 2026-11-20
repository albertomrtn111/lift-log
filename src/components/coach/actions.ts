'use server'

import { createNewClient, setClientStatus, updateClientDetails, UpdateClientInput } from '@/data/members'
import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendAthleteInvite } from '@/lib/onboarding/athlete-invite'
import { adoptUnconfirmedAccount } from '@/lib/onboarding/auth-account'
import { isAlreadyRegisteredMessage } from '@/lib/onboarding/account-access-rules.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncClientTemplateAssignment } from '@/data/form-templates'
import { athleteSeatMessage } from '@/lib/subscription/plan-limits'
import { getAthleteUsage } from '@/lib/subscription/plan-usage'
import {
    getCoachBillingSettings,
    settleBillingBeforeReactivation,
    syncClientCurrentMonth,
    todayKeyIn,
    waiveCurrentMonthOnDeactivation,
} from '@/data/billing'

export async function deactivateClientAction(clientId: string) {
    let coachId: string
    try {
        ; ({ coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: 'No autorizado: ' + e.message }
    }

    const today = todayKeyIn((await getCoachBillingSettings(coachId)).timeZone)
    const result = await setClientStatus(clientId, 'inactive', today)
    if (!result.success) return result

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')

    const billing = await waiveCurrentMonthOnDeactivation(coachId, clientId, today)
    if (!billing.success) {
        return { success: false, error: 'Se dio de baja, pero no se pudo actualizar el cobro de este mes.' }
    }
    return result
}

export async function reactivateClientAction(clientId: string) {
    let coachId: string
    try {
        ; ({ coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: 'No autorizado: ' + e.message }
    }

    // El límite de atletas del plan se mira antes de tocar Facturación (la base lo vuelve a aplicar)
    const seatMessage = athleteSeatMessage(await getAthleteUsage(coachId), 'reactivate')
    if (seatMessage) return { success: false, error: seatMessage }

    // Antes de cambiar el estado: necesita la fecha de baja para cerrar esos meses
    const today = todayKeyIn((await getCoachBillingSettings(coachId)).timeZone)
    const settled = await settleBillingBeforeReactivation(coachId, clientId, today)
    if (!settled.success) {
        return { success: false, error: 'No se pudo reactivar: fallo al registrar los meses de baja en Facturación.' }
    }

    const result = await setClientStatus(clientId, 'active')
    if (!result.success) return result

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')

    const billing = await syncClientCurrentMonth(coachId, clientId)
    if (!billing.success) {
        return { success: false, error: 'Se reactivó, pero no se pudo actualizar el cobro de este mes.' }
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
        // Solo el mes en curso: los meses anteriores los decide el coach en Facturación
        const billing = await syncClientCurrentMonth(coachId, clientId)
        if (!billing.success) {
            return { success: false, error: 'Los datos se guardaron, pero no se pudo actualizar el cobro de este mes.' }
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
    let coachId: string, supabase, userId: string
    try {
        ({ coachId, supabase, userId } = await requireActiveCoachId(data.coach_id))
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
    const billing = await syncClientCurrentMonth(coachId, client.id)
    if (!billing.success) {
        console.error('[createClientAction] Error creating current payment record:', billing.error)
        billingWarning = 'La cuota se guardó, pero no se pudo crear el cobro de este mes.'
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

            let authUserId: string | null = authData?.user?.id ?? null
            if (authError) {
                console.error(`[createClientAction] Auth createUser error:`, authError.message)

                if (!isAlreadyRegisteredMessage(authError.message)) {
                    return {
                        success: true,
                        client,
                        billingWarning,
                        authWarning: `Cliente creado, pero error al crear usuario Auth: ${authError.message}`,
                    }
                }

                // El email ya tiene cuenta. Si está sin confirmar se queda con esta
                // contraseña y confirmada, como si se creara ahora; si no, no se toca.
                authUserId = await adoptUnconfirmedAccount(admin, client.email, data.password, client.full_name)
                if (!authUserId) {
                    return {
                        success: true,
                        client,
                        billingWarning,
                        authWarning: 'Ya existe un usuario con ese email en Auth. El cliente se creó pero sin contraseña nueva. El usuario puede iniciar sesión con su contraseña existente o usar "Recuperar contraseña".',
                    }
                }
            }
            if (!authUserId) {
                return { success: true, client, billingWarning, authWarning: 'Cliente creado, pero Auth no devolvió el usuario.' }
            }
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

            // 4. Email de invitación con la contraseña temporal (non-blocking)
            sendAthleteInvite({ coachId, coachUserId: userId, clientId: client.id, tempPassword: data.password })
                .then(result => { if (!result.ok) console.warn('[createClientAction] invite email failed (non-blocking):', result.error) })
                .catch((err) => {
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
    }
    // Sin contraseña, la invitación la envía quien llama (sendInviteAction) si el coach lo pide

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')
    revalidatePath('/coach/forms')
    return { success: true, client, billingWarning }
}
