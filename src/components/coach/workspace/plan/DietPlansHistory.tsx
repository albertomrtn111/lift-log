'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Eye, Copy, AlertCircle, ChevronDown, ChevronUp, History, CheckCircle2, Trash2, Loader2, MoreHorizontal } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDietPlans, useDuplicateDietPlan, useActivateDietPlan, useDeleteDietPlan } from '@/hooks/useDietOptions'
import type { DietPlan, DietPlanStatus } from '@/data/nutrition/types'
import { DietPlanViewerModal } from './DietPlanViewerModal'

interface DietPlansHistoryProps {
    coachId: string
    clientId: string
    /** ID of the currently active plan to exclude from list (shown in main panel) */
    activePlanId?: string
    /** If true, only shows plans with status='archived' */
    onlyArchived?: boolean
    /** If true, hides the plan with `activePlanId` from the list. Default: false */
    hideActiveInHistory?: boolean
}

const STATUS_LABELS: Record<DietPlanStatus, string> = {
    active: 'Activo',
    draft: 'Borrador',
    archived: 'Archivado',
}

const STATUS_VARIANTS: Record<DietPlanStatus, 'default' | 'secondary' | 'outline'> = {
    active: 'default',
    draft: 'secondary',
    archived: 'outline',
}

export function DietPlansHistory({ coachId, clientId, activePlanId, onlyArchived, hideActiveInHistory = false }: DietPlansHistoryProps) {
    const { data: allPlans, isLoading, error, refetch } = useDietPlans(coachId, clientId)
    const duplicateMutation = useDuplicateDietPlan(clientId)
    const activateMutation = useActivateDietPlan(coachId, clientId)
    const deleteMutation = useDeleteDietPlan(clientId)

    const [viewingPlanId, setViewingPlanId] = useState<string | null>(null)
    const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)

    // Filter and sort plans
    const sortedPlans = (allPlans || [])
        .filter(p => {
            if (hideActiveInHistory && p.id === activePlanId) return false
            if (onlyArchived && p.status !== 'archived') return false
            return true
        })
        .sort((a, b) => {
            // Priority: Active (0) < Draft (1) < Archived (2)
            const statusPriority = { active: 0, draft: 1, archived: 2 }
            const priorityA = statusPriority[a.status] ?? 99
            const priorityB = statusPriority[b.status] ?? 99

            if (priorityA !== priorityB) return priorityA - priorityB

            // Then by effective_from desc
            const dateA = new Date(a.effective_from).getTime()
            const dateB = new Date(b.effective_from).getTime()
            if (dateB !== dateA) return dateB - dateA

            // Then by created_at desc
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

    const handleDuplicate = (plan: DietPlan) => {
        duplicateMutation.mutate({
            planId: plan.id,
            overrides: {
                name: `Copia de ${plan.name}`,
                status: 'draft',
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: null,
            },
        })
    }

    const handleDelete = async () => {
        if (!deletingPlanId) return
        await deleteMutation.mutateAsync(deletingPlanId)
        setDeletingPlanId(null)
    }

    if (isLoading) {
        return (
            <Card className="p-4">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-24 w-full" />
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="p-4">
                <div className="text-center text-destructive">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                    <p className="text-sm">Error al cargar historial</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        Reintentar
                    </Button>
                </div>
            </Card>
        )
    }

    if (sortedPlans.length === 0) {
        return null // Don't show history section if no plans
    }

    return (
        <>
            <Card className="rounded-2xl border-border/70 p-4">
                {/* Header with expand/collapse */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <h3 className="font-medium flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        Histórico de planes
                        <Badge variant="secondary" className="ml-2">
                            {sortedPlans.length}
                        </Badge>
                    </h3>
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>

                {/* Collapsible content */}
                {isExpanded && (
                    <div className="mt-4">
                        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                            {sortedPlans.map(plan => {
                                const statusLabel = plan.status === 'active' ? 'Activo' : plan.status === 'draft' ? 'Borrador' : 'Archivado'
                                const period = `${format(new Date(plan.effective_from), 'd MMM yy', { locale: es })} → ${plan.effective_to ? format(new Date(plan.effective_to), 'd MMM yy', { locale: es }) : 'sin fin'}`
                                return (
                                    <li key={plan.id} className="flex items-center gap-2 py-2.5 pl-3.5 pr-1.5">
                                        <button type="button" onClick={() => setViewingPlanId(plan.id)} className="min-w-0 flex-1 text-left">
                                            <span className="line-clamp-2 text-sm font-semibold leading-snug">{plan.name}</span>
                                            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                                <Badge variant={STATUS_VARIANTS[plan.status] || 'outline'} className="px-1.5 py-0 text-[10px]">{statusLabel}</Badge>
                                                <span>{period}</span>
                                            </span>
                                        </button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label={`Acciones de ${plan.name}`}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setViewingPlanId(plan.id)}>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Ver plan
                                                </DropdownMenuItem>
                                                {plan.status !== 'active' && (
                                                    <DropdownMenuItem onClick={() => activateMutation.mutate(plan.id)} disabled={activateMutation.isPending}>
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                        Marcar como activo
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => handleDuplicate(plan)} disabled={duplicateMutation.isPending}>
                                                    <Copy className="mr-2 h-4 w-4" />
                                                    Duplicar como nuevo
                                                </DropdownMenuItem>
                                                {plan.status === 'archived' && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setDeletingPlanId(plan.id)}
                                                            disabled={deleteMutation.isPending}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Eliminar
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </Card>

            {/* Read-only viewer modal */}
            <DietPlanViewerModal
                planId={viewingPlanId}
                open={!!viewingPlanId}
                onOpenChange={(open) => !open && setViewingPlanId(null)}
            />

            {/* Delete confirmation modal */}
            <AlertDialog open={!!deletingPlanId} onOpenChange={(open) => !open && setDeletingPlanId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente la dieta y todo su historial.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                'Eliminar'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
