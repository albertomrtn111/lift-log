'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Copy, GripVertical, Home, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Ruler, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { METRICS, type Dimension } from '@/lib/analytics/catalog'
import { loadStart, resolveRange, runWidget, type AnalyticsFacts, type BoardFilters } from '@/lib/analytics/engine'
import type { AnalyticsPage, AnalyticsWidget, BoardFilterState, WidgetDraft, WidgetHeight, WidgetWidth } from '@/types/analytics'
import {
    createBoard, createWidget, deleteBoard, deleteWidget, duplicateBoard, fetchAnalyticsFacts, fetchBoardWidgets,
    reorderWidgets, restoreBoard, setHomeBoard, updateBoard, updateWidget,
} from '@/app/(coach)/coach/analytics/actions'
import { BoardToolbar } from './BoardToolbar'
import { WidgetBuilder } from './WidgetBuilder'
import { WidgetChart } from './WidgetChart'

// En móvil los pequeños van de dos en dos y el resto a todo el ancho
const SPAN: Record<WidgetWidth, string> = {
    3: 'col-span-1 md:col-span-6 xl:col-span-3',
    4: 'col-span-2 md:col-span-6 xl:col-span-4',
    6: 'col-span-2 md:col-span-6',
    8: 'col-span-2 md:col-span-12 xl:col-span-8',
    12: 'col-span-2 md:col-span-12',
}

const WIDTH_LABELS: Record<WidgetWidth, string> = { 3: 'Pequeño', 4: 'Un tercio', 6: 'Mitad', 8: 'Dos tercios', 12: 'Ancho completo' }
const HEIGHT_LABELS: Record<WidgetHeight, string> = { sm: 'Bajo', md: 'Medio', lg: 'Alto' }

const NEW_BOARD_FILTERS: BoardFilterState = { period: '12w', from: null, to: null, status: 'active', athleteIds: [], athleteMode: 'all' }

function draftOf(widget: AnalyticsWidget): WidgetDraft {
    return { title: widget.title, metric: widget.metric, visual: widget.visual, dimensions: widget.dimensions, filters: widget.filters, options: widget.options, layout: widget.layout }
}

/** Filtros comparables para saber si hay cambios sin guardar (el atleta elegido no cuenta) */
function savedShape(filters: BoardFilterState) {
    return JSON.stringify({ ...filters, athleteIds: filters.athleteMode === 'single' ? [] : [...filters.athleteIds].sort() })
}

function WidgetCard({ widget, facts, filters, onEdit, onDuplicate, onDelete, onResize, onCategoryClick, dragging, dropTarget, dragHandlers }: {
    widget: AnalyticsWidget
    facts: AnalyticsFacts
    filters: BoardFilters
    onEdit: () => void
    onDuplicate: () => void
    onDelete: () => void
    onResize: (layout: AnalyticsWidget['layout']) => void
    onCategoryClick: (dimension: Dimension, key: string) => void
    dragging: boolean
    dropTarget: boolean
    dragHandlers: React.HTMLAttributes<HTMLDivElement>
}) {
    const result = useMemo(() => runWidget(facts, widget, filters), [facts, widget, filters])
    return (
        <Card
            {...dragHandlers}
            className={cn('group min-w-0 p-3 transition-shadow sm:p-4', SPAN[widget.layout.w], dragging && 'opacity-40', dropTarget && 'ring-2 ring-primary')}
        >
            <div className="mb-2 flex items-start gap-1.5">
                <span draggable className="-ml-1.5 mt-0.5 hidden cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing md:block" title="Arrastra para mover" data-drag-handle>
                    <GripVertical className="h-4 w-4" />
                </span>
                <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={METRICS[widget.metric]?.description}>
                    <h3 className="truncate text-sm font-semibold hover:text-primary">{widget.title || METRICS[widget.metric]?.label}</h3>
                </button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Opciones del gráfico" className="-mr-1 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger><Ruler className="mr-2 h-4 w-4" />Tamaño</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={String(widget.layout.w)} onValueChange={value => onResize({ ...widget.layout, w: Number(value) as WidgetWidth })}>
                                    {(Object.keys(WIDTH_LABELS) as unknown as WidgetWidth[]).map(width => (
                                        <DropdownMenuRadioItem key={width} value={String(width)}>{WIDTH_LABELS[width]}</DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuRadioGroup value={widget.layout.h} onValueChange={value => onResize({ ...widget.layout, h: value as WidgetHeight })}>
                                    {(Object.keys(HEIGHT_LABELS) as WidgetHeight[]).map(height => (
                                        <DropdownMenuRadioItem key={height} value={height}>Alto: {HEIGHT_LABELS[height]}</DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Quitar del tablero</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <WidgetChart result={result} visual={widget.visual} height={widget.layout.h} onCategoryClick={onCategoryClick} />
        </Card>
    )
}

function BoardNameDialog({ open, onOpenChange, title, initialName, withMode, onSubmit }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    initialName: string
    withMode: boolean
    onSubmit: (name: string, mode: 'all' | 'single') => Promise<void>
}) {
    const [name, setName] = useState(initialName)
    const [mode, setMode] = useState<'all' | 'single'>('all')
    const [busy, setBusy] = useState(false)
    useEffect(() => { if (open) { setName(initialName); setMode('all') } }, [open, initialName])
    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!name.trim()) return
        setBusy(true)
        await onSubmit(name.trim(), mode)
        setBusy(false)
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {withMode && <DialogDescription>Un tablero agrupa gráficos con los mismos filtros de atletas y fechas.</DialogDescription>}
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="board-name">Nombre</Label>
                        <Input id="board-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} autoFocus placeholder="Ej.: Fuerza tren inferior" />
                    </div>
                    {withMode && (
                        <div className="grid grid-cols-2 gap-2">
                            {([['all', 'Varios atletas', 'Compara la cartera o un grupo'], ['single', 'Un atleta cada vez', 'Con anterior / siguiente']] as const).map(([value, label, hint]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={mode === value}
                                    onClick={() => setMode(value)}
                                    className={cn('rounded-lg border p-3 text-left text-sm', mode === value ? 'border-primary bg-primary/10' : 'border-border/70 hover:bg-muted')}
                                >
                                    <span className="block font-medium">{label}</span>
                                    <span className="text-xs text-muted-foreground">{hint}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={busy || !name.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export function BoardView({ initialPages, initialPageId, initialWidgets, initialFacts, initialAthleteId }: {
    initialPages: AnalyticsPage[]
    initialPageId: string
    initialWidgets: AnalyticsWidget[]
    initialFacts: AnalyticsFacts
    initialAthleteId: string | null
}) {
    const [pages, setPages] = useState(initialPages)
    const [pageId, setPageId] = useState(initialPageId)
    const [widgets, setWidgets] = useState(initialWidgets)
    const [facts, setFacts] = useState(initialFacts)
    const page = pages.find(item => item.id === pageId) ?? pages[0]
    const [filters, setFilters] = useState<BoardFilterState>(() => ({
        ...page.filters,
        athleteIds: page.filters.athleteMode === 'single' && initialAthleteId ? [initialAthleteId] : page.filters.athleteIds,
    }))
    const [loadingWidgets, setLoadingWidgets] = useState(false)
    const [loadingFacts, setLoadingFacts] = useState(false)
    const [savingFilters, setSavingFilters] = useState(false)
    const [builder, setBuilder] = useState<{ open: boolean; editing: AnalyticsWidget | null }>({ open: false, editing: null })
    const [nameDialog, setNameDialog] = useState<null | 'create' | 'rename'>(null)
    const [confirm, setConfirm] = useState<null | { title: string; description: string; action: () => Promise<void> }>(null)
    const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)
    const factsRequest = useRef(0)

    // Atletas que se pueden elegir: los del estado del filtro, por nombre
    const athletes = useMemo(() => facts.athletes
        .filter(athlete => filters.status === 'all' || athlete.status === filters.status)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')), [facts.athletes, filters.status])
    const singleAthleteId = filters.athleteMode === 'single'
        ? (filters.athleteIds[0] && facts.athletes.some(athlete => athlete.id === filters.athleteIds[0]) ? filters.athleteIds[0] : athletes[0]?.id ?? null)
        : null

    const engineFilters: BoardFilters = useMemo(() => ({
        period: filters.period,
        from: filters.from,
        to: filters.to,
        status: filters.status,
        athleteIds: filters.athleteMode === 'single' ? (singleAthleteId ? [singleAthleteId] : ['__none__']) : filters.athleteIds,
    }), [filters, singleAthleteId])

    const dirty = savedShape(filters) !== savedShape(page.filters)

    // Un periodo más largo que lo cargado pide más hechos al servidor
    useEffect(() => {
        const since = loadStart(resolveRange(engineFilters, facts.today))
        if (since >= facts.loadedFrom) return
        const request = ++factsRequest.current
        setLoadingFacts(true)
        fetchAnalyticsFacts(since).then(result => {
            if (request !== factsRequest.current) return
            setLoadingFacts(false)
            if (result.success) setFacts(result.data)
            else toast.error(result.error)
        })
    }, [engineFilters, facts.today, facts.loadedFrom])

    // La URL guarda el tablero y el atleta para volver o compartir
    useEffect(() => {
        const params = new URLSearchParams({ board: pageId })
        if (singleAthleteId) params.set('athlete', singleAthleteId)
        window.history.replaceState(null, '', `/coach/analytics?${params}`)
    }, [pageId, singleAthleteId])

    const selectAthlete = useCallback((id: string) => setFilters(current => ({ ...current, athleteIds: [id] })), [])

    // ← y → recorren los atletas en los tableros de un atleta
    useEffect(() => {
        if (filters.athleteMode !== 'single') return
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            if (event.metaKey || event.ctrlKey || event.altKey || builder.open || target?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], [role="dialog"]')) return
            const index = athletes.findIndex(athlete => athlete.id === singleAthleteId)
            if (event.key === 'ArrowLeft' && index > 0) selectAthlete(athletes[index - 1].id)
            if (event.key === 'ArrowRight' && index >= 0 && index < athletes.length - 1) selectAthlete(athletes[index + 1].id)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [filters.athleteMode, athletes, singleAthleteId, builder.open, selectAthlete])

    const openBoard = useCallback(async (target: AnalyticsPage, athleteId?: string) => {
        setPageId(target.id)
        setFilters({
            ...target.filters,
            athleteIds: target.filters.athleteMode === 'single' ? (athleteId ? [athleteId] : singleAthleteId ? [singleAthleteId] : []) : target.filters.athleteIds,
        })
        setLoadingWidgets(true)
        const result = await fetchBoardWidgets(target.id)
        setLoadingWidgets(false)
        if (result.success) setWidgets(result.data)
        else toast.error(result.error)
    }, [singleAthleteId])

    // Clic en un atleta de cualquier gráfico: su tablero de atleta
    const onCategoryClick = useCallback((dimension: Dimension, key: string) => {
        if (dimension !== 'athlete') return
        if (filters.athleteMode === 'single') return selectAthlete(key)
        const athleteBoard = pages.find(item => item.filters.athleteMode === 'single')
        if (athleteBoard) void openBoard(athleteBoard, key)
        else setFilters(current => ({ ...current, athleteIds: [key] }))
    }, [filters.athleteMode, pages, openBoard, selectAthlete])

    const replacePage = (updated: AnalyticsPage) => setPages(current => current.map(item => (item.id === updated.id ? updated : item)))

    const saveFilters = async () => {
        setSavingFilters(true)
        const result = await updateBoard(page.id, { filters: { ...filters, athleteIds: filters.athleteMode === 'single' ? [] : filters.athleteIds } })
        setSavingFilters(false)
        if (result.success) { replacePage(result.data); toast.success('Filtros guardados en el tablero') }
        else toast.error(result.error)
    }

    const saveWidget = async (draft: WidgetDraft) => {
        const editing = builder.editing
        const result = editing ? await updateWidget(editing.id, draft) : await createWidget(page.id, draft)
        if (!result.success) { toast.error(result.error); return false }
        setWidgets(current => (editing ? current.map(item => (item.id === editing.id ? result.data : item)) : [...current, result.data]))
        return true
    }

    const duplicateWidget = async (widget: AnalyticsWidget) => {
        const result = await createWidget(page.id, { ...draftOf(widget), title: `${widget.title} (copia)`.slice(0, 120) })
        if (!result.success) return toast.error(result.error)
        // La copia va justo detrás del original
        const ordered = [...widgets]
        ordered.splice(ordered.findIndex(item => item.id === widget.id) + 1, 0, result.data)
        setWidgets(ordered)
        void reorderWidgets(page.id, ordered.map(item => item.id))
    }

    const resizeWidget = async (widget: AnalyticsWidget, layout: AnalyticsWidget['layout']) => {
        setWidgets(current => current.map(item => (item.id === widget.id ? { ...item, layout } : item)))
        const result = await updateWidget(widget.id, { ...draftOf(widget), layout })
        if (!result.success) toast.error(result.error)
    }

    const removeWidget = (widget: AnalyticsWidget) => setConfirm({
        title: 'Quitar gráfico',
        description: `"${widget.title || METRICS[widget.metric]?.label}" se quitará de este tablero.`,
        action: async () => {
            const previous = widgets
            setWidgets(current => current.filter(item => item.id !== widget.id))
            const result = await deleteWidget(widget.id)
            if (!result.success) { setWidgets(previous); toast.error(result.error) }
        },
    })

    const dropOn = (targetId: string) => {
        if (!drag || drag.id === targetId) return setDrag(null)
        const ordered = widgets.filter(item => item.id !== drag.id)
        const moved = widgets.find(item => item.id === drag.id)!
        ordered.splice(ordered.findIndex(item => item.id === targetId), 0, moved)
        setWidgets(ordered)
        setDrag(null)
        reorderWidgets(page.id, ordered.map(item => item.id)).then(result => { if (!result.success) toast.error(result.error) })
    }

    const submitName = async (name: string, mode: 'all' | 'single') => {
        if (nameDialog === 'rename') {
            const result = await updateBoard(page.id, { name })
            if (!result.success) return void toast.error(result.error)
            replacePage(result.data)
        } else {
            const result = await createBoard(name, { ...NEW_BOARD_FILTERS, athleteMode: mode })
            if (!result.success) return void toast.error(result.error)
            setPages(current => [...current, result.data])
            setPageId(result.data.id)
            setFilters({ ...result.data.filters, athleteIds: mode === 'single' && singleAthleteId ? [singleAthleteId] : [] })
            setWidgets([])
        }
        setNameDialog(null)
    }

    const boardActions = {
        duplicate: async () => {
            const result = await duplicateBoard(page.id)
            if (!result.success) return toast.error(result.error)
            setPages(current => [...current, result.data])
            void openBoard(result.data)
            toast.success('Tablero duplicado')
        },
        setHome: async () => {
            const result = await setHomeBoard(page.id)
            if (!result.success) return toast.error(result.error)
            setPages(current => current.map(item => ({ ...item, isHome: item.id === page.id })))
            toast.success('Es tu tablero de inicio')
        },
        restore: () => setConfirm({
            title: 'Restaurar tablero de ejemplo',
            description: 'Se sustituyen sus gráficos y filtros por los originales. Los cambios que le hayas hecho se pierden.',
            action: async () => {
                const result = await restoreBoard(page.id)
                if (!result.success) return void toast.error(result.error)
                replacePage(result.data.page)
                setWidgets(result.data.widgets)
                setFilters(current => ({ ...result.data.page.filters, athleteIds: result.data.page.filters.athleteMode === 'single' ? current.athleteIds : [] }))
            },
        }),
        remove: () => setConfirm({
            title: 'Eliminar tablero',
            description: `"${page.name}" y sus ${widgets.length} gráficos se eliminarán.`,
            action: async () => {
                const result = await deleteBoard(page.id)
                if (!result.success) return void toast.error(result.error)
                const rest = pages.filter(item => item.id !== page.id)
                setPages(rest)
                const next = rest.find(item => item.isHome) ?? rest[0]
                if (next) void openBoard(next)
            },
        }),
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <nav aria-label="Tableros" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                    {pages.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            aria-current={item.id === page.id ? 'page' : undefined}
                            onClick={() => item.id !== page.id && openBoard(item)}
                            className={cn(
                                'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                                item.id === page.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {item.isHome && <Home className="h-3.5 w-3.5" />}
                            {item.name}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setNameDialog('create')}
                        className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <Plus className="h-4 w-4" /> Tablero
                    </button>
                </nav>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Opciones del tablero">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => setNameDialog('rename')}><Pencil className="mr-2 h-4 w-4" />Renombrar</DropdownMenuItem>
                        <DropdownMenuItem onClick={boardActions.duplicate}><Copy className="mr-2 h-4 w-4" />Duplicar tablero</DropdownMenuItem>
                        {!page.isHome && <DropdownMenuItem onClick={boardActions.setHome}><Home className="mr-2 h-4 w-4" />Abrir al entrar en Analítica</DropdownMenuItem>}
                        {page.isSystem && <DropdownMenuItem onClick={boardActions.restore}><RotateCcw className="mr-2 h-4 w-4" />Restaurar ejemplo</DropdownMenuItem>}
                        {!page.isSystem && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={boardActions.remove} className="text-red-600 focus:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Eliminar tablero</DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button className="h-9 shrink-0 rounded-full px-3 sm:px-4" onClick={() => setBuilder({ open: true, editing: null })} aria-label="Añadir gráfico">
                    <Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Añadir gráfico</span>
                </Button>
            </div>

            <BoardToolbar
                filters={filters}
                onChange={setFilters}
                athletes={athletes}
                singleAthleteId={singleAthleteId}
                onSingleAthlete={selectAthlete}
                dirty={dirty}
                saving={savingFilters}
                onSaveFilters={saveFilters}
                loadingFacts={loadingFacts}
            />

            {loadingWidgets ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : widgets.length === 0 ? (
                <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
                    <p className="font-semibold">Este tablero está vacío</p>
                    <p className="max-w-md text-sm text-muted-foreground">Añade un gráfico: elige una métrica (e1RM, series, peso, km de cardio…), cómo agruparla y cómo verla.</p>
                    <Button onClick={() => setBuilder({ open: true, editing: null })}><Plus className="mr-1.5 h-4 w-4" /> Añadir gráfico</Button>
                </Card>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
                    {widgets.map(widget => (
                        <WidgetCard
                            key={widget.id}
                            widget={widget}
                            facts={facts}
                            filters={engineFilters}
                            onEdit={() => setBuilder({ open: true, editing: widget })}
                            onDuplicate={() => duplicateWidget(widget)}
                            onDelete={() => removeWidget(widget)}
                            onResize={layout => resizeWidget(widget, layout)}
                            onCategoryClick={onCategoryClick}
                            dragging={drag?.id === widget.id}
                            dropTarget={!!drag && drag.over === widget.id && drag.id !== widget.id}
                            dragHandlers={{
                                onDragStart: event => {
                                    if (!(event.target as HTMLElement).closest('[data-drag-handle]')) return event.preventDefault()
                                    event.dataTransfer.effectAllowed = 'move'
                                    setDrag({ id: widget.id, over: null })
                                },
                                onDragOver: event => { if (drag) { event.preventDefault(); if (drag.over !== widget.id) setDrag({ ...drag, over: widget.id }) } },
                                onDrop: event => { event.preventDefault(); dropOn(widget.id) },
                                onDragEnd: () => setDrag(null),
                            }}
                        />
                    ))}
                </div>
            )}

            <WidgetBuilder
                open={builder.open}
                onOpenChange={open => setBuilder(current => ({ ...current, open }))}
                initial={builder.editing ? draftOf(builder.editing) : null}
                facts={facts}
                filters={engineFilters}
                onSave={saveWidget}
            />

            <BoardNameDialog
                open={nameDialog !== null}
                onOpenChange={open => { if (!open) setNameDialog(null) }}
                title={nameDialog === 'rename' ? 'Renombrar tablero' : 'Nuevo tablero'}
                initialName={nameDialog === 'rename' ? page.name : ''}
                withMode={nameDialog === 'create'}
                onSubmit={submitName}
            />

            <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => { const action = confirm?.action; setConfirm(null); await action?.() }}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
