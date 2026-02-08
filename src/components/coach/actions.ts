'use server'

import { createNewClient, setClientStatus, updateClientDetails, UpdateClientInput } from '@/data/members'
import { revalidatePath } from 'next/cache'

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
}) {
    if (!data.coach_id) {
        return {
            success: false,
            error: 'No autorizado: coach_id no encontrado',
            details: 'El usuario no tiene permisos de coach'
        }
    }

    if (!data.full_name || !data.email || !data.start_date) {
        return {
            success: false,
            error: 'Faltan campos obligatorios',
            details: 'full_name, email y start_date son requeridos'
        }
    }

    const result = await createNewClient(data)

    if (result.success && result.client) {
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        return { success: true, client: result.client }
    }

    return {
        success: false,
        error: result.error || 'Error al crear el cliente',
        details: result.details
    }
}
