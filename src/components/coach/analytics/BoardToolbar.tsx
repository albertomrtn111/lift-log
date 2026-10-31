'use client'

import Link from 'next/link'
import { CalendarRange, ChevronLeft, ChevronRight, ExternalLink, Loader2, Save, Users } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PERIODS } from '@/lib/analytics/catalog'
import type { BoardFilterState } from '@/types/analytics'
import { MultiSelect } from './MultiSelect'

const PERIOD_LABELS: Record<string, string> = {
    '4w': 'Últimas 4 semanas',
    '8w': 'Últimas 8 semanas',
    '12w': 'Últimas 12 semanas',
    '6m': 'Últimos 6 meses',
    '1y': 'Último año',
    custom: 'Elegir fechas',
}

const STATUS_LABELS: Record<BoardFilterState['status'], string> = {
    active: 'Activos',
    inactive: 'Inactivos',
    all: 'Todos',
}

/** Filtros del tablero: aplican a todos sus gráficos */
export function BoardToolbar({ filters, onChange, athletes, singleAthleteId, onSingleAthlete, dirty, saving, onSaveFilters, loadingFacts }: {
    filters: BoardFilterState
    onChange: (filters: BoardFilterState) => void
    /** Atletas del estado elegido, en orden alfabético */
    athletes: Array<{ id: string; name: string; status: string }>
    singleAthleteId: string | null
    onSingleAthlete: (id: string) => void
    dirty: boolean
    saving: boolean
    onSaveFilters: () => void
    loadingFacts: boolean
}) {
    const index = singleAthleteId ? athletes.findIndex(athlete => athlete.id === singleAthleteId) : -1
    const previous = index > 0 ? athletes[index - 1] : null
    const next = index >= 0 && index < athletes.length - 1 ? athletes[index + 1] : null

    return (
        <div className="flex flex-wrap items-center gap-2">
            {filters.athleteMode === 'single' ? (
                <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={!previous} onClick={() => previous && onSingleAthlete(previous.id)} aria-label="Atleta anterior" title="Atleta anterior (←)">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Select value={singleAthleteId ?? undefined} onValueChange={onSingleAthlete}>
                        <SelectTrigger className="h-9 min-w-0 flex-1 rounded-full sm:w-[220px] sm:flex-none" aria-label="Atleta">
                            <SelectValue placeholder="Sin atletas" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[360px]">
                            {athletes.map(athlete => <SelectItem key={athlete.id} value={athlete.id}>{athlete.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={!next} onClick={() => next && onSingleAthlete(next.id)} aria-label="Atleta siguiente" title="Atleta siguiente (→)">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    {index >= 0 && <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground">{index + 1}/{athletes.length}</span>}
                    {singleAthleteId && (
                        <Link href={`/coach/clients?client=${singleAthleteId}`} className="ml-1 hidden shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline sm:inline-flex">
                            Workspace <ExternalLink className="h-3 w-3" />
                        </Link>
                    )}
                </div>
            ) : (
                <div className="flex w-full items-center gap-1.5 sm:w-[240px]">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <MultiSelect
                        ariaLabel="Atletas del tablero"
                        options={athletes.map(athlete => ({ value: athlete.id, label: athlete.name }))}
                        value={filters.athleteIds}
                        onChange={athleteIds => onChange({ ...filters, athleteIds })}
                        placeholder="Buscar atleta…"
                        emptyLabel={`Todos (${athletes.length})`}
                    />
                </div>
            )}

            <Select value={filters.status} onValueChange={status => onChange({ ...filters, status: status as BoardFilterState['status'], athleteIds: filters.athleteMode === 'single' ? filters.athleteIds : [] })}>
                <SelectTrigger className="h-9 w-[120px]" aria-label="Estado de los atletas"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {(Object.keys(STATUS_LABELS) as BoardFilterState['status'][]).map(status => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}
                </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Select value={filters.period} onValueChange={period => onChange({ ...filters, period })}>
                    <SelectTrigger className="h-9 w-[190px]" aria-label="Periodo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {Object.keys(PERIODS).map(key => <SelectItem key={key} value={key}>{PERIOD_LABELS[key] ?? key}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            {filters.period === 'custom' && (
                <div className="flex items-center gap-1.5">
                    <Input type="date" className="h-9 w-[150px]" aria-label="Desde" value={filters.from ?? ''} onChange={event => onChange({ ...filters, from: event.target.value || null })} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="date" className="h-9 w-[150px]" aria-label="Hasta" value={filters.to ?? ''} onChange={event => onChange({ ...filters, to: event.target.value || null })} />
                </div>
            )}

            {loadingFacts && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando datos" />}
            {dirty && (
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onSaveFilters} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Guardar filtros en el tablero
                </Button>
            )}
        </div>
    )
}
