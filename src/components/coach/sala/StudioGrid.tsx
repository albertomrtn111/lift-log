'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ListChecks, Minus, Plus, Search, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { StudioCellPanel, type CellTarget } from '@/components/coach/sala/StudioCellPanel'
import { StudioMobileSession } from '@/components/coach/sala/StudioMobileSession'
import { StudioRequestPanel } from '@/components/coach/sala/StudioRequestPanel'
import { StudioRoutinesPanel } from '@/components/coach/sala/StudioRoutinesPanel'
import { StudioNewSessionPanel, StudioSessionPanel } from '@/components/coach/sala/StudioSessionPanel'
import type { StudioGridData, StudioItem } from '@/data/studio'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioLive } from '@/hooks/useStudioLive'
import { readClip, writeClip, type StudioClip } from '@/lib/studio/clipboard'
import { clipFromCell, clipFromSession, clipItemFields, routinesBySession } from '@/lib/studio/copy-rules'
import { defaultSessionId, initials } from '@/lib/studio/editor-rules'
import {
    SESSION_STATUS_LABELS,
    STUDIO_PAST_SESSIONS,
    buildGrid,
    cellSummary,
    formatShortDate,
    prepareSessions,
} from '@/lib/studio/grid-rules'
import { addItemsAction, setItemDoneAction, undoLastAction } from '@/lib/studio/session-actions'
import { BLOCK_CATEGORY_LABELS } from '@/lib/training/exercise-catalog-rules'
import { cn } from '@/lib/utils'

const ZOOM_LEVELS = [
    { column: 'w-[104px] min-w-[104px]', text: 'text-[11px]' },
    { column: 'w-[132px] min-w-[132px]', text: 'text-xs' },
    { column: 'w-[172px] min-w-[172px]', text: 'text-sm' },
]

type Panel =
    | { type: 'new-session' }
    | { type: 'duplicate'; sessionId: string }
    | { type: 'session'; sessionId: string }
    | { type: 'cell'; target: CellTarget }
    | { type: 'requests'; sessionId: string }
    | { type: 'routines' }

export function StudioGrid({ data, today, currentUserId, olderPages }: {
    data: StudioGridData
    today: string
    currentUserId: string | null
    olderPages: number
}) {
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [onlyUsed, setOnlyUsed] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [panel, setPanel] = useState<Panel | null>(null)
    const isMobile = useIsMobile()
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
    const [doneShown, setDoneShown] = useState<Record<string, boolean>>({})
    const [isMarking, startMarking] = useTransition()
    const [clip, setClipState] = useState<StudioClip | null>(null)

    useEffect(() => setClipState(readClip()), [])

    function setClip(next: StudioClip | null) {
        setClipState(next)
        writeClip(next)
    }

    function copyCell(item: StudioItem) {
        setClip(clipFromCell(item) as StudioClip)
        toast.success('Copiado')
    }

    /** Lo copiado se usa una vez. */
    function pasteCell(sessionId: string, catalogExerciseId: string) {
        if (clip?.kind !== 'cell') return
        const { item } = clip
        startMarking(async () => {
            const result = await addItemsAction(sessionId, [clipItemFields(item, catalogExerciseId)], { origin: 'copy' })
            if (!result.success) return void toast.error(result.error)
            setClip(null)
            router.refresh()
        })
    }

    // Lo marcado se ve al momento; en cuanto llegan los datos, mandan ellos.
    useEffect(() => setDoneShown({}), [data.items])

    const pastLimit = STUDIO_PAST_SESSIONS * (olderPages + 1)
    const { sessions, olderCount } = useMemo(
        () => prepareSessions(data.sessions, today, pastLimit),
        [data.sessions, today, pastLimit]
    )

    const visibleItems = useMemo(() => {
        const ids = new Set(sessions.map(session => session.id))
        return data.items.filter(item => ids.has(item.session_id))
    }, [data.items, sessions])

    const groups = useMemo(
        () => buildGrid({ blocks: data.blocks, entries: data.entries, items: visibleItems, query, category, onlyUsed }),
        [data.blocks, data.entries, visibleItems, query, category, onlyUsed]
    )

    const categories = useMemo(() => {
        const used = new Set(data.blocks.map(block => block.category))
        return Object.entries(BLOCK_CATEGORY_LABELS).filter(([key]) => used.has(key))
    }, [data.blocks])

    const level = ZOOM_LEVELS[zoom]
    const mobileSessionId = sessions.some(session => session.id === selectedSessionId)
        ? selectedSessionId
        : defaultSessionId(sessions, today)
    const routineNames = useMemo(() => routinesBySession(data.items, data.routines), [data.items, data.routines])
    const openSession = panel && (panel.type === 'duplicate' || panel.type === 'session' || panel.type === 'requests')
        ? data.sessions.find(session => session.id === panel.sessionId) ?? null
        : null

    let openSessionId = openSession?.id ?? null
    if (panel?.type === 'cell') {
        const target = panel.target
        openSessionId = 'itemId' in target
            ? data.items.find(item => item.id === target.itemId)?.session_id ?? null
            : target.sessionId
    }

    const { viewers } = useStudioLive({
        clientId: data.client.id,
        userId: currentUserId,
        userName: (currentUserId && data.professionals[currentUserId]) || 'Otro profesional',
        openSessionId,
    })

    function undo() {
        startMarking(async () => {
            const result = await undoLastAction(data.client.id)
            if (!result.success) return void toast.error(result.error)
            if (result.data.status === 'undone') {
                router.refresh()
                toast.success('Deshecho')
            } else if (result.data.status === 'blocked') {
                toast.error('Alguien lo ha cambiado después: no se deshace para no pisar su trabajo.')
            } else {
                toast('No hay nada que deshacer')
            }
        })
    }

    // Atajos en la cuadrícula. Dentro de un panel o de un campo, Ctrl+Z, C y V siguen siendo los del texto.
    const shortcuts = useRef({ undo, copyCell, pasteCell, items: data.items })
    shortcuts.current = { undo, copyCell, pasteCell, items: data.items }
    const panelOpen = panel !== null
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (panelOpen || !(event.ctrlKey || event.metaKey) || event.shiftKey) return
            const element = event.target as HTMLElement
            if (element.closest('input, textarea, select, [contenteditable="true"]')) return
            const cell = element.closest<HTMLElement>('[data-sala-session]')
            const key = event.key.toLowerCase()
            if (key === 'z') {
                event.preventDefault()
                shortcuts.current.undo()
            } else if (key === 'c' && cell?.dataset.salaItem) {
                const item = shortcuts.current.items.find(entry => entry.id === cell.dataset.salaItem)
                if (item) {
                    event.preventDefault()
                    shortcuts.current.copyCell(item)
                }
            } else if (key === 'v' && cell) {
                event.preventDefault()
                shortcuts.current.pasteCell(cell.dataset.salaSession!, cell.dataset.salaExercise!)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [panelOpen])

    function toggleDone(item: StudioItem) {
        const done = !(doneShown[item.id] ?? item.is_done)
        setDoneShown(current => ({ ...current, [item.id]: done }))
        startMarking(async () => {
            const result = await setItemDoneAction(item.id, item.version, done)
            if (!result.success) {
                setDoneShown(current => {
                    const { [item.id]: _, ...rest } = current
                    return rest
                })
                toast.error(result.error)
            }
            router.refresh()
        })
    }

    function toggleBlock(key: string) {
        setCollapsed(current => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <section className="min-w-0 space-y-3" aria-label={`Sesiones de ${data.client.fullName}`}>
            <div>
                <h2 className="text-lg font-semibold">{data.client.fullName}</h2>
                {data.client.notes && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{data.client.notes}</p>
                )}
                {viewers.length > 0 && (
                    <p className="mt-1 text-sm text-primary">
                        También aquí: {viewers.map(viewer => viewer.name).join(', ')}
                    </p>
                )}
                {data.sessions.length === 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">Aún no tiene sesiones. Crea la primera con Nueva sesión.</p>
                )}
            </div>

            {!isMobile && (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[180px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="Buscar ejercicio o bloque…"
                                className="h-9 pl-9"
                                aria-label="Buscar ejercicio o bloque"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <Switch checked={onlyUsed} onCheckedChange={setOnlyUsed} aria-label="Solo los usados" />
                            Solo los usados
                        </label>
                        <Button size="sm" className="h-9" onClick={() => setPanel({ type: 'new-session' })}>
                            <Plus className="mr-1 h-4 w-4" /> Nueva sesión
                        </Button>
                        <Button size="sm" variant="outline" className="h-9" onClick={() => setPanel({ type: 'routines' })}>
                            <ListChecks className="mr-1 h-4 w-4" /> Rutinas
                        </Button>
                        <Button size="sm" variant="outline" className="h-9" disabled={isMarking} onClick={undo}>
                            <Undo2 className="mr-1 h-4 w-4" /> Deshacer
                        </Button>
                        <div className="flex items-center" role="group" aria-label="Tamaño de la cuadrícula">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9"
                                disabled={zoom === 0}
                                aria-label="Reducir"
                                onClick={() => setZoom(zoom - 1)}
                            >
                                <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9"
                                disabled={zoom === ZOOM_LEVELS.length - 1}
                                aria-label="Ampliar"
                                onClick={() => setZoom(zoom + 1)}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por categoría">
                        {[['', 'Todo'] as const, ...categories].map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={(category ?? '') === key}
                                onClick={() => setCategory(key || null)}
                                className={cn(
                                    'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                                    (category ?? '') === key
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {clip && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                        Copiado: <span className="font-medium">{clip.label}</span>
                        <span className="text-muted-foreground">
                            {clip.kind === 'cell' && !isMobile
                                ? ' · toca una celda vacía para pegarlo'
                                : ' · abre otra sesión, también de otro cliente, y pulsa Pegar aquí'}
                        </span>
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Vaciar lo copiado" onClick={() => setClip(null)}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {isMobile ? (
                <StudioMobileSession
                    data={data}
                    sessions={sessions}
                    sessionId={mobileSessionId}
                    doneShown={doneShown}
                    busy={isMarking}
                    onSelect={setSelectedSessionId}
                    onToggleDone={toggleDone}
                    onOpenSession={sessionId => setPanel({ type: 'session', sessionId })}
                    onOpenItem={itemId => setPanel({ type: 'cell', target: { itemId } })}
                    onNewSession={() => setPanel({ type: 'new-session' })}
                    onOpenRequests={sessionId => setPanel({ type: 'requests', sessionId })}
                    onUndo={undo}
                />
            ) : (
                <>
                    {olderCount > 0 && (
                        <Link
                            href={`/coach/sala?cliente=${data.client.id}&anteriores=${olderPages + 1}`}
                            className="inline-block text-sm font-medium text-primary hover:underline"
                        >
                            Ver anteriores ({olderCount})
                        </Link>
                    )}

                    <div className="max-h-[calc(100dvh-13rem)] overflow-auto rounded-lg border">
                        <table className={cn('border-separate border-spacing-0', level.text)}>
                            <thead>
                                <tr>
                                    <th
                                        scope="col"
                                        className="sticky left-0 top-0 z-30 w-[190px] min-w-[190px] border-b border-r bg-card p-2 text-left font-medium text-muted-foreground"
                                    >
                                        Ejercicio
                                    </th>
                                    {sessions.map(session => {
                                        const narrow = session.status === 'cancelled' || session.status === 'no_show'
                                        return (
                                            <th
                                                key={session.id}
                                                scope="col"
                                                className={cn(
                                                    'sticky top-0 z-20 border-b border-r bg-card p-0 text-left align-top font-normal',
                                                    narrow ? 'w-[64px] min-w-[64px]' : level.column,
                                                    session.isToday && 'bg-primary/10'
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    className="block h-full w-full p-2 text-left hover:bg-muted/60"
                                                    onClick={() => setPanel({ type: 'session', sessionId: session.id })}
                                                >
                                                    <span className="block font-semibold">
                                                        {session.number ? `Sesión ${session.number}` : SESSION_STATUS_LABELS[session.status as keyof typeof SESSION_STATUS_LABELS]}
                                                    </span>
                                                    <span className="block text-muted-foreground">{formatShortDate(session.session_date)}</span>
                                                    {!narrow && session.professional_id && data.professionals[session.professional_id] && (
                                                        <span className="block truncate text-muted-foreground">
                                                            {data.professionals[session.professional_id]}
                                                        </span>
                                                    )}
                                                    {!narrow && session.name && <span className="block truncate">{session.name}</span>}
                                                    <span className="mt-1 flex flex-wrap gap-1">
                                                        {session.isToday && <Badge className="px-1.5 py-0 text-[10px]">Hoy</Badge>}
                                                        {session.sameWeek > 1 && (
                                                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                                                {session.sameWeek} en la semana
                                                            </Badge>
                                                        )}
                                                        {viewers.filter(viewer => viewer.sessionId === session.id).map(viewer => (
                                                            <span
                                                                key={viewer.userId}
                                                                title={`${viewer.name} la tiene abierta`}
                                                                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                                                            >
                                                                {initials(viewer.name)}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </button>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.length > 0 && (
                                    <tr>
                                        <th scope="row" className="sticky left-0 z-10 border-b border-r bg-card p-2 text-left font-medium">Encargos</th>
                                        {sessions.map(session => {
                                            const requests = data.requests.filter(request => request.session_id === session.id)
                                            const pending = requests.filter(request => request.status === 'pending').length
                                            return (
                                                <td key={session.id} className="border-b border-r p-1 align-top">
                                                    <button
                                                        type="button"
                                                        aria-label={`Encargos de la sesión del ${formatShortDate(session.session_date)}`}
                                                        onClick={() => setPanel({ type: 'requests', sessionId: session.id })}
                                                        className={cn(
                                                            'min-h-7 w-full rounded px-1.5 py-1 text-left hover:bg-muted/60',
                                                            pending > 0 && 'bg-primary/10 font-semibold',
                                                            requests.length > 0 && pending === 0 && 'text-muted-foreground'
                                                        )}
                                                    >
                                                        {requests.length === 0 ? '' : pending > 0 ? `${pending} pendiente${pending > 1 ? 's' : ''}` : 'Hecho'}
                                                    </button>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )}
                                {sessions.length > 0 && data.routines.length > 0 && (
                                    <tr>
                                        <th scope="row" className="sticky left-0 z-10 border-b border-r bg-card p-2 text-left font-medium">Rutinas</th>
                                        {sessions.map(session => (
                                            <td key={session.id} className="border-b border-r p-1 align-top text-muted-foreground">
                                                <button
                                                    type="button"
                                                    aria-label={`Añadir una rutina a la sesión del ${formatShortDate(session.session_date)}`}
                                                    onClick={() => setPanel({ type: 'session', sessionId: session.id })}
                                                    className="min-h-7 w-full rounded px-1.5 py-1 text-left hover:bg-muted/60"
                                                >
                                                    {(routineNames.get(session.id) ?? []).join(' · ')}
                                                </button>
                                            </td>
                                        ))}
                                    </tr>
                                )}
                                {groups.map(({ block, rows }) => {
                                    const closed = collapsed.has(block.key)
                                    return (
                                        <Fragment key={block.key}>
                                            {block.groupTitle && (
                                                <tr>
                                                    <td colSpan={sessions.length + 1} className="px-2 pt-3 font-semibold uppercase tracking-wide text-primary">
                                                        <span className="sticky left-2">{block.groupTitle}</span>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <th colSpan={sessions.length + 1} scope="colgroup" className="border-b bg-muted/60 p-0 text-left">
                                                    <button
                                                        type="button"
                                                        aria-expanded={!closed}
                                                        onClick={() => toggleBlock(block.key)}
                                                        className="sticky left-0 flex min-h-8 items-center gap-1 px-2 font-semibold"
                                                    >
                                                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', closed && '-rotate-90')} />
                                                        {block.displayName}
                                                        <span className="font-normal text-muted-foreground">{rows.length}</span>
                                                    </button>
                                                </th>
                                            </tr>
                                            {!closed && rows.map((row: any) => (
                                                <Fragment key={row.catalogId}>
                                                    {row.groupTitle && (
                                                        <tr>
                                                            <td colSpan={sessions.length + 1} className="px-2 pt-2 font-semibold text-primary">
                                                                <span className="sticky left-2">{row.groupTitle}</span>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr>
                                                        <th
                                                            scope="row"
                                                            title={row.fullName}
                                                            className="sticky left-0 z-10 w-[190px] min-w-[190px] max-w-[190px] border-b border-r bg-card p-2 text-left font-medium"
                                                        >
                                                            <span className="line-clamp-2 break-words">{row.name}</span>
                                                        </th>
                                                        {sessions.map(session => {
                                                            const off = session.status === 'cancelled' || session.status === 'no_show'
                                                            const cellItems: StudioItem[] = row.items.filter((item: StudioItem) => item.session_id === session.id)
                                                            return (
                                                                <td
                                                                    key={session.id}
                                                                    className={cn(
                                                                        'border-b border-r p-1 align-top',
                                                                        session.isToday && 'bg-primary/5',
                                                                        off && 'bg-muted/40'
                                                                    )}
                                                                >
                                                                    {cellItems.map(item => (
                                                                        <Cell
                                                                            key={item.id}
                                                                            item={item}
                                                                            done={doneShown[item.id] ?? item.is_done}
                                                                            busy={isMarking}
                                                                            onOpen={() => setPanel({ type: 'cell', target: { itemId: item.id } })}
                                                                            onToggleDone={() => toggleDone(item)}
                                                                        />
                                                                    ))}
                                                                    {cellItems.length === 0 && !off && (
                                                                        <button
                                                                            type="button"
                                                                            aria-label={clip?.kind === 'cell' ? `Pegar en ${row.name}` : `Añadir ${row.name} a esta sesión`}
                                                                            data-sala-session={session.id}
                                                                            data-sala-exercise={row.catalogId}
                                                                            className={cn(
                                                                                'flex min-h-8 w-full items-center justify-center rounded text-primary hover:bg-muted/60 hover:opacity-100 focus-visible:opacity-100',
                                                                                clip?.kind === 'cell' ? 'opacity-40' : 'opacity-0'
                                                                            )}
                                                                            onClick={() => (clip?.kind === 'cell'
                                                                                ? pasteCell(session.id, row.catalogId)
                                                                                : setPanel({
                                                                                    type: 'cell',
                                                                                    target: { sessionId: session.id, catalogExerciseId: row.catalogId, exerciseName: row.fullName },
                                                                                }))}
                                                                        >
                                                                            <Plus className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                </Fragment>
                                            ))}
                                        </Fragment>
                                    )
                                })}
                                {groups.length === 0 && (
                                    <tr>
                                        <td colSpan={sessions.length + 1} className="p-6 text-center text-muted-foreground">
                                            No hay ejercicios con estos filtros.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {panel?.type === 'new-session' && (
                <StudioNewSessionPanel
                    data={data}
                    today={today}
                    currentUserId={currentUserId}
                    source={null}
                    onClose={() => setPanel(null)}
                    onCreated={sessionId => {
                        setSelectedSessionId(sessionId)
                        setPanel({ type: 'session', sessionId })
                    }}
                />
            )}
            {panel?.type === 'duplicate' && openSession && (
                <StudioNewSessionPanel
                    data={data}
                    today={today}
                    currentUserId={currentUserId}
                    source={openSession}
                    onClose={() => setPanel(null)}
                    onCreated={sessionId => {
                        setSelectedSessionId(sessionId)
                        setPanel({ type: 'session', sessionId })
                    }}
                />
            )}
            {panel?.type === 'session' && openSession && (
                <StudioSessionPanel
                    key={openSession.id}
                    data={data}
                    session={openSession}
                    clip={clip}
                    onClose={() => setPanel(null)}
                    onOpenItem={itemId => setPanel({ type: 'cell', target: { itemId } })}
                    onDuplicate={() => setPanel({ type: 'duplicate', sessionId: openSession.id })}
                    onCopy={entries => {
                        setClip(clipFromSession(openSession, entries, `Sesión del ${formatShortDate(openSession.session_date)}`) as StudioClip)
                        toast.success('Sesión copiada')
                    }}
                    onPasted={() => setClip(null)}
                />
            )}
            {panel?.type === 'requests' && openSession && (
                <StudioRequestPanel data={data} session={openSession} onClose={() => setPanel(null)} />
            )}
            {panel?.type === 'routines' && <StudioRoutinesPanel data={data} onClose={() => setPanel(null)} />}
            {panel?.type === 'cell' && (
                <StudioCellPanel
                    key={'itemId' in panel.target ? panel.target.itemId : `${panel.target.sessionId}:${panel.target.catalogExerciseId}`}
                    data={data}
                    target={panel.target}
                    onClose={() => setPanel(null)}
                    onCopy={item => {
                        copyCell(item)
                        setPanel(null)
                    }}
                />
            )}
        </section>
    )
}

function Cell({ item, done, busy, onOpen, onToggleDone }: {
    item: StudioItem
    done: boolean
    busy: boolean
    onOpen: () => void
    onToggleDone: () => void
}) {
    const summary = cellSummary(item)
    return (
        <div className={cn('relative mb-0.5 rounded last:mb-0', done ? 'bg-primary/10' : 'bg-muted/50')}>
            <button
                type="button"
                data-sala-item={item.id}
                data-sala-session={item.session_id}
                data-sala-exercise={item.catalog_exercise_id}
                className="block w-full rounded px-1.5 py-1 pr-7 text-left hover:ring-1 hover:ring-primary/40"
                onClick={onOpen}
                aria-label={`Editar ${item.exercise_name}: ${summary.volume || 'sin valores'}`}
            >
                <span className="block font-semibold">{summary.volume || '—'}</span>
                {summary.load && (
                    <span className="block">
                        {summary.load}
                        {summary.nextLoad && <span className="ml-1 font-semibold text-primary">{summary.nextLoad}</span>}
                    </span>
                )}
                {summary.details && <span className="block text-muted-foreground">{summary.details}</span>}
                {item.tags.length > 0 && <span className="block truncate text-muted-foreground">{item.tags.join(' · ')}</span>}
                {item.circuit.length > 0 && (
                    <span className="block truncate text-muted-foreground">{item.circuit.join(' · ')}</span>
                )}
                {item.note && <span className="block truncate text-muted-foreground" title={item.note}>{item.note}</span>}
            </button>
            <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={`${item.exercise_name} realizado`}
                disabled={busy}
                onClick={onToggleDone}
                className={cn(
                    'absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded border',
                    done ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-transparent hover:text-muted-foreground'
                )}
            >
                <Check className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
