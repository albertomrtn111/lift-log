'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import {
    getActiveMacroPlan,
    listMacroPlans,
    upsertMacroPlan,
} from '@/data/nutrition/macros'
import type { MacroPlan, MacroPlanInput } from '@/data/nutrition/types'
import { formatSupabaseError, logSupabaseError } from '@/lib/supabase/helpers'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const macroPlanKeys = {
    all: ['macroPlan'] as const,
    active: (clientId: string) => ['macroPlanActive', clientId] as const,
    list: (clientId: string) => ['macroPlans', clientId] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

export function useActiveMacroPlan(coachId: string, clientId: string) {
    return useQuery({
        queryKey: macroPlanKeys.active(clientId),
        queryFn: () => getActiveMacroPlan(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

export function useMacroPlans(coachId: string, clientId: string) {
    return useQuery({
        queryKey: macroPlanKeys.list(clientId),
        queryFn: () => listMacroPlans(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useUpsertMacroPlan(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: async (input: Omit<MacroPlanInput, 'coach_id' | 'client_id'> & { id?: string }) => {
            // Validate required fields
            if (!coachId) throw new Error('coach_id es requerido')
            if (!clientId) throw new Error('client_id es requerido')
            if (!input.effective_from) throw new Error('effective_from es requerido')

            const payload = {
                ...input,
                coach_id: coachId,
                client_id: clientId,
            }

            console.log('[useUpsertMacroPlan] Payload:', {
                ...payload,
                action: input.id ? 'UPDATE' : 'INSERT',
            })

            return upsertMacroPlan(payload)
        },
        onSuccess: (data) => {
            console.log('[useUpsertMacroPlan] Success:', data)
            queryClient.invalidateQueries({ queryKey: macroPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: macroPlanKeys.list(clientId) })
            toast({
                title: 'Guardado',
                description: 'El plan de macros se ha guardado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useUpsertMacroPlan', error, { coachId, clientId })
            toast({
                title: 'Error al guardar plan de macros',
                description: formatSupabaseError(error),
                variant: 'destructive',
            })
        },
    })
}

