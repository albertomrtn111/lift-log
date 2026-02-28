'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Dumbbell, Activity, Calendar as CalendarIcon, Loader2, CheckCircle2, MoreHorizontal, Trash2, Pencil, GripVertical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getWeeklySchedule, deleteCardioSession, updateCardioSession, moveSession, deleteStrengthSession, materializeVirtualSession } from '@/app/(coach)/coach/workspace/planning-actions'
import { UnifiedCalendarItem } from '@/types/planning'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
    const [editingSession, setEditingSession] = useState<UnifiedCalendarItem | null>(null)
    const [activeItem, setActiveItem] = useState<UnifiedCalendarItem | null>(null)

    // Calculate week range
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 })
    const endDate = endOfWeek(currentDate, { weekStartsOn: 1 })
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i))

    // DnD sensor — require 8px movement before drag starts (avoids accidental drags)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    // Fetch
    useEffect(() => {
        fetchSchedule()
    }, [clientId, currentDate])

    const fetchSchedule = async () => {
        setLoading(true)
        try {
            const result = await getWeeklySchedule(clientId, startDate, endDate)
            if (result.success && result.data) {
                setSchedule(result.data)
            } else {
                if (result.error) {
                    toast({ title: "Info", description: "No se pudieron cargar datos (Mostrando vacío)" })
                }
            }
        } catch (e) {
            console.error("Critical error in PlanningTab fetch:", e)
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

    const handlePreviousWeek = () => setCurrentDate(subWeeks(currentDate, 1))
    const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1))
    const handleToday = () => setCurrentDate(new Date())

    const getItemsForDay = (date: Date) => {
        return schedule.filter(item => isSameDay(new Date(item.date), date))
    }

    const getCardioSummary = (item: UnifiedCalendarItem & { type: 'cardio' }) => {
        const parts = []
        let distance = item.distance_km
        let duration = item.duration_minutes
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
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h2>
                        <div className="flex items-center rounded-md border bg-background shadow-sm ml-4">
                            <Button variant="ghost" size="icon" onClick={handlePreviousWeek}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleToday} className="px-3 font-medium">
                                Hoy
                            </Button>
                            <Button variant="ghost" size="icon" onClick={handleNextWeek}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-4 h-full min-h-[600px]">
                    {weekDays.map((day) => {
                        const items = getItemsForDay(day)
                        const isTodayDate = isToday(day)
                        const dayDateStr = toLocalDateStr(day)

                        return (
                            <div key={day.toISOString()} className={cn(
                                "flex flex-col gap-2 rounded-xl border p-2 bg-muted/20",
                                isTodayDate && "ring-2 ring-primary bg-primary/5"
                            )}>
                                {/* Day Header */}
                                <div className="flex items-center justify-between pb-2 border-b mb-2">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                            {format(day, 'EEE', { locale: es })}
                                        </span>
                                        <span className={cn("text-lg font-bold", isTodayDate && "text-primary")}>
                                            {format(day, 'd')}
                                        </span>
                                    </div>
                                    <PlanningAddSessionDialog
                                        clientId={clientId}
                                        coachId={coachId}
                                        date={day}
                                        onSessionAdded={fetchSchedule}
                                    />
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
                                                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/30 font-medium select-none py-8">
                                                    Descanso
                                                </div>
                                            )}
                                            {items.map((item) => (
                                                <DraggableCard key={item.id} item={item}>
                                                    {item.type === 'strength' ? (
                                                        <StrengthCard
                                                            item={item}
                                                            onEdit={(programId) => onEditProgram?.(programId)}
                                                            onDelete={(e) => handleDeleteStrength(e, item.id)}
                                                        />
                                                    ) : (
                                                        <CardioCard
                                                            item={item}
                                                            getCardioSummary={getCardioSummary}
                                                            onEdit={() => setEditingSession(item)}
                                                            onDelete={(e) => handleDeleteCardio(e, item.id)}
                                                        />
                                                    )}
                                                </DraggableCard>
                                            ))}
                                        </>
                                    )}
                                </DroppableDay>
                            </div>
                        )
                    })}
                </div>

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

function StrengthCard({ item, onEdit, onDelete }: {
    item: UnifiedCalendarItem
    onEdit?: (programId: string) => void
    onDelete?: (e: React.MouseEvent) => void
}) {
    const isVirtual = item.id.startsWith('virtual-')
    const isProgramAuto = isVirtual || (item as any).is_program_auto === true
    const programId = (item as any).training_program_id
    const canDelete = !isVirtual // Only real DB rows can be deleted

    return (
        <Card className="border-red-500 text-white shadow-md transition-colors group relative overflow-hidden cursor-pointer bg-red-600 dark:bg-red-700 hover:bg-red-500 dark:hover:bg-red-600">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-200/50" />
            <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-1 py-0 h-4 border-none">
                            Fuerza
                        </Badge>
                        {isProgramAuto && (
                            <Badge className="text-[9px] bg-white/10 hover:bg-white/15 text-white/80 px-1 py-0 h-4 border border-white/20 font-medium tracking-wider">
                                AUTO
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {(item as any).is_completed && <CheckCircle2 className="h-3 w-3 text-white" />}

                        {/* 3-dot menu */}
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
                <div className="flex items-center gap-2 mb-1">
                    <Dumbbell className="h-4 w-4 text-white/90" />
                    <span className="font-bold text-sm line-clamp-1 text-white">
                        {(item as any).training_days?.order_index ? `Día ${(item as any).training_days.order_index}: ` : ''}{(item as any).training_days?.name || 'Día sin nombre'}
                    </span>
                </div>
                <p className="text-[10px] text-white/70 line-clamp-1">
                    {(item as any).training_programs?.name}
                </p>
            </CardContent>
        </Card>
    )
}

function CardioCard({
    item,
    getCardioSummary,
    onEdit,
    onDelete
}: {
    item: UnifiedCalendarItem & { type: 'cardio' }
    getCardioSummary: (item: UnifiedCalendarItem & { type: 'cardio' }) => string
    onEdit: () => void
    onDelete: (e: React.MouseEvent) => void
}) {
    const structure = item.structure as any
    const type = structure?.trainingType || 'rodaje'

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
                <div className="flex items-start justify-between mb-1">
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                        Cardio
                    </Badge>
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

                <p className="text-xs text-muted-foreground opacity-90 line-clamp-2 mt-1 whitespace-pre-line leading-relaxed">
                    {item.description || "Sin detalles"}
                </p>
                {structure?.notes && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2 line-clamp-1 italic border-t border-black/5 pt-1">
                        📝 {structure.notes}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
