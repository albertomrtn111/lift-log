'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import {
    getActiveDietPlanOptions,
    listDietPlansOptions,
    getDietPlanStructure,
    createDietPlanOptions,
    updateDietPlanOptions,
    duplicateDietPlanOptions,
    archiveDietPlan,
    setDietPlanStatus,
    activateDietPlan,
    deleteDietPlan,
} from '@/data/nutrition/dietOptions'
import type {
    DietPlan,
    DietPlanInput,
    DietPlanStatus,
    DietPlanWithStructure,
} from '@/data/nutrition/types'
import { formatSupabaseError, logSupabaseError, formatSupabaseErrorVerbose, isRlsError } from '@/lib/supabase/helpers'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const dietPlanKeys = {
    all: ['dietPlan'] as const,
    active: (clientId: string) => ['dietPlanActive', clientId] as const,
    list: (clientId: string) => ['dietPlans', clientId] as const,
    structure: (planId: string) => ['dietPlanStructure', planId] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

export function useActiveDietPlan(coachId: string, clientId: string) {
    return useQuery({
        queryKey: dietPlanKeys.active(clientId),
        queryFn: () => getActiveDietPlanOptions(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

export function useDietPlans(coachId: string, clientId: string) {
    return useQuery({
        queryKey: dietPlanKeys.list(clientId),
        queryFn: () => listDietPlansOptions(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

export function useDietPlanStructure(planId: string | null) {
    return useQuery({
        queryKey: dietPlanKeys.structure(planId || ''),
        queryFn: () => (planId ? getDietPlanStructure(planId) : null),
        enabled: !!planId,
    })
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useCreateDietPlan(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: async (input: Omit<DietPlanInput, 'coach_id' | 'client_id'>) => {
            // Validate required fields
            if (!coachId) throw new Error('coach_id es requerido')
            if (!clientId) throw new Error('client_id es requerido')
            if (!input.name) throw new Error('name es requerido')
            if (!input.effective_from) throw new Error('effective_from es requerido')

            const payload = {
                ...input,
                coach_id: coachId,
                client_id: clientId,
            }

            console.log('[useCreateDietPlan] Payload:', {
                name: payload.name,
                type: payload.type,
                status: payload.status,
                coach_id: payload.coach_id,
                client_id: payload.client_id,
                effective_from: payload.effective_from,
                meals_count: payload.meals?.length || 0,
            })

            return createDietPlanOptions(payload)
        },
        onSuccess: async (data) => {
            console.log('[useCreateDietPlan] Success:', data)
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })
            toast({
                title: 'Guardado',
                description: 'La dieta se ha creado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useCreateDietPlan', error, { coachId, clientId })
            toast({
                title: 'Error al crear dieta',
                description: formatSupabaseError(error),
                variant: 'destructive',
            })
        },
    })
}

export function useUpdateDietPlan(clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: ({
            planId,
            input,
        }: {
            planId: string
            input: Omit<DietPlanInput, 'coach_id' | 'client_id'>
        }) => updateDietPlanOptions(planId, input),
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            queryClient.invalidateQueries({
                queryKey: dietPlanKeys.structure(variables.planId),
            })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.structure(variables.planId) })

            toast({
                title: 'Guardado',
                description: 'La dieta se ha actualizado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useUpdateDietPlan', error, {})
            const verbose = (
                process.env.NODE_ENV !== 'production'
                    ? formatSupabaseErrorVerbose(error, { table: 'diet_plans/meals/options/items', operation: 'UPDATE/DELETE/INSERT' })
                    : formatSupabaseError(error)
            )
            const isRls = isRlsError(error)
            toast({
                title: isRls ? 'RLS: Bloqueado por permisos' : 'Error al actualizar dieta',
                description: verbose,
                variant: 'destructive',
            })
        },
    })
}

export function useDuplicateDietPlan(clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: ({
            planId,
            overrides,
        }: {
            planId: string
            overrides?: Partial<{
                name: string
                effective_from: string
                effective_to: string | null
                status: DietPlanStatus
            }>
        }) => duplicateDietPlanOptions(planId, overrides),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })
            toast({
                title: 'Duplicado',
                description: 'La dieta se ha duplicado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useDuplicateDietPlan', error, {})
            const verbose = process.env.NODE_ENV !== 'production'
                ? formatSupabaseErrorVerbose(error, { table: 'diet_plans', operation: 'duplicate' })
                : formatSupabaseError(error)
            toast({
                title: isRlsError(error) ? 'RLS: Bloqueado por permisos' : 'Error al duplicar dieta',
                description: verbose,
                variant: 'destructive',
            })
        },
    })
}

export function useArchiveDietPlan(clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: (planId: string) => archiveDietPlan(planId),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })

            toast({
                title: 'Archivado',
                description: 'La dieta se ha archivado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useArchiveDietPlan', error, {})
            const verbose = process.env.NODE_ENV !== 'production'
                ? formatSupabaseErrorVerbose(error, { table: 'diet_plans', operation: 'archive' })
                : formatSupabaseError(error)
            toast({
                title: isRlsError(error) ? 'RLS: Bloqueado por permisos' : 'Error al archivar dieta',
                description: verbose,
                variant: 'destructive',
            })
        },
    })
}

export function useSetDietPlanStatus(clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: ({ planId, status }: { planId: string; status: DietPlanStatus }) =>
            setDietPlanStatus(planId, status),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })

            toast({
                title: 'Actualizado',
                description: 'El estado de la dieta se ha actualizado.',
            })
        },
        onError: (error) => {
            console.error('Error updating diet plan status:', error)
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado de la dieta.',
                variant: 'destructive',
            })
        },
    })
}

export function useActivateDietPlan(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: (planId: string) => activateDietPlan(planId, coachId, clientId),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })

            toast({
                title: 'Plan activado',
                description: 'El plan se ha marcado como activo y los anteriores se han archivado.',
            })
        },
        onError: (error) => {
            logSupabaseError('useActivateDietPlan', error, { coachId, clientId })
            toast({
                title: 'Error al activar plan',
                description: formatSupabaseError(error),
                variant: 'destructive',
            })
        },
    })
}

export function useDeleteDietPlan(clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    return useMutation({
        mutationFn: (planId: string) => deleteDietPlan(planId),
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.active(clientId) })
            queryClient.invalidateQueries({ queryKey: dietPlanKeys.list(clientId) })
            // Force immediate refetch
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.active(clientId) })
            await queryClient.refetchQueries({ queryKey: dietPlanKeys.list(clientId) })

            toast({
                title: 'Eliminado',
                description: 'La dieta se ha eliminado correctamente.',
            })
        },
        onError: (error) => {
            logSupabaseError('useDeleteDietPlan', error, {})
            const verbose = process.env.NODE_ENV !== 'production'
                ? formatSupabaseErrorVerbose(error, { table: 'diet_plans', operation: 'delete' })
                : formatSupabaseError(error)
            toast({
                title: isRlsError(error) ? 'RLS: Bloqueado por permisos' : 'Error al eliminar dieta',
                description: verbose,
                variant: 'destructive',
            })
        },
    })
}
