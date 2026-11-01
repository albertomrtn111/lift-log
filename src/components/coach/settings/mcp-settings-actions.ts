'use server'

import { createClient } from '@/lib/supabase/server'

export interface McpConnection {
    clientId: string
    name: string
    uri: string | null
    logoUri: string | null
    grantedAt: string
}

interface ConnectionsResult {
    success: boolean
    connections?: McpConnection[]
    error?: string
}

// Los asistentes conectados son los clientes OAuth que el usuario ha autorizado en /oauth/consent.
// Supabase Auth los guarda como "grants" del propio usuario: no hace falta la clave administrativa.
export async function listMcpConnectionsAction(): Promise<ConnectionsResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const { data, error } = await supabase.auth.oauth.listGrants()
    if (error) {
        return { success: false, error: 'No se pudieron cargar los asistentes conectados' }
    }

    const connections = (data ?? [])
        .map((grant) => ({
            clientId: grant.client.id,
            name: grant.client.name?.trim() || 'Asistente sin nombre',
            uri: grant.client.uri || null,
            logoUri: grant.client.logo_uri || null,
            grantedAt: grant.granted_at,
        }))
        .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))

    return { success: true, connections }
}

export async function revokeMcpConnectionAction(clientId: string): Promise<{ success: boolean; error?: string }> {
    if (!clientId) return { success: false, error: 'Falta el asistente' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // Marca el consentimiento como revocado y cierra las sesiones y tokens de ese cliente
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
    if (error) return { success: false, error: 'No se pudo desconectar el asistente' }

    return { success: true }
}
