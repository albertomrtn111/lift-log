'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Minus, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { StudioGridData, StudioItem } from '@/data/studio'
import {
    SESSION_STATUS_LABELS,
    STUDIO_PAST_SESSIONS,
    buildGrid,
    cellSummary,
    prepareSessions,
} from '@/lib/studio/grid-rules'
import { BLOCK_CATEGORY_LABELS } from '@/lib/training/exercise-catalog-rules'
import { cn } from '@/lib/utils'

const ZOOM_LEVELS = [
    { column: 'w-[104px] min-w-[104px]', text: 'text-[11px]' },
    { column: 'w-[132px] min-w-[132px]', text: 'text-xs' },
    { column: 'w-[172px] min-w-[172px]', text: 'text-sm' },
]

function formatDate(date: string) {
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${date}T00:00:00.000Z`))
}

export function StudioGrid({ data, today, olderPages }: {
    data: StudioGridData
    today: string
    olderPages: number
}) {
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [onlyUsed, setOnlyUsed] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
            </div>

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
                                            'sticky top-0 z-20 border-b border-r bg-card p-2 text-left align-top font-normal',
                                            narrow ? 'w-[64px] min-w-[64px]' : level.column,
                                            session.isToday && 'bg-primary/10'
                                        )}
                                    >
                                        <span className="block font-semibold">
                                            {session.number ? `Sesión ${session.number}` : SESSION_STATUS_LABELS[session.status as keyof typeof SESSION_STATUS_LABELS]}
                                        </span>
                                        <span className="block text-muted-foreground">{formatDate(session.session_date)}</span>
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
                                        </span>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
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
                                                {sessions.map(session => (
                                                    <td
                                                        key={session.id}
                                                        className={cn(
                                                            'border-b border-r p-1 align-top',
                                                            session.isToday && 'bg-primary/5',
                                                            (session.status === 'cancelled' || session.status === 'no_show') && 'bg-muted/40'
                                                        )}
                                                    >
                                                        {row.items
                                                            .filter((item: StudioItem) => item.session_id === session.id)
                                                            .map((item: StudioItem) => <Cell key={item.id} item={item} />)}
                                                    </td>
                                                ))}
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
        </section>
    )
}

function Cell({ item }: { item: StudioItem }) {
    const summary = cellSummary(item)
    return (
        <div className={cn('rounded px-1.5 py-1', item.is_done ? 'bg-primary/10' : 'bg-muted/50')}>
            <div className="flex items-start justify-between gap-1">
                <span className="font-semibold">{summary.volume || '—'}</span>
                {item.is_done && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Realizado" />}
            </div>
            {summary.load && (
                <span className="block">
                    {summary.load}
                    {summary.nextLoad && <span className="ml-1 font-semibold text-primary">{summary.nextLoad}</span>}
                </span>
            )}
            {summary.details && <span className="block text-muted-foreground">{summary.details}</span>}
            {item.circuit.length > 0 && (
                <span className="block truncate text-muted-foreground">{item.circuit.join(' · ')}</span>
            )}
            {item.note && <span className="block truncate text-muted-foreground" title={item.note}>{item.note}</span>}
        </div>
    )
}
