'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Plus,
    Loader2,
    Camera,
    ImageOff,
    MoreHorizontal,
    Pencil,
    Pause,
    Play,
    Trash2,
    ClipboardCheck,
    AlertTriangle,
} from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ReviewTemplate } from '@/data/review-templates'
import type { ClientReviewScheduleWithTemplate } from '@/data/review-schedules'
import {
    listSchedulesForClientAction,
    deleteScheduleAction,
    updateScheduleAction,
} from './schedule-actions'
import { AddScheduleDialog } from './AddScheduleDialog'

interface SchedulesTabProps {
    clientId: string
    reviewTemplates: ReviewTemplate[]
}

export function SchedulesTab({ clientId, reviewTemplates }: SchedulesTabProps) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [loading, setLoading] = useState(true)
    const [schedules, setSchedules] = useState<ClientReviewScheduleWithTemplate[]>([])
    const [addOpen, setAddOpen] = useState(false)
    const [editing, setEditing] = useState<ClientReviewScheduleWithTemplate | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<ClientReviewScheduleWithTemplate | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const list = await listSchedulesForClientAction(clientId)
            setSchedules(list)
        } finally {
            setLoading(false)
        }
    }, [clientId])

    useEffect(() => { refresh() }, [refresh])

    const handleEdit = (s: ClientReviewScheduleWithTemplate) => {
        setEditing(s)
        setAddOpen(true)
    }

    const handleAddNew = () => {
        setEditing(null)
        setAddOpen(true)
    }

    const handleTogglePause = (s: ClientReviewScheduleWithTemplate) => {
        startTransition(async () => {
            const result = await updateScheduleAction(s.id, { is_active: !s.is_active })
            if (result.success) {
                toast({ title: s.is_active ? 'Revisión pausada' : 'Revisión reanudada' })
                refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const confirmDelete = () => {
        if (!deleteTarget) return
        startTransition(async () => {
            const result = await deleteScheduleAction(deleteTarget.id)
            if (result.success) {
                toast({ title: 'Revisión eliminada' })
                refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
            setDeleteTarget(null)
        })
    }

    const noActiveTemplates = reviewTemplates.filter(t => t.is_active).length === 0

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold">Plan de revisiones</h3>
                    <p className="text-xs text-muted-foreground">
                        {schedules.length === 0
                            ? 'Este atleta aún no tiene revisiones asignadas.'
                            : `${schedules.length} revisión${schedules.length === 1 ? '' : 'es'} asignada${schedules.length === 1 ? '' : 's'}.`}
                    </p>
                </div>
                <Button size="sm" onClick={handleAddNew} className="gap-1.5" disabled={noActiveTemplates}>
                    <Plus className="h-4 w-4" /> Añadir revisión
                </Button>
            </div>

            {noActiveTemplates && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">No hay plantillas de revisión activas</p>
                            <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5">
                                Crea una en Formularios → Plantillas de revisión antes de asignarla a un atleta.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : schedules.length === 0 ? (
                <Card className="p-8 text-center">
                    <ClipboardCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm font-medium">Sin revisiones asignadas</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Pulsa &quot;Añadir revisión&quot; para empezar.
                    </p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {schedules.map(s => (
                        <ScheduleRow
                            key={s.id}
                            schedule={s}
                            isPending={isPending}
                            onEdit={() => handleEdit(s)}
                            onTogglePause={() => handleTogglePause(s)}
                            onDelete={() => setDeleteTarget(s)}
                        />
                    ))}
                </div>
            )}

            <AddScheduleDialog
                open={addOpen}
                onOpenChange={(v) => {
                    setAddOpen(v)
                    if (!v) setEditing(null)
                }}
                clientId={clientId}
                reviewTemplates={reviewTemplates}
                existingSchedules={schedules}
                editingSchedule={editing}
                onSaved={refresh}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar revisión</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Quieres eliminar la revisión &quot;{deleteTarget?.review_template?.name}&quot; de este atleta?
                            La plantilla en sí no se borra; solo se desasigna.
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
        </div>
    )
}

function ScheduleRow({
    schedule: s,
    isPending,
    onEdit,
    onTogglePause,
    onDelete,
}: {
    schedule: ClientReviewScheduleWithTemplate
    isPending: boolean
    onEdit: () => void
    onTogglePause: () => void
    onDelete: () => void
}) {
    const tpl = s.review_template
    const dueText = formatDue(s.next_due_date)
    const groups: string[] = []
    if (tpl?.include_body_metrics) groups.push('Cuerpo')
    if (tpl?.include_performance_metrics) groups.push('Rendimiento')
    if (tpl?.include_general_metrics) groups.push('General')

    return (
        <Card className={`p-3 ${isPending ? 'opacity-60 pointer-events-none' : ''} ${!s.is_active ? 'bg-muted/40' : ''}`}>
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{tpl?.name ?? 'Plantilla eliminada'}</span>
                        {!s.is_active && (
                            <Badge variant="outline" className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20 text-[10px]">Pausada</Badge>
                        )}
                        {s.is_active && dueText.tone === 'overdue' && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Vencida</Badge>
                        )}
                        {s.is_active && dueText.tone === 'due' && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">Próxima</Badge>
                        )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span>Cada {s.frequency_days}d</span>
                        <span>·</span>
                        <span>Próxima: {dueText.label}</span>
                        {groups.length > 0 && (
                            <>
                                <span>·</span>
                                <span>{groups.join(' / ')}</span>
                            </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                            {tpl?.include_progress_photos
                                ? <><Camera className="h-3 w-3" /> Fotos</>
                                : <><ImageOff className="h-3 w-3" /> Sin fotos</>}
                        </span>
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onEdit}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onTogglePause}>
                            {s.is_active
                                ? <><Pause className="mr-2 h-4 w-4" /> Pausar</>
                                : <><Play className="mr-2 h-4 w-4" /> Reanudar</>
                            }
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </Card>
    )
}

function formatDue(dateStr: string | null): { label: string; tone: 'normal' | 'due' | 'overdue' } {
    if (!dateStr) return { label: 'Sin fecha', tone: 'normal' }
    try {
        const date = parseISO(dateStr)
        const days = differenceInDays(date, new Date())
        if (days < 0) return { label: format(date, "d MMM yyyy", { locale: es }), tone: 'overdue' }
        if (days === 0) return { label: 'Hoy', tone: 'due' }
        if (days === 1) return { label: 'Mañana', tone: 'due' }
        if (days <= 3) return { label: `En ${days} días`, tone: 'due' }
        return { label: format(date, "d MMM yyyy", { locale: es }), tone: 'normal' }
    } catch {
        return { label: dateStr, tone: 'normal' }
    }
}
