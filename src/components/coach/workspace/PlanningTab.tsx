'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, subWeeks, addMonths, subMonths, isSameDay } from 'date-fns'
import { parseLocalDate } from '@/lib/date-utils'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Dumbbell, Activity, Calendar as CalendarIcon, Loader2, CheckCircle2, MoreHorizontal, Trash2, Pencil, GripVertical, Copy, Moon, FileText, Timer } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getWeeklySchedule, deleteCardioSession, updateCardioSession, moveSession, deleteStrengthSession, materializeVirtualSession, duplicateStrengthSession, duplicateCardioSession } from '@/app/(coach)/coach/workspace/planning-actions'
import { UnifiedCalendarItem, PlanningSnapshot, PlanningDayContext } from '@/types/planning'
import { CardioStructure } from '@/types/templates'
import { useToast } from '@/hooks/use-toast'
import { PlanningAddSessionDialog } from './PlanningAddSessionDialog'
import { CardioSessionForm } from './CardioSessionForm'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

// DnD Kit
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timezone-safe YYYY-MM-DD formatter (avoids toISOString UTC shift) */
const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const cardioTypeLabels: Record<string, string> = {
    rodaje: 'Rodaje',
    series: 'Series',
    tempo: 'Tempo',
    progressive: 'Progresivo',
    fartlek: 'Fartlek',
    hybrid: 'Híbrido',
}


function getCardioTypeLabel(type?: string) {
    if (!type) return 'Cardio'
    return cardioTypeLabels[type] || `${type.charAt(0).toUpperCase()}${type.slice(1)}`
}


// ---------------------------------------------------------------------------
// Draggable wrapper
// ---------------------------------------------------------------------------

function DraggableCard({ item, children }: { item: UnifiedCalendarItem; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: item.id,
        data: { item },
    })

    return (
        <div
            ref={setNodeRef}
            style={{ opacity: isDragging ? 0.3 : 1 }}
            className="transition-opacity cursor-grab active:cursor-grabbing"
            {...listeners}
            {...attributes}
        >
            {children}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Droppable wrapper
// ---------------------------------------------------------------------------

function DroppableDay({ dateStr, isOver, children }: { dateStr: string; isOver?: boolean; children: React.ReactNode }) {
    const { setNodeRef, isOver: over } = useDroppable({ id: `day-${dateStr}`, data: { dateStr } })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-1 space-y-2 overflow-y-auto custom-scrollbar transition-colors rounded-lg min-h-[80px]",
                over && "bg-primary/10 ring-2 ring-primary/30 ring-inset"
            )}
        >
            {children}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Drag Overlay (ghost card shown while dragging)
// ---------------------------------------------------------------------------

function DragOverlayCard({ item }: { item: UnifiedCalendarItem }) {
    if (item.type === 'strength') {
        return (
            <Card className="bg-red-600 dark:bg-red-700 border-red-500 text-white shadow-2xl w-[200px] rotate-2 scale-105">
                <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-white/90" />
                        <span className="font-bold text-sm line-clamp-1">
                            {(item as any).training_days?.name || 'Fuerza'}
                        </span>
                    </div>
                </CardContent>
            </Card>
        )
    }
    return (
        <Card className="bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 shadow-2xl w-[200px] rotate-2 scale-105 border-none">
            <CardContent className="p-3">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="font-bold text-sm line-clamp-1">{item.name || 'Cardio'}</span>
                </div>
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PlanningTabProps {
    clientId: string
    coachId: string
    onEditProgram?: (programId: string) => void
}

export function PlanningTab({ clientId, coachId, onEditProgram }: PlanningTabProps) {
    const { toast } = useToast()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [loading, setLoading] = useState(true)
    const [schedule, setSchedule] = useState<UnifiedCalendarItem[]>([])
    const [planningSnapshot, setPlanningSnapshot] = useState<PlanningSnapshot | null>(null)
    const [editingSession, setEditingSession] = useState<UnifiedCalendarItem | null>(null)
    const [activeItem, setActiveItem] = useState<UnifiedCalendarItem | null>(null)
    const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
    const [duplicatingItem, setDuplicatingItem] = useState<UnifiedCalendarItem | null>(null)
    const [duplicateTargetDate, setDuplicateTargetDate] = useState<string>('')

    // Calculate week range
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 })
    const endDate = endOfWeek(currentDate, { weekStartsOn: 1 })
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i))

    // Calculate month range + grid weeks
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const monthWeeks: Date[][] = (() => {
        const start = startOfWeek(monthStart, { weekStartsOn: 1 })
        const end = endOfWeek(monthEnd, { weekStartsOn: 1 })
        const weeks: Date[][] = []
        let cursor = start
        while (cursor <= end) {
            const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
            weeks.push(week)
            cursor = addDays(cursor, 7)
        }
        return weeks
    })()

    // DnD sensor — require 8px movement before drag starts (avoids accidental drags)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    // Fetch
    useEffect(() => {
        fetchSchedule()
    }, [clientId, currentDate, viewMode])

    const fetchSchedule = async () => {
        setLoading(true)
        try {
            const fetchStart = viewMode === 'week' ? startDate : monthStart
            const fetchEnd = viewMode === 'week' ? endDate : monthEnd
            const result = await getWeeklySchedule(clientId, fetchStart, fetchEnd, currentDate)
            if (result.success && result.data) {
                setPlanningSnapshot(result.data)
                setSchedule(result.data.items)
            } else {
                setPlanningSnapshot(null)
                setSchedule([])
                if (result.error) {
                    toast({ title: "Info", description: "No se pudieron cargar datos (Mostrando vacío)" })
                }
            }
        } catch (e) {
            console.error("Critical error in PlanningTab fetch:", e)
            setPlanningSnapshot(null)
            setSchedule([])
            toast({ title: "Error crítico", description: "Fallo al cargar calendario.", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    // -----------------------------------------------------------------------
    // Drag & Drop handlers
    // -----------------------------------------------------------------------

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const item = event.active.data.current?.item as UnifiedCalendarItem | undefined
        setActiveItem(item ?? null)
    }, [])

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        setActiveItem(null)

        const { active, over } = event
        if (!over) return

        const item = active.data.current?.item as UnifiedCalendarItem | undefined
        if (!item) return

        // Extract target date from droppable id (format: "day-YYYY-MM-DD")
        const targetDateStr = (over.data.current?.dateStr as string) || over.id.toString().replace('day-', '')
        const currentDateStr = item.date

        // No-op if same day
        if (targetDateStr === currentDateStr) return

        const isVirtual = item.id.startsWith('virtual-')

        // Optimistic update
        const prevSchedule = [...schedule]
        if (isVirtual) {
            // Virtual → remove the virtual placeholder, add a "materialized" item
            setSchedule(prev => [
                ...prev.filter(s => s.id !== item.id),
                { ...item, id: `temp-${Date.now()}`, date: targetDateStr }
            ])
        } else {
            setSchedule(prev =>
                prev.map(s => s.id === item.id ? { ...s, date: targetDateStr } : s)
            )
        }

        // Persist
        let result: { success: boolean; error?: string }

        if (isVirtual) {
            // Materialize: INSERT a new row in scheduled_strength_sessions
            const programId = (item as any).training_program_id
            const dayId = (item as any).training_day_id
            result = await materializeVirtualSession(clientId, programId, dayId, targetDateStr)
        } else {
            result = await moveSession(item.id, item.type, targetDateStr)
        }

        if (!result.success) {
            // Rollback
            setSchedule(prevSchedule)
            toast({
                title: "Error al mover",
                description: result.error || "No se pudo actualizar la fecha.",
                variant: "destructive"
            })
        } else {
            // Refetch to get real IDs (especially for materialized sessions)
            fetchSchedule()
            toast({
                title: "Sesión movida",
                description: `Movida al ${targetDateStr.split('-').reverse().join('/')}`,
                className: "bg-green-500 text-white border-none",
            })
        }
    }, [schedule, toast])

    const handleDragCancel = useCallback(() => {
        setActiveItem(null)
    }, [])

    // -----------------------------------------------------------------------
    // Other handlers
    // -----------------------------------------------------------------------

    const handleUpdateCardio = async (data: { name: string; description?: string; structure: CardioStructure; targetDistanceKm?: number; targetDurationMin?: number; targetPace?: string }) => {
        if (!editingSession || editingSession.type !== 'cardio') return
        try {
            const res = await updateCardioSession({
                id: editingSession.id,
                name: data.name,
                description: data.description,
                structure: data.structure,
                targetDistanceKm: data.targetDistanceKm,
                targetDurationMin: data.targetDurationMin,
                targetPace: data.targetPace,
            })
            if (res.success) {
                toast({ title: "Sesión actualizada", description: "Los cambios se han guardado correctamente." })
                setEditingSession(null)
                fetchSchedule()
            } else {
                toast({ title: "Error", description: res.error || "No se pudo actualizar", variant: "destructive" })
            }
        } catch (error) {
            toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
        }
    }

    const handleDeleteCardio = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        if (confirm('¿Estás seguro de que quieres eliminar esta sesión?')) {
            try {
                const res = await deleteCardioSession(sessionId)
                if (res.success) {
                    toast({ title: "Sesión eliminada", description: "La sesión se ha eliminado correctamente." })
                    fetchSchedule()
                } else {
                    toast({ title: "Error", description: res.error || "No se pudo eliminar", variant: "destructive" })
                }
            } catch (error) {
                toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
            }
        }
    }

    const handleDeleteStrength = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        if (confirm('¿Eliminar esta sesión de fuerza del calendario?')) {
            const prev = [...schedule]
            setSchedule(s => s.filter(item => item.id !== sessionId))
            try {
                const res = await deleteStrengthSession(sessionId)
                if (res.success) {
                    toast({ title: "Sesión eliminada", description: "La sesión de fuerza se ha eliminado del calendario." })
                } else {
                    setSchedule(prev)
                    toast({ title: "Error", description: res.error || "No se pudo eliminar", variant: "destructive" })
                }
            } catch {
                setSchedule(prev)
                toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
            }
        }
    }

    const handleDuplicateStrength = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        try {
            const res = await duplicateStrengthSession(sessionId)
            if (res.success) {
                toast({ title: "Sesión duplicada", description: "Se ha creado una copia de la sesión de fuerza." })
                fetchSchedule()
            } else {
                toast({ title: "Error", description: res.error || "No se pudo duplicar", variant: "destructive" })
            }
        } catch {
            toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
        }
    }

    const handleDuplicateCardio = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        try {
            const res = await duplicateCardioSession(sessionId)
            if (res.success) {
                toast({ title: "Sesión duplicada", description: "Se ha creado una copia de la sesión de cardio." })
                fetchSchedule()
            } else {
                toast({ title: "Error", description: res.error || "No se pudo duplicar", variant: "destructive" })
            }
        } catch {
            toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
        }
    }

    const handleDuplicateToDate = async () => {
        if (!duplicatingItem || !duplicateTargetDate) return
        try {
            let res: { success: boolean; newId?: string; error?: string }
            if (duplicatingItem.type === 'strength') {
                res = await duplicateStrengthSession(duplicatingItem.id)
            } else {
                res = await duplicateCardioSession(duplicatingItem.id)
            }
            if (res.success && res.newId) {
                // Tras duplicar, mover la sesión duplicada a la fecha destino
                const moveRes = await moveSession(res.newId, duplicatingItem.type, duplicateTargetDate)
                if (moveRes.success) {
                    toast({
                        title: "Sesión duplicada",
                        description: `Copia creada para el ${duplicateTargetDate.split('-').reverse().join('/')}`,
                        className: "bg-green-500 text-white border-none",
                    })
                    setDuplicatingItem(null)
                    setDuplicateTargetDate('')
                    fetchSchedule()
                } else {
                    toast({ title: "Error", description: moveRes.error || "No se pudo mover la copia", variant: "destructive" })
                }
            } else {
                toast({ title: "Error", description: res.error || "No se pudo duplicar", variant: "destructive" })
            }
        } catch {
            toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" })
        }
    }

    const handlePrevious = () => {
        if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1))
        else setCurrentDate(subMonths(currentDate, 1))
    }
    const handleNext = () => {
        if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1))
        else setCurrentDate(addMonths(currentDate, 1))
    }
    const handleToday = () => setCurrentDate(new Date())

    const getItemsForDay = (date: Date) => {
        return schedule.filter(item => isSameDay(parseLocalDate(item.date), date))
    }

    const getDayContext = (date: Date): PlanningDayContext | undefined => {
        const dateStr = toLocalDateStr(date)
        return planningSnapshot?.dayContexts.find((day) => day.date === dateStr)
    }

    const getCardioSummary = (item: UnifiedCalendarItem & { type: 'cardio' }) => {
        const parts = []
        let distance = item.distance_km ?? item.target_distance_km
        let duration = item.duration_minutes ?? item.target_duration_min
        if (!distance && !duration && item.structure?.blocks) {
            const continuousBlock = item.structure.blocks.find(b => b.type === 'continuous')
            if (continuousBlock) {
                distance = continuousBlock.distance
                duration = continuousBlock.duration
            }
        }
        if (distance) parts.push(`${distance}km`)
        if (duration) parts.push(`${duration}'`)
        return parts.join(' / ')
    }

    const isToday = (date: Date) => isSameDay(date, new Date())
    const selectedLabel = viewMode === 'week'
        ? `${format(startDate, 'd MMM', { locale: es })} - ${format(endDate, 'd MMM', { locale: es })}`
        : format(currentDate, 'MMMM yyyy', { locale: es })

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex flex-col h-full space-y-4 p-4">
                {/* Controls */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2">
                        <div>
                            <h2 className="text-2xl font-bold capitalize">
                                {format(currentDate, 'MMMM yyyy', { locale: es })}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {viewMode === 'week' ? `Vista operativa de la semana · ${selectedLabel}` : `Mapa general del bloque · ${selectedLabel}`}
                            </p>
                        </div>
                        <div className="flex items-center rounded-md border bg-background shadow-sm ml-0 lg:ml-4">
                            <Button variant="ghost" size="icon" onClick={handlePrevious}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleToday} className="px-3 font-medium">
                                Hoy
                            </Button>
                            <Button variant="ghost" size="icon" onClick={handleNext}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center rounded-md border bg-background shadow-sm">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('week')}
                            className={cn("px-3", viewMode === 'week' && "bg-muted font-semibold")}
                        >
                            Semana
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('month')}
                            className={cn("px-3", viewMode === 'month' && "bg-muted font-semibold")}
                        >
                            Mes
                        </Button>
                    </div>
                </div>

                {/* Weekly Grid */}
                {viewMode === 'week' && (
                    <TooltipProvider delayDuration={200}>
                    <div className="grid grid-cols-1 xl:grid-cols-7 gap-4 h-full min-h-[600px]">
                        {weekDays.map((day) => {
                            const items = getItemsForDay(day)
                            const isTodayDate = isToday(day)
                            const dayDateStr = toLocalDateStr(day)
                            const dayContext = getDayContext(day)
                            const noteCount = dayContext?.noteCount ?? 0

                            return (
                                <div key={day.toISOString()} className={cn(
                                    "flex flex-col gap-3 rounded-2xl border p-3 transition-colors",
                                    dayContext?.state === 'planned_rest' && "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
                                    dayContext?.state === 'empty' && "border-dashed bg-muted/20",
                                    dayContext?.state === 'scheduled' && "bg-card",
                                    isTodayDate && "ring-2 ring-primary bg-primary/5"
                                )}>
                                    {/* Day Header */}
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 border-b pb-3">
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                                                    {format(day, 'EEE', { locale: es })}
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className={cn(
                                                        "inline-flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl bg-background/80 px-2 text-2xl font-bold leading-none tabular-nums",
                                                        isTodayDate && "bg-primary text-primary-foreground"
                                                    )}
                                                >
                                                    {format(day, 'd')}
                                                </span>
                                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                                    {items.length > 0 && (
                                                        <Badge variant="outline" className="shrink-0 bg-background/80 whitespace-nowrap">
                                                            {items.length} ses.
                                                        </Badge>
                                                    )}
                                                    {dayContext?.state === 'planned_rest' && (
                                                        <Badge className="shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-800">
                                                            Descanso
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="justify-self-end shrink-0">
                                            <PlanningAddSessionDialog
                                                clientId={clientId}
                                                coachId={coachId}
                                                date={toLocalDateStr(day)}
                                                onSessionAdded={fetchSchedule}
                                            />
                                        </div>
                                        {noteCount > 0 && (
                                            <div className="col-span-2">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="inline-flex w-fit max-w-full items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
                                                        >
                                                            <FileText className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">
                                                                {noteCount} nota{noteCount === 1 ? '' : 's'}
                                                            </span>
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                                                        {dayContext?.notes.map((note) => (
                                                            <p key={note.id}>{note.content}</p>
                                                        ))}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        )}
                                    </div>

                                    {/* Droppable Items Area */}
                                    <DroppableDay dateStr={dayDateStr}>
                                        {loading ? (
                                            <div className="flex justify-center items-center py-8">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : (
                                            <>
                                                {items.length === 0 && (
                                                    <div className={cn(
                                                        "flex min-h-[100px] items-start justify-start rounded-xl border p-3",
                                                        dayContext?.state === 'planned_rest'
                                                            ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"
                                                            : "border-dashed border-border/40 bg-muted/10"
                                                    )}>
                                                        {dayContext?.state === 'planned_rest' && (
                                                            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100/80 dark:bg-emerald-900/40">
                                                                    <Moon className="h-4 w-4 opacity-70" />
                                                                </div>
                                                                <div>
                                                                    <span className="block text-xs font-semibold uppercase tracking-wide">Descanso</span>
                                                                    <span className="block text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                                                                        Día planificado sin sesión.
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {items.map((item) => (
                                                    <DraggableCard key={item.id} item={item}>
                                                        {item.type === 'strength' ? (
                                                            <StrengthCard
                                                                item={item}
                                                                onEdit={(programId) => onEditProgram?.(programId)}
                                                                onDuplicate={(e) => handleDuplicateStrength(e, item.id)}
                                                                onDuplicateToDate={() => setDuplicatingItem(item)}
                                                                onDelete={(e) => handleDeleteStrength(e, item.id)}
                                                            />
                                                        ) : (
                                                            <CardioCard
                                                                item={item}
                                                                getCardioSummary={getCardioSummary}
                                                                onEdit={() => setEditingSession(item)}
                                                                onDuplicate={(e) => handleDuplicateCardio(e, item.id)}
                                                                onDuplicateToDate={() => setDuplicatingItem(item)}
                                                                onDelete={(e) => handleDeleteCardio(e, item.id)}
                                                            />
                                                        )}
                                                    </DraggableCard>
                                                ))}
                                            </>
                                        )}
                                    </DroppableDay>

                                    {dayContext?.notes?.length ? (
                                        <div className="space-y-2 pt-1">
                                            {dayContext.notes.slice(0, 2).map((note) => (
                                                <div
                                                    key={note.id}
                                                    className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-50"
                                                >
                                                    <div className="flex items-center gap-1.5 font-medium mb-1">
                                                        <FileText className="h-3 w-3" />
                                                        Nota del planner
                                                    </div>
                                                    <p className="line-clamp-2">{note.content}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>
                    </TooltipProvider>
                )}

                {/* Monthly Grid */}
                {viewMode === 'month' && (
                    <div className="flex flex-col h-full space-y-1.5 px-0.5">
                        {loading ? (
                            <div className="flex justify-center items-center py-16">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {/* Day headers */}
                                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => (
                                        <div
                                            key={d}
                                            className={cn(
                                                "text-[11px] font-semibold py-1.5 rounded-md",
                                                i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground"
                                            )}
                                        >
                                            {d}
                                        </div>
                                    ))}
                                </div>

                                {/* Weeks */}
                                {monthWeeks.map((week, wi) => (
                                    <div key={wi} className="grid grid-cols-7 gap-1 flex-1">
                                        {week.map((day) => {
                                            const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                                            const isTodayDate = isToday(day)
                                            const items = getItemsForDay(day)
                                            const dayContext = getDayContext(day)
                                            const visible = items.slice(0, 3)
                                            const overflow = items.length - visible.length

                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    className={cn(
                                                        "rounded-xl border p-2 min-h-[96px] transition-colors",
                                                        isCurrentMonth
                                                            ? "bg-card hover:bg-muted/30"
                                                            : "bg-muted/5 opacity-40",
                                                        dayContext?.state === 'planned_rest' && isCurrentMonth && "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/15",
                                                        dayContext?.state === 'empty' && isCurrentMonth && items.length === 0 && "border-dashed",
                                                        isTodayDate && "ring-2 ring-primary border-primary/40 bg-primary/5 hover:bg-primary/8",
                                                        items.length > 0 && isCurrentMonth && !isTodayDate && "border-border/80 shadow-sm"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className={cn(
                                                            "text-xs font-bold leading-none",
                                                            isTodayDate
                                                                ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                                                                : isCurrentMonth
                                                                    ? "text-foreground"
                                                                    : "text-muted-foreground"
                                                        )}>
                                                            {format(day, 'd')}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            {dayContext?.noteCount ? (
                                                                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                                                                    {dayContext.noteCount}
                                                                </span>
                                                            ) : null}
                                                            {items.length > 0 && isCurrentMonth && !isTodayDate && (
                                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        {visible.map(item => {
                                                            const structure = item.type === 'cardio' ? (item as any).structure : null
                                                            const cardioType = structure?.trainingType || 'rodaje'
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    className={cn(
                                                                        "text-[10px] rounded-md px-1.5 py-1 font-medium group/pill relative",
                                                                        "border border-transparent",
                                                                        item.type === 'strength'
                                                                            ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 hover:border-red-300 dark:hover:border-red-700"
                                                                            : cardioType === 'series'
                                                                                ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 hover:border-yellow-300 dark:hover:border-yellow-700"
                                                                                : cardioType === 'tempo'
                                                                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:border-blue-300 dark:hover:border-blue-700"
                                                                                    : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:border-green-300 dark:hover:border-green-700"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between gap-0.5">
                                                                        <div className="flex items-center gap-0.5 min-w-0 flex-1">
                                                                            <span className="flex-shrink-0 opacity-70">
                                                                                {item.type === 'strength'
                                                                                    ? '🏋️'
                                                                                    : cardioType === 'series'
                                                                                        ? '⚡'
                                                                                        : cardioType === 'tempo'
                                                                                            ? '🎯'
                                                                                            : '🏃'
                                                                                }
                                                                            </span>
                                                                            <span className="truncate">
                                                                                {item.type === 'strength'
                                                                                    ? ((item as any).training_days?.name || 'Fuerza')
                                                                                    : (item.name || 'Cardio')
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    className="h-3 w-3 p-0 opacity-0 group-hover/pill:opacity-100 transition-opacity hover:bg-black/10 dark:hover:bg-white/10 rounded-full flex-shrink-0"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    <MoreHorizontal className="h-2.5 w-2.5" />
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="text-xs">
                                                                                {item.type === 'cardio' && (
                                                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingSession(item) }}>
                                                                                        <Pencil className="mr-2 h-3 w-3" /> Editar
                                                                                    </DropdownMenuItem>
                                                                                )}
                                                                                {item.type === 'strength' && (item as any).training_program_id && (
                                                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditProgram?.((item as any).training_program_id) }}>
                                                                                        <Pencil className="mr-2 h-3 w-3" /> Editar programa
                                                                                    </DropdownMenuItem>
                                                                                )}
                                                                                {!item.id.startsWith('virtual-') && (
                                                                                    <DropdownMenuItem onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        item.type === 'strength'
                                                                                            ? handleDuplicateStrength(e, item.id)
                                                                                            : handleDuplicateCardio(e, item.id)
                                                                                    }}>
                                                                                        <Copy className="mr-2 h-3 w-3" /> Duplicar aquí
                                                                                    </DropdownMenuItem>
                                                                                )}
                                                                                <DropdownMenuItem onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    setDuplicatingItem(item)
                                                                                }}>
                                                                                    <CalendarIcon className="mr-2 h-3 w-3" /> Duplicar en otra fecha
                                                                                </DropdownMenuItem>
                                                                                {!item.id.startsWith('virtual-') && (
                                                                                    <DropdownMenuItem
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            item.type === 'strength'
                                                                                                ? handleDeleteStrength(e, item.id)
                                                                                                : handleDeleteCardio(e, item.id)
                                                                                        }}
                                                                                        className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                                                                                    >
                                                                                        <Trash2 className="mr-2 h-3 w-3" /> Eliminar
                                                                                    </DropdownMenuItem>
                                                                                )}
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                        {overflow > 0 && (
                                                            <div className="text-[10px] text-muted-foreground/70 pl-1 mt-0.5 font-medium">
                                                                +{overflow} más
                                                            </div>
                                                        )}
                                                        {items.length === 0 && isCurrentMonth && dayContext?.state === 'planned_rest' && (
                                                            <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium pl-1">
                                                                Descanso
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* Edit Cardio Dialog */}
                <Dialog open={!!editingSession} onOpenChange={(val) => !val && setEditingSession(null)}>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Editar Sesión de Cardio</DialogTitle>
                        </DialogHeader>
                        {editingSession && editingSession.type === 'cardio' && (
                            <CardioSessionForm
                                initialData={{
                                    name: editingSession.name,
                                    description: editingSession.description,
                                    structure: editingSession.structure,
                                    targetDistanceKm: editingSession.target_distance_km,
                                    targetDurationMin: editingSession.target_duration_min,
                                    targetPace: editingSession.target_pace,
                                }}
                                onSubmit={handleUpdateCardio}
                                onCancel={() => setEditingSession(null)}
                            />
                        )}
                    </DialogContent>
                </Dialog>

                {/* Duplicate to date dialog */}
                <Dialog open={!!duplicatingItem} onOpenChange={(val) => { if (!val) { setDuplicatingItem(null); setDuplicateTargetDate('') } }}>
                    <DialogContent className="sm:max-w-[360px]">
                        <DialogHeader>
                            <DialogTitle>Duplicar sesión en otra fecha</DialogTitle>
                        </DialogHeader>
                        {duplicatingItem && (
                            <div className="space-y-4 py-2">
                                <p className="text-sm text-muted-foreground">
                                    Copiando: <span className="font-medium text-foreground">
                                        {duplicatingItem.type === 'strength'
                                            ? ((duplicatingItem as any).training_days?.name || 'Sesión de fuerza')
                                            : (duplicatingItem.name || 'Sesión de cardio')
                                        }
                                    </span>
                                </p>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Fecha destino</label>
                                    <input
                                        type="date"
                                        value={duplicateTargetDate}
                                        onChange={(e) => setDuplicateTargetDate(e.target.value)}
                                        className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setDuplicatingItem(null); setDuplicateTargetDate('') }}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        size="sm"
                                        disabled={!duplicateTargetDate}
                                        onClick={handleDuplicateToDate}
                                    >
                                        Duplicar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>

            {/* Drag Overlay — rendered outside the grid so it floats freely */}
            <DragOverlay dropAnimation={null}>
                {activeItem ? <DragOverlayCard item={activeItem} /> : null}
            </DragOverlay>
        </DndContext>
    )
}

// ---------------------------------------------------------------------------
// Sub-components (extracted for readability)
// ---------------------------------------------------------------------------

function StrengthCard({ item, onEdit, onDuplicate, onDuplicateToDate, onDelete }: {
    item: UnifiedCalendarItem
    onEdit?: (programId: string) => void
    onDuplicate?: (e: React.MouseEvent) => void
    onDuplicateToDate?: () => void
    onDelete?: (e: React.MouseEvent) => void
}) {
    const isVirtual = item.id.startsWith('virtual-')
    const programId = (item as any).training_program_id
    const canDelete = !isVirtual

    return (
        <Card className="border-red-500 text-white shadow-md transition-colors group relative overflow-hidden cursor-pointer bg-red-600 dark:bg-red-700 hover:bg-red-500 dark:hover:bg-red-600">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-200/50" />
            <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-1.5 py-0 h-5 border-none">
                        Fuerza
                    </Badge>
                    <div className="flex items-center gap-1">
                        {(item as any).is_completed && <CheckCircle2 className="h-3 w-3 text-white" />}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="h-5 w-5 p-0 hover:bg-white/20 rounded-full"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreHorizontal className="h-3 w-3 text-white/70" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    if (programId) onEdit?.(programId)
                                }}>
                                    <Pencil className="mr-2 h-4 w-4" /> Editar programa
                                </DropdownMenuItem>
                                {canDelete && (
                                    <DropdownMenuItem onClick={(e) => onDuplicate?.(e)}>
                                        <Copy className="mr-2 h-4 w-4" /> Duplicar
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicateToDate?.() }}>
                                    <CalendarIcon className="mr-2 h-4 w-4" /> Duplicar en otra fecha
                                </DropdownMenuItem>
                                {canDelete && (
                                    <DropdownMenuItem
                                        onClick={(e) => onDelete?.(e)}
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar sesión
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <GripVertical className="h-3 w-3 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-white/90 shrink-0" />
                    <span className="font-bold text-sm line-clamp-2 text-white leading-snug">
                        {(item as any).training_days?.name || 'Sesión de fuerza'}
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}

function CardioCard({
    item,
    getCardioSummary,
    onEdit,
    onDuplicate,
    onDuplicateToDate,
    onDelete
}: {
    item: UnifiedCalendarItem & { type: 'cardio' }
    getCardioSummary: (item: UnifiedCalendarItem & { type: 'cardio' }) => string
    onEdit: () => void
    onDuplicate: (e: React.MouseEvent) => void
    onDuplicateToDate?: () => void
    onDelete: (e: React.MouseEvent) => void
}) {
    const structure = item.structure as any
    const type = structure?.trainingType || 'rodaje'
    const summaryLine = item.summary_line || getCardioSummary(item)

    return (
        <Card className={cn("border-none shadow-sm hover:opacity-80 transition-opacity cursor-pointer relative overflow-hidden group",
            type === 'rodaje' ? "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100" :
                type === 'series' ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100" :
                    "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
        )}>
            <div className={cn("absolute top-0 left-0 w-1 h-full",
                type === 'rodaje' ? "bg-green-500" :
                    type === 'series' ? "bg-yellow-500" : "bg-blue-500"
            )} />
            <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                            Cardio
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5 bg-white/40 dark:bg-black/15 border-transparent">
                            {getCardioTypeLabel(type)}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                        {item.is_completed && <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="h-5 w-5 p-0 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    onEdit()
                                }}>
                                    <Pencil className="mr-2 h-4 w-4" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => onDuplicate(e)}>
                                    <Copy className="mr-2 h-4 w-4" /> Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicateToDate?.() }}>
                                    <CalendarIcon className="mr-2 h-4 w-4" /> Duplicar en otra fecha
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => onDelete(e)}
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <GripVertical className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                <h4 className="font-bold text-sm mb-1 leading-snug">{item.name}</h4>

                {summaryLine && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-white/50 dark:bg-black/15 px-2 py-1 text-[10px] font-medium">
                        <Timer className="h-3 w-3" />
                        {summaryLine}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
