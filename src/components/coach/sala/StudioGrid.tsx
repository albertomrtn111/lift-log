'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronsLeftRight, ChevronsRightLeft, ClipboardList, ListChecks, Minus, Paperclip, Plus, Search, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { StudioCellPanel, type CellTarget } from '@/components/coach/sala/StudioCellPanel'
import { StudioClientFilePanel } from '@/components/coach/sala/StudioClientFilePanel'
import { StudioGroupPanel } from '@/components/coach/sala/StudioGroupPanel'
import { StudioMobileSession } from '@/components/coach/sala/StudioMobileSession'
import { StudioMyJumpImport } from '@/components/coach/sala/StudioMyJumpImport'
import { birthdayInfo } from '@/lib/studio/client-rules'
import { toggleNarrow } from '@/lib/studio/session-text-rules'
import { StudioReportPanel } from '@/components/coach/sala/StudioReportPanel'
import { StudioRequestPanel } from '@/components/coach/sala/StudioRequestPanel'
import { StudioRoutinesPanel } from '@/components/coach/sala/StudioRoutinesPanel'
import { StudioNewSessionPanel, StudioSessionPanel } from '@/components/coach/sala/StudioSessionPanel'
import type { StudioClientSummary, StudioGridData, StudioGroupSummary, StudioItem } from '@/data/studio'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioLive } from '@/hooks/useStudioLive'
import { readClip, writeClip, type StudioClip } from '@/lib/studio/clipboard'
import { groupCellLine, peopleLines, scheduleLabel } from '@/lib/studio/group-rules'
import { exercisesWithMedia } from '@/lib/studio/media-rules'
import { clipFromCell, clipFromSession, clipItemFields, routinesBySession } from '@/lib/studio/copy-rules'
import { defaultSessionId, initials } from '@/lib/studio/editor-rules'
import {
    SESSION_STATUS_LABELS,
    STUDIO_PAST_SESSIONS,
    autoCollapsedBlocks,
    buildGrid,
    cellSummary,
    formatShortDate,
    orderBlocks,
    prepareSessions,
} from '@/lib/studio/grid-rules'
import {
    addItemsAction,
    setBlockCollapsedAction,
    setBlockOrderAction,
    setItemDoneAction,
    undoLastAction,
} from '@/lib/studio/session-actions'
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
    | { type: 'file' }
    | { type: 'group' }
    | { type: 'report'; sessionId: string }

export function StudioGrid({ data, today, currentUserId, olderPages, clients, allGroups }: {
    data: StudioGridData
    today: string
    currentUserId: string | null
    olderPages: number
    clients: StudioClientSummary[]
    allGroups: StudioGroupSummary[]
}) {
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [onlyUsed, setOnlyUsed] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [chosenCollapse, setChosenCollapse] = useState<Record<string, boolean>>({})
    const [panel, setPanel] = useState<Panel | null>(null)
    const isMobile = useIsMobile()
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
    const [doneShown, setDoneShown] = useState<Record<string, boolean>>({})
    // Sesiones estrechadas a mano: se recuerdan en este navegador, por cliente o grupo.
    const [narrowSaved, setNarrowSaved] = useState<Record<string, string[]>>({})
    useEffect(() => {
        try {
            setNarrowSaved(JSON.parse(localStorage.getItem(NARROW_KEY) ?? '{}') ?? {})
        } catch {
            setNarrowSaved({})
        }
    }, [])
    const narrowIds = new Set(narrowSaved[data.client.id] ?? [])
    function toggleNarrowSession(sessionId: string) {
        const next = toggleNarrow(narrowSaved, data.client.id, sessionId)
        setNarrowSaved(next)
        try { localStorage.setItem(NARROW_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento, solo para esta visita */ }
    }
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

    const orderedBlocks = useMemo(() => orderBlocks(data.blocks, data.blockPrefs), [data.blocks, data.blockPrefs])
    const withMedia = useMemo(() => exercisesWithMedia(data.media), [data.media])

    const groups = useMemo(
        () => buildGrid({ blocks: orderedBlocks, entries: data.entries, items: visibleItems, query, category, onlyUsed }),
        [orderedBlocks, data.entries, visibleItems, query, category, onlyUsed]
    )

    const autoCollapsed = useMemo(() => autoCollapsedBlocks({
        blockKeys: data.blocks.map(block => block.key),
        sessions: data.sessions,
        items: data.items,
        today,
        recentBlocks: data.recentBlocks,
    }), [data.blocks, data.sessions, data.items, today, data.recentBlocks])

    // Lo elegido a mano manda; al buscar se abre todo para no esconder lo que se busca.
    function isCollapsed(key: string) {
        if (query.trim()) return false
        return chosenCollapse[key]
            ?? data.blockPrefs.find(pref => pref.block_key === key)?.collapsed
            ?? autoCollapsed.has(key)
    }

    const categories = useMemo(() => {
        const used = new Set(data.blocks.map(block => block.category))
        return Object.entries(BLOCK_CATEGORY_LABELS).filter(([key]) => used.has(key))
    }, [data.blocks])

    const level = ZOOM_LEVELS[zoom]
    const activeMembers = data.group?.members.filter(member => member.active) ?? []
    const memberNames = Object.fromEntries((data.group?.members ?? []).map(member => [member.id, member.name]))
    const mobileSessionId = sessions.some(session => session.id === selectedSessionId)
        ? selectedSessionId
        : defaultSessionId(sessions, today)
    const routineNames = useMemo(() => routinesBySession(data.items, data.routines), [data.items, data.routines])
    const openSession = panel && (panel.type === 'duplicate' || panel.type === 'session' || panel.type === 'requests' || panel.type === 'report')
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
        const collapsed = !isCollapsed(key)
        setChosenCollapse(current => ({ ...current, [key]: collapsed }))
        if (key === 'sin-bloque' || data.group) return
        void setBlockCollapsedAction(data.client.id, key, collapsed).then(result => {
            if (!result.success) toast.error(result.error)
        })
    }

    /** Sube o baja un bloque solo para este cliente. */
    function moveBlock(key: string, direction: number) {
        const keys: string[] = orderedBlocks.map((block: { key: string }) => block.key)
        const from = keys.indexOf(key)
        const to = from + direction
        if (from < 0 || to < 0 || to >= keys.length) return
        keys.splice(from, 1)
        keys.splice(to, 0, key)
        startMarking(async () => {
            const result = await setBlockOrderAction(data.client.id, keys)
            if (!result.success) return void toast.error(result.error)
            router.refresh()
        })
    }

    return (
        <section className="min-w-0 space-y-3" aria-label={`Sesiones de ${data.client.fullName}`}>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{data.client.fullName}</h2>
                    {data.group ? (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setPanel({ type: 'group' })}>
                            <ClipboardList className="mr-1 h-3.5 w-3.5" /> Gestionar
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setPanel({ type: 'file' })}>
                            <ClipboardList className="mr-1 h-3.5 w-3.5" /> Ficha
                        </Button>
                    )}
                    {data.activeInjuries > 0 && (
                        <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                            {data.activeInjuries} {data.activeInjuries === 1 ? 'lesión activa' : 'lesiones activas'}
                        </Badge>
                    )}
                </div>
                {!data.group && <ClientFacts birthday={data.client.birthday} objectives={data.client.objectives} today={today} />}
                {data.client.notes && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{data.client.notes}</p>
                )}
                {data.group && (
                    <p className="text-sm text-muted-foreground">
                        {[`${activeMembers.length} personas`, scheduleLabel(data.group.schedule)].filter(Boolean).join(' · ')}
                    </p>
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
                        {!data.group && (
                            <StudioMyJumpImport
                                clients={[{ id: data.client.id, name: data.client.fullName }]}
                                fixedClientId={data.client.id}
                                library={data.entries}
                            />
                        )}
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
                            href={`/coach/sala?${data.group ? 'grupo' : 'cliente'}=${data.client.id}&anteriores=${olderPages + 1}`}
                            className="inline-block text-sm font-medium text-primary hover:underline"
                        >
                            Ver anteriores ({olderCount})
                        </Link>
                    )}

                    <div className="max-h-[calc(100dvh-13rem)] overflow-auto rounded-lg border">
                        {/* data-nt-plain: sus cabeceras llevan sesión, fecha y entrenador; no van en el estilo de rótulo de la base */}
                        <table data-nt-plain="" className={cn('border-separate border-spacing-0', level.text)}>
                            <thead>
                                <tr>
                                    <th
                                        scope="col"
                                        className="sticky left-0 top-0 z-30 w-[190px] min-w-[190px] border-b border-r bg-card p-2 text-left font-medium text-muted-foreground"
                                    >
                                        Ejercicio
                                    </th>
                                    {sessions.map(session => {
                                        const off = session.status === 'cancelled' || session.status === 'no_show'
                                        const narrow = off || narrowIds.has(session.id)
                                        return (
                                            <th
                                                key={session.id}
                                                scope="col"
                                                className={cn(
                                                    'sticky top-0 z-20 border-b border-r bg-card p-0 text-left align-top font-normal',
                                                    narrow ? 'w-[64px] min-w-[64px] max-w-[64px]' : level.column,
                                                    session.isToday && 'bg-primary/10'
                                                )}
                                            >
                                                {!off && (
                                                    <button
                                                        type="button"
                                                        className="absolute right-0.5 top-0.5 z-10 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        aria-label={narrow ? `Ensanchar la sesión del ${formatShortDate(session.session_date)}` : `Estrechar la sesión del ${formatShortDate(session.session_date)}`}
                                                        title={narrow ? 'Ensanchar' : 'Estrechar'}
                                                        onClick={() => toggleNarrowSession(session.id)}
                                                    >
                                                        {narrow ? <ChevronsLeftRight className="h-3 w-3" /> : <ChevronsRightLeft className="h-3 w-3" />}
                                                    </button>
                                                )}
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
                                                        {session.group_id && !data.group && session.group_name && (
                                                            <Badge variant="secondary" className="max-w-full truncate px-1.5 py-0 text-[10px]">{session.group_name}</Badge>
                                                        )}
                                                        {data.group && data.attendance
                                                            .filter(entry => entry.session_id === session.id && entry.status === 'attended')
                                                            .map(entry => (
                                                                <span
                                                                    key={entry.client_id}
                                                                    title={memberNames[entry.client_id]}
                                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                                                                >
                                                                    {initials(memberNames[entry.client_id] ?? '?')}
                                                                </span>
                                                            ))}
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
                                    const closed = isCollapsed(block.key)
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
                                                    <div className="sticky left-0 flex w-fit items-center gap-1">
                                                        <button
                                                        type="button"
                                                        aria-expanded={!closed}
                                                        onClick={() => toggleBlock(block.key)}
                                                        className="flex min-h-8 items-center gap-1 px-2 font-semibold"
                                                    >
                                                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', closed && '-rotate-90')} />
                                                        {block.displayName}
                                                        <span className="font-normal text-muted-foreground">{rows.length}</span>
                                                    </button>
                                                        {block.key !== 'sin-bloque' && !data.group && (
                                                            <>
                                                                <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Subir ${block.displayName} para este cliente`} title="Solo para este cliente" disabled={isMarking} onClick={() => moveBlock(block.key, -1)}>
                                                                    <ArrowUp className="h-3 w-3" />
                                                                </button>
                                                                <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Bajar ${block.displayName} para este cliente`} title="Solo para este cliente" disabled={isMarking} onClick={() => moveBlock(block.key, 1)}>
                                                                    <ArrowDown className="h-3 w-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
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
                                                            {withMedia.has(row.catalogId) && (
                                                                <span className="block text-[11px] font-normal text-primary">▶ técnica</span>
                                                            )}
                                                        </th>
                                                        {sessions.map(session => {
                                                            const off = session.status === 'cancelled' || session.status === 'no_show'
                                                            const narrow = off || narrowIds.has(session.id)
                                                            const cellItems: StudioItem[] = row.items.filter((item: StudioItem) => item.session_id === session.id)
                                                            // Una clase se cambia en su grupo: aquí solo se ve lo de esta persona.
                                                            const fromGroup = Boolean(session.group_id) && !data.group
                                                            return (
                                                                <td
                                                                    key={session.id}
                                                                    className={cn(
                                                                        'border-b border-r p-1 align-top',
                                                                        narrow && 'max-w-[64px] overflow-hidden',
                                                                        session.isToday && 'bg-primary/5',
                                                                        off && 'bg-muted/40'
                                                                    )}
                                                                >
                                                                    {cellItems.map(item => (
                                                                        <Cell
                                                                            key={item.id}
                                                                            compact={narrow}
                                                                            item={item}
                                                                            done={doneShown[item.id] ?? item.is_done}
                                                                            busy={isMarking}
                                                                            readOnly={fromGroup}
                                                                            groupLine={data.group ? groupCellLine(item, data.attendance, data.people) : ''}
                                                                            people={data.group ? peopleLines(item, data.people, memberNames) : []}
                                                                            onOpen={() => (fromGroup
                                                                                ? router.push(`/coach/sala?grupo=${session.group_id}`)
                                                                                : setPanel({ type: 'cell', target: { itemId: item.id } }))}
                                                                            onToggleDone={() => toggleDone(item)}
                                                                        />
                                                                    ))}
                                                                    {cellItems.length === 0 && !off && !fromGroup && (
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
                    onReport={() => setPanel({ type: 'report', sessionId: openSession.id })}
                />
            )}
            {panel?.type === 'report' && openSession && (
                <StudioReportPanel data={data} session={openSession} onClose={() => setPanel(null)} />
            )}
            {panel?.type === 'requests' && openSession && (
                <StudioRequestPanel data={data} session={openSession} onClose={() => setPanel(null)} />
            )}
            {panel?.type === 'routines' && <StudioRoutinesPanel data={data} onClose={() => setPanel(null)} />}
            {panel?.type === 'file' && <StudioClientFilePanel data={data} onClose={() => setPanel(null)} />}
            {panel?.type === 'group' && data.group && (
                <StudioGroupPanel
                    coachId={data.coachId}
                    group={allGroups.find(group => group.id === data.group?.id) ?? null}
                    groups={allGroups}
                    clients={clients}
                    team={data.team}
                    memberIds={activeMembers.map(member => member.id)}
                    onClose={() => setPanel(null)}
                    onSaved={groupId => {
                        setPanel(null)
                        router.push(`/coach/sala?grupo=${groupId}`)
                    }}
                />
            )}
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

function Cell({ item, compact = false, done, busy, readOnly, groupLine, people, onOpen, onToggleDone }: {
    item: StudioItem
    /** En una sesión estrecha solo se ve el volumen. */
    compact?: boolean
    done: boolean
    busy: boolean
    readOnly: boolean
    groupLine: string
    people: string[]
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
                <span className={cn('block font-semibold', compact && 'truncate')}>{summary.volume || '—'}</span>
                {!compact && <>
                {groupLine && <span className="block">{groupLine}</span>}
                {!groupLine && summary.load && (
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
                {people.map(line => <span key={line} className="block truncate text-muted-foreground">{line}</span>)}
                {(item.attachment?.image_key || item.attachment?.link_url) && (
                    <span className="block text-muted-foreground">
                        <Paperclip className="inline h-3 w-3" aria-hidden /> adjunto
                    </span>
                )}
                </>}
            </button>
            {!readOnly && <button
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
            </button>}
        </div>
    )
}

const NARROW_KEY = 'nt.sala.estrechas'

/** Edad, cumpleaños y objetivos del cliente, debajo de su nombre. */
function ClientFacts({ birthday, objectives, today }: { birthday: string | null; objectives: string[]; today: string }) {
    const info = birthdayInfo(birthday, today)
    if (!info && objectives.length === 0) return null
    return (
        <div className="mt-0.5 space-y-1">
            {info && (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <span>{info.age} años · cumple el {info.label}</span>
                    {info.soon && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{info.soon}</span>
                    )}
                </p>
            )}
            {objectives.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Objetivos">
                    {objectives.map(point => (
                        <li key={point} className="rounded-md border px-2 py-0.5 text-xs">{point}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}
