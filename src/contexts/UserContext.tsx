'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UserRole } from '@/types/coach'

export interface UserProfile {
    full_name: string | null
    email: string | null
    avatar_url: string | null
}

export interface UserContextData {
    userId: string
    isCoach: boolean
    isClient: boolean
    role: UserRole
    coachId: string | null
    clientId: string | null
    clientCoachId: string | null
    profile: UserProfile | null
    clientRecord: {
        id: string
        full_name: string | null
        coach_id: string
        status: string
    } | null
}

interface UserContextValue {
    user: UserContextData | null
    isLoading: boolean
    error: Error | null
}

const UserContext = createContext<UserContextValue>({
    user: null,
    isLoading: true,
    error: null,
})

async function fetchUserContext(): Promise<UserContextData> {
    const res = await fetch('/api/me')
    if (!res.ok) {
        throw new Error('Failed to fetch user context')
    }
    return res.json()
}

interface UserProviderProps {
    children: ReactNode
    initialData?: UserContextData
}

export function UserProvider({ children, initialData }: UserProviderProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['user-context'],
        queryFn: fetchUserContext,
        initialData,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false, // Don't refetch if we have data
        retry: 1,
    })

    return (
        <UserContext.Provider value={{ user: data ?? null, isLoading, error: error as Error | null }}>
            {children}
        </UserContext.Provider>
    )
}

export function useUserContext() {
    const context = useContext(UserContext)
    if (context === undefined) {
        throw new Error('useUserContext must be used within a UserProvider')
    }
    return context
}
