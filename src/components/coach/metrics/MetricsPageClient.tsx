'use client'

import { useState, useTransition } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
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
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MetricCategory)}>
                <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                    <TabsList>
                        {TAB_CONFIG.map((tab) => {
                            const count = initialMetrics.filter((m) => m.category === tab.value).length
                            return (
                                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                                    {tab.label}
                                    {count > 0 && (
                                        <Badge
                                            variant="secondary"
                                            className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
                                        >
                                            {count}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                    <Button onClick={handleCreateClick} className="gap-1.5 shrink-0">
                        <Plus className="h-4 w-4" />
                        Nueva Métrica
                    </Button>
                </div>

                {TAB_CONFIG.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value} className="mt-0">
                        <MetricsTable
                            metrics={initialMetrics.filter((m) => m.category === tab.value)}
                            isPending={isPending}
                            onEdit={handleEditClick}
                            onToggleActive={handleToggleActive}
                            onDelete={setDeleteTarget}
                            onMoveUp={handleMoveUp}
                            onMoveDown={handleMoveDown}
                        />
                    </TabsContent>
                ))}
            </Tabs>

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
            <Card className="p-12 text-center">
                <BarChart2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold">Sin métricas</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Crea métricas para incluirlas en tus formularios.
                </p>
            </Card>
        )
    }

    const valueTypeLabels: Record<string, string> = {
        'number': 'Número',
        'text': 'Texto',
        'scale': 'Escala',
    }

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12" />
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="hidden sm:table-cell">Creado</TableHead>
                        <TableHead className="w-12" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {metrics.map((m, idx) => (
                        <TableRow
                            key={m.id}
                            className={isPending ? 'opacity-60 pointer-events-none' : ''}
                        >
                            {/* Actions Up/Down */}
                            <TableCell className="px-2">
                                <div className="flex flex-col items-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 hover:bg-muted"
                                        onClick={() => onMoveUp(idx)}
                                        disabled={idx === 0 || isPending}
                                    >
                                        <ArrowUp className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 hover:bg-muted"
                                        onClick={() => onMoveDown(idx)}
                                        disabled={idx === metrics.length - 1 || isPending}
                                    >
                                        <ArrowDown className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                </div>
                            </TableCell>

                            {/* Nombre y descripción */}
                            <TableCell>
                                <div className="font-medium">{m.name}</div>
                                {m.description && (
                                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                        {m.description}
                                    </div>
                                )}
                            </TableCell>

                            <TableCell>
                                <span className="text-sm">
                                    {valueTypeLabels[m.value_type] || m.value_type}
                                </span>
                            </TableCell>

                            <TableCell>
                                <span className="text-sm text-muted-foreground">
                                    {m.unit || '—'}
                                </span>
                            </TableCell>

                            <TableCell>
                                {m.is_active ? (
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                                        Activo
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20">
                                        Inactivo
                                    </Badge>
                                )}
                            </TableCell>

                            <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                                {new Date(m.created_at).toLocaleDateString()}
                            </TableCell>

                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
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
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    )
}
