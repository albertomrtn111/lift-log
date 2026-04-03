import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getActiveSupplements, createSupplement, updateSupplement, deleteSupplement, type SupplementInput } from '@/data/supplements'
import { useToast } from '@/hooks/use-toast'

export function useSupplements(coachId: string, clientId: string) {
    return useQuery({
        queryKey: ['supplements', coachId, clientId],
        queryFn: () => getActiveSupplements(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

export function useCreateSupplement(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    return useMutation({
        mutationFn: (input: SupplementInput) => createSupplement(coachId, clientId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements', coachId, clientId] })
            toast({ title: 'Suplemento añadido correctamente' })
        },
        onError: (err: any) => {
            toast({ title: 'Error al añadir suplemento', description: err.message, variant: 'destructive' })
        },
    })
}

export function useUpdateSupplement(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<SupplementInput> }) =>
            updateSupplement(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements', coachId, clientId] })
            toast({ title: 'Suplemento actualizado' })
        },
        onError: (err: any) => {
            toast({ title: 'Error al actualizar', description: err.message, variant: 'destructive' })
        },
    })
}

export function useDeleteSupplement(coachId: string, clientId: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    return useMutation({
        mutationFn: (id: string) => deleteSupplement(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements', coachId, clientId] })
            toast({ title: 'Suplemento eliminado' })
        },
        onError: (err: any) => {
            toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' })
        },
    })
}
