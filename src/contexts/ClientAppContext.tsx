'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UserRole } from '@/types/coach'

/**
 * Contexto específico para la experiencia de Cliente.
 * No incluye datos de coach/membership para evitar dependencias cruzadas.
 */

export interface ClientProfile {
    full_name: string | null
    email: string | null
    avatar_url: string | null
}

export interface ClientRecord {
    id: string
    full_name: string | null
    coach_id: string
    status: string
}

export interface ClientAppContextData {
    userId: string
    profile: ClientProfile
    clientRecord: ClientRecord | null
    clientId: string | null
    coachId: string | null // El coach asignado al cliente
    role: UserRole
    isClient: boolean
}

interface ClientAppContextValue {
    client: ClientAppContextData | null
    isLoading: boolean
    error: Error | null
}

const ClientAppContext = createContext<ClientAppContextValue>({
    client: null,
    isLoading: true,
    error: null,
})

async function fetchClientContext(): Promise<ClientAppContextData> {
    const res = await fetch('/api/me')
    if (!res.ok) {
        throw new Error('Failed to fetch client context')
    }
    const data = await res.json()

    // Mapear a datos específicos de cliente
    return {
        userId: data.userId,
        profile: data.profile || { full_name: null, email: null, avatar_url: null },
        clientRecord: data.clientRecord,
        clientId: data.clientId,
        coachId: data.clientCoachId, // El coach asignado al cliente
        role: data.role,
        isClient: data.isClient,
    }
}

interface ClientAppProviderProps {
    children: ReactNode
}

export function ClientAppProvider({ children }: ClientAppProviderProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['client-context'],
        queryFn: fetchClientContext,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
    })

    return (
        <ClientAppContext.Provider value={{
            client: data ?? null,
            isLoading,
            error: error as Error | null,
        }}>
            {children}
        </ClientAppContext.Provider>
    )
}

export function useClientAppContext() {
    const context = useContext(ClientAppContext)
    if (context === undefined) {
        throw new Error('useClientAppContext must be used within a ClientAppProvider')
    }
    return context
}

/**
 * Hook de conveniencia para obtener el clientId directamente.
 * Lanza error si no hay cliente autenticado.
 */
export function useClientId(): string {
    const { client } = useClientAppContext()
    if (!client?.clientId) {
        throw new Error('No client ID available. User may not be a client.')
    }
    return client.clientId
}
