'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UserRole } from '@/types/coach'

/**
 * Contexto específico para la experiencia de Coach.
 * No incluye datos de cliente para evitar dependencias cruzadas.
 */

export interface CoachProfile {
    full_name: string | null
    email: string | null
    avatar_url: string | null
}

export interface CoachMembership {
    coach_id: string
    role: 'owner' | 'coach'
}

export interface CoachContextData {
    userId: string
    profile: CoachProfile
    membership: CoachMembership | null
    coachId: string | null
    role: UserRole
    isCoach: boolean
}

interface CoachContextValue {
    coach: CoachContextData | null
    isLoading: boolean
    error: Error | null
    selectedClientId: string | null
    setSelectedClientId: (id: string | null) => void
}

const CoachContext = createContext<CoachContextValue>({
    coach: null,
    isLoading: true,
    error: null,
    selectedClientId: null,
    setSelectedClientId: () => { },
})

async function fetchCoachContext(): Promise<CoachContextData> {
    const res = await fetch('/api/me')
    if (!res.ok) {
        throw new Error('Failed to fetch coach context')
    }
    const data = await res.json()

    // Mapear a datos específicos de coach
    return {
        userId: data.userId,
        profile: data.profile || { full_name: null, email: null, avatar_url: null },
        membership: data.coachId ? { coach_id: data.coachId, role: 'coach' } : null,
        coachId: data.coachId,
        role: data.role,
        isCoach: data.isCoach,
    }
}

interface CoachProviderProps {
    children: ReactNode
}

export function CoachProvider({ children }: CoachProviderProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['coach-context'],
        queryFn: fetchCoachContext,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
    })

    // Estado local para el cliente seleccionado (persiste en URL normalmente)
    const selectedClientId = null // Se puede manejar con useSearchParams si es necesario
    const setSelectedClientId = () => { }

    return (
        <CoachContext.Provider value={{
            coach: data ?? null,
            isLoading,
            error: error as Error | null,
            selectedClientId,
            setSelectedClientId,
        }}>
            {children}
        </CoachContext.Provider>
    )
}

export function useCoachContext() {
    const context = useContext(CoachContext)
    if (context === undefined) {
        throw new Error('useCoachContext must be used within a CoachProvider')
    }
    return context
}

/**
 * Hook de conveniencia para obtener el coachId directamente.
 * Lanza error si no hay coach autenticado.
 */
export function useCoachId(): string {
    const { coach } = useCoachContext()
    if (!coach?.coachId) {
        throw new Error('No coach ID available. User may not be a coach.')
    }
    return coach.coachId
}
