'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDownToLine, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { macrosKcal } from '@/lib/nutrition/planning'
import type { CalendarDay, PlannedDayInput } from '@/data/nutrition/calendar'
import type { MacroDayTypeValues } from '@/data/nutrition/types'

type Target = MacroDayTypeValues
type Grams = Omit<Target, 'kcal'>

/** Un día de la tabla: un objetivo único o entreno/descanso. Las kcal salen de los gramos. */
export interface DayRow {
    date: string
    /** false = ese día sigue el plan base */
    include: boolean
    label: string
    simple: Grams
    dayType: { training: Grams; rest: Grams } | null
    steps: number | null
}

const grams = (t: Partial<Target> | null | undefined): Grams => ({
    protein_g: Math.round(Number(t?.protein_g) || 0),
    carbs_g: Math.round(Number(t?.carbs_g) || 0),
    fat_g: Math.round(Number(t?.fat_g) || 0),
})

const withKcal = (g: Grams): Target => ({ kcal: macrosKcal(g), ...g })

/** Fila a partir de un día del calendario (planificado o del plan base) o de un día generado. */
export function rowFromDay(
    date: string,
    day: (Partial<CalendarDay> & Partial<PlannedDayInput>) | undefined,
    fallback: Grams = { protein_g: 150, carbs_g: 200, fat_g: 70 },
): DayRow {
    const has = !!day && day.source !== 'none'
    const cfg = has ? day?.day_type_config : null
    return {
        date,
        include: true,
        label: (has && day?.label) || '',
        simple: has ? grams(day) : fallback,
        dayType: cfg?.training && cfg?.rest ? { training: grams(cfg.training), rest: grams(cfg.rest) } : null,
        steps: (has && day?.steps) || null,
    }
}

/** Lo que se guarda de una fila. Con entreno/descanso, los macros de arriba son los de entreno. */
export function rowToInput(row: DayRow, dietPlanId: string | null): PlannedDayInput {
    const top = withKcal(row.dayType ? row.dayType.training : row.simple)
    return {
        date: row.date,
        ...top,
        day_type_config: row.dayType
            ? { training: withKcal(row.dayType.training), rest: withKcal(row.dayType.rest) }
            : null,
        steps: row.steps,
        label: row.label.trim() || null,
        diet_plan_id: dietPlanId,
    }
}

/** Copia los macros (y la etiqueta) de una fila a todas: para «mismos valores todos los días». */
export function fillRows(rows: DayRow[], from: Pick<DayRow, 'simple' | 'dayType'> & { label?: string }) {
    return rows.map(r => ({
        ...r,
        simple: { ...from.simple },
        dayType: from.dayType ? { training: { ...from.dayType.training }, rest: { ...from.dayType.rest } } : null,
        label: from.label !== undefined ? from.label : r.label,
    }))
}

const FIELDS: { key: keyof Grams; label: string }[] = [
    { key: 'protein_g', label: 'Prot.' },
    { key: 'carbs_g', label: 'HC' },
    { key: 'fat_g', label: 'Grasa' },
]

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-ES')

function GramInputs({ value, onChange, disabled, prefix }: {
    value: Grams
    onChange: (g: Grams) => void
    disabled: boolean
    prefix?: string
}) {
    return (
        <>
            <span className="self-center text-[11px] font-semibold text-muted-foreground">{prefix ?? ''}</span>
            {FIELDS.map(f => (
                <Input
                    key={f.key}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label={`${f.label}${prefix ? ` ${prefix}` : ''}`}
                    disabled={disabled}
                    className="h-8 px-2 text-right tabular-nums"
                    value={Number.isFinite(value[f.key]) ? value[f.key] : ''}
                    onChange={(e) => onChange({ ...value, [f.key]: e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value))) })}
                />
            ))}
            <span className="self-center text-right text-sm font-semibold tabular-nums">{disabled ? '' : fmtInt(macrosKcal(value))}</span>
        </>
    )
}

/**
 * Tabla de días: cada fila se edita por separado (etiqueta y gramos; las kcal se calculan).
 * Una fila se puede copiar a la siguiente o dejar en el plan base.
 */
export function NutritionDayTable({ rows, onChange, planned }: {
    rows: DayRow[]
    onChange: (rows: DayRow[]) => void
    /** Días que ya estaban planificados: al dejarlos en el plan base se quitan del calendario. */
    planned?: Set<string>
}) {
    const update = (i: number, patch: Partial<DayRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    const copyDown = (i: number) => {
        const from = rows[i]
        onChange(rows.map((r, j) => (j === i + 1
            ? { ...r, include: true, label: from.label, simple: { ...from.simple }, dayType: from.dayType ? { training: { ...from.dayType.training }, rest: { ...from.dayType.rest } } : null }
            : r)))
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-border/70">
            <div className="min-w-[620px]">
                <div className="grid grid-cols-[96px_minmax(110px,1fr)_20px_repeat(3,64px)_56px_64px] items-center gap-1.5 border-b border-border/70 bg-muted/40 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                    <span>Día</span>
                    <span>Etiqueta</span>
                    <span />
                    {FIELDS.map(f => <span key={f.key} className="text-right">{f.label} (g)</span>)}
                    <span className="text-right">Kcal</span>
                    <span />
                </div>
                {rows.map((row, i) => {
                    const off = !row.include
                    return (
                        <div
                            key={row.date}
                            className={cn(
                                'grid grid-cols-[96px_minmax(110px,1fr)_20px_repeat(3,64px)_56px_64px] items-start gap-1.5 border-b border-border/40 px-2 py-1.5 last:border-b-0',
                                off && 'bg-muted/30',
                            )}
                        >
                            <span className={cn('pt-1.5 text-sm font-medium capitalize', off && 'text-muted-foreground')}>
                                {format(parseISO(row.date), 'EEE d MMM', { locale: es })}
                            </span>
                            {off ? (
                                <span className="col-span-6 pt-1.5 text-sm text-muted-foreground">
                                    {planned?.has(row.date) ? 'Vuelve al plan base' : 'Sigue el plan base'}
                                </span>
                            ) : (
                                <>
                                    <Input
                                        value={row.label}
                                        maxLength={60}
                                        placeholder="ej: Carga HC"
                                        aria-label="Etiqueta"
                                        className="h-8"
                                        onChange={(e) => update(i, { label: e.target.value })}
                                    />
                                    {row.dayType ? (
                                        <div className="col-span-5 grid grid-cols-[20px_repeat(3,64px)_56px] gap-1.5">
                                            <GramInputs prefix="E" value={row.dayType.training} disabled={off}
                                                onChange={(training) => update(i, { dayType: { ...row.dayType!, training } })} />
                                            <GramInputs prefix="D" value={row.dayType.rest} disabled={off}
                                                onChange={(rest) => update(i, { dayType: { ...row.dayType!, rest } })} />
                                        </div>
                                    ) : (
                                        <div className="col-span-5 grid grid-cols-[20px_repeat(3,64px)_56px] gap-1.5">
                                            <GramInputs value={row.simple} disabled={off} onChange={(simple) => update(i, { simple })} />
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="flex justify-end gap-0.5">
                                {!off && i < rows.length - 1 && (
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Copiar al día siguiente" aria-label="Copiar al día siguiente" onClick={() => copyDown(i)}>
                                        <ArrowDownToLine className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title={off ? 'Planificar este día' : 'Dejar en el plan base'}
                                    aria-label={off ? 'Planificar este día' : 'Dejar en el plan base'}
                                    onClick={() => update(i, { include: off })}
                                >
                                    {off ? <RotateCcw className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
