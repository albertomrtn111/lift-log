'use server'

import { createNewClient, setClientStatus, updateClientDetails, UpdateClientInput } from '@/data/members'
import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendInviteEmail } from '@/lib/n8n'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
    const result = await updateClientDetails(clientId, data)

    if (result.success) {
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
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
}) {
    // Validate coach_id against membership
    let coachId: string
    try {
        ({ coachId } = await requireActiveCoachId(data.coach_id))
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
                        authWarning: 'Ya existe un usuario con ese email en Auth. El cliente se creó pero sin contraseña nueva. El usuario puede iniciar sesión con su contraseña existente o usar "Recuperar contraseña".',
                    }
                }

                return {
                    success: true,
                    client,
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
                    authWarning: `Usuario Auth creado pero no se pudo vincular: ${updateError.message}`,
                }
            }

            console.log(`[createClientAction] auth_user_id linked successfully`)

            // 4. Send invite webhook with temp password (non-blocking)
            sendInviteEmail({
                clientId: client.id,
                coachId,
                clientEmail: client.email,
                clientName: client.full_name ?? '',
                tempPassword: data.password,
            }).catch((err) => {
                console.warn('[createClientAction] n8n invite webhook failed (non-blocking):', err)
            })
        } catch (err: any) {
            console.error(`[createClientAction] Unexpected error in auth user creation:`, err)
            return {
                success: true,
                client,
                authWarning: `Cliente creado, pero error inesperado al crear usuario Auth: ${err.message}`,
            }
        }
    } else {
        // No password — fire n8n invite webhook without password (non-blocking)
        sendInviteEmail({
            clientId: client.id,
            coachId,
            clientEmail: client.email,
            clientName: client.full_name ?? '',
        }).catch((err) => {
            console.warn('[createClientAction] n8n invite webhook failed (non-blocking):', err)
        })
    }

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')
    return { success: true, client }
}
