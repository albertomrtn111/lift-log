'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { MetricDefinition, MetricCategory } from '@/types/metrics'
import { MetricFormModal } from './MetricFormModal'
import {
    createMetricDefinition,
    updateMetricDefinition,
    toggleMetricActive,
    deleteMetricDefinition,
    reorderMetricDefinitions,
} from '@/data/metric-definitions'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import { Button } from '@/components/ui/button'
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
import { useToast } from '@/hooks/use-toast'
import {
    Plus,
    MoreHorizontal,
    Pencil,
    Power,
    Trash2,
    BarChart2,
    ArrowUp,
    ArrowDown,
} from 'lucide-react'

// Configuramos los tabs
const TAB_CONFIG: { value: MetricCategory; label: string }[] = [
    { value: 'body', label: 'Cuerpo' },
    { value: 'performance', label: 'Rendimiento' },
    { value: 'general', label: 'General' },
]

export function MetricsPageClient({ initialMetrics }: { initialMetrics: MetricDefinition[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState<MetricCategory>('body')

    const [modalOpen, setModalOpen] = useState(false)
    const [editingMetric, setEditingMetric] = useState<MetricDefinition | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<MetricDefinition | null>(null)

    // Agrupamos métricas
    const filteredMetrics = initialMetrics.filter((m) => m.category === activeTab)

    const handleCreateClick = () => {
        setEditingMetric(null)
        setModalOpen(true)
    }

    const handleEditClick = (metric: MetricDefinition) => {
        setEditingMetric(metric)
        setModalOpen(true)
    }

    const handleSave = async (data: Partial<MetricDefinition>) => {
        if (editingMetric) {
            // Update
            const result = await updateMetricDefinition(editingMetric.id, data)
            if (result.success) {
                toast({ title: 'Métrica actualizada' })
                setModalOpen(false)
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        } else {
            // Create (los defaults Category y TypeValue vienen del data)
            const result = await createMetricDefinition(data as any)
            if (result.success) {
                toast({ title: 'Métrica creada' })
                setModalOpen(false)
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        }
    }

    const handleToggleActive = (metric: MetricDefinition) => {
        startTransition(async () => {
            const result = await toggleMetricActive(metric.id)
            if (result.success) {
                toast({ title: metric.is_active ? 'Métrica desactivada' : 'Métrica activada' })
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const confirmDelete = () => {
        if (!deleteTarget) return
        startTransition(async () => {
            const result = await deleteMetricDefinition(deleteTarget.id)
            if (result.success) {
                toast({ title: 'Métrica eliminada' })
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
            setDeleteTarget(null)
        })
    }

    // Funciones básicas para reordenar via array indices
    const handleMoveUp = (index: number) => {
        if (index <= 0) return
        startTransition(async () => {
            const newArray = [...filteredMetrics]
            const temp = newArray[index - 1]
            newArray[index - 1] = newArray[index]
            newArray[index] = temp

            const ids = newArray.map(m => m.id)
            await reorderMetricDefinitions(ids)
        })
    }

    const handleMoveDown = (index: number) => {
        if (index >= filteredMetrics.length - 1) return
        startTransition(async () => {
            const newArray = [...filteredMetrics]
            const temp = newArray[index + 1]
            newArray[index + 1] = newArray[index]
            newArray[index] = temp

            const ids = newArray.map(m => m.id)
            await reorderMetricDefinitions(ids)
        })
    }

    return (
        <>
            <div className="mb-4 flex items-center gap-2">
                <ClientTabSwitcher
                    className="min-w-0 flex-1 sm:max-w-md"
                    value={activeTab}
                    onValueChange={setActiveTab}
                    options={TAB_CONFIG}
                />
                <Button onClick={handleCreateClick} className="h-10 shrink-0 gap-1.5 rounded-full px-4 sm:ml-auto">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Nueva métrica</span>
                    <span className="sm:hidden">Nueva</span>
                </Button>
            </div>

            <MetricsTable
                metrics={initialMetrics.filter((m) => m.category === activeTab)}
                isPending={isPending}
                onEdit={handleEditClick}
                onToggleActive={handleToggleActive}
                onDelete={setDeleteTarget}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
            />

            {/* Modal */}
            <MetricFormModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                category={activeTab}
                editingMetric={editingMetric}
                onSave={handleSave}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar Métrica</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Estás seguro de que quieres eliminar la métrica &quot;{deleteTarget?.name}&quot;? Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ---------------------------------------------------------------------------
// Table Component
// ---------------------------------------------------------------------------

function MetricsTable({
    metrics,
    isPending,
    onEdit,
    onToggleActive,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    metrics: MetricDefinition[]
    isPending: boolean
    onEdit: (m: MetricDefinition) => void
    onToggleActive: (m: MetricDefinition) => void
    onDelete: (m: MetricDefinition) => void
    onMoveUp: (idx: number) => void
    onMoveDown: (idx: number) => void
}) {
    if (metrics.length === 0) {
        return (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <BarChart2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold">Sin métricas</h3>
                <p className="mt-1 text-xs text-muted-foreground">Crea métricas para incluirlas en tus formularios.</p>
            </div>
        )
    }

    const valueTypeLabels: Record<string, string> = {
        'number': 'Número',
        'text': 'Texto',
        'scale': 'Escala',
    }

    return (
        <ul className={cn(
            'divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
            isPending && 'pointer-events-none opacity-60'
        )}>
            {metrics.map((m, idx) => (
                <li key={m.id} className="flex items-center gap-2 py-2.5 pl-1.5 pr-2 transition-colors hover:bg-muted/40 sm:pl-2">
                    <div className="flex shrink-0 flex-col">
                        <button
                            type="button"
                            onClick={() => onMoveUp(idx)}
                            disabled={idx === 0 || isPending}
                            aria-label={`Subir ${m.name}`}
                            className="flex h-6 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-25"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onMoveDown(idx)}
                            disabled={idx === metrics.length - 1 || isPending}
                            aria-label={`Bajar ${m.name}`}
                            className="flex h-6 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-25"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <button type="button" onClick={() => onEdit(m)} className="min-w-0 flex-1 text-left">
                        <span className={cn('block truncate text-[15px] font-semibold', !m.is_active && 'text-muted-foreground')}>{m.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                            {valueTypeLabels[m.value_type] || m.value_type}
                            {m.unit ? ` · ${m.unit}` : ''}
                            {m.description ? ` · ${m.description}` : ''}
                        </span>
                    </button>

                    <span className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        m.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', m.is_active ? 'bg-success' : 'bg-muted-foreground/50')} />
                        {m.is_active ? 'Activa' : 'Inactiva'}
                    </span>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Acciones de {m.name}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(m)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleActive(m)}>
                                <Power className="mr-2 h-4 w-4" />
                                {m.is_active ? 'Desactivar' : 'Activar'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onDelete(m)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </li>
            ))}
        </ul>
    )
}
