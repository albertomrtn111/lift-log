'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDownToLine, Dumbbell, Moon, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { isBalanced, withAutofitCarbs } from '@/lib/nutrition/macro-autofit'
import type { CalendarDay, PlannedDayInput } from '@/data/nutrition/calendar'
import type { MacroDayTypeValues } from '@/data/nutrition/types'
import { MacroFieldsBlock, type MacroValues } from './MacroPlanPanel'

type Target = MacroDayTypeValues
type BlockKey = 'simple' | 'training' | 'rest'
type AutoCarbs = Record<BlockKey, boolean>

/** Un día: objetivo único o entreno/descanso, como en el panel de macros. */
export interface DayRow {
    date: string
    /** false = ese día sigue el plan base */
    include: boolean
    label: string
    simple: Target
    dayType: { training: Target; rest: Target } | null
    /** Hidratos automáticos (completan las kcal) en cada juego de macros */
    auto: AutoCarbs
    steps: number | null
}

const DEFAULT_TARGET: Target = { kcal: 2000, protein_g: 150, carbs_g: 193, fat_g: 70 }

const clean = (t: Partial<Target> | null | undefined): Target => ({
    kcal: Math.round(Number(t?.kcal) || 0),
    protein_g: Math.round(Number(t?.protein_g) || 0),
    carbs_g: Math.round(Number(t?.carbs_g) || 0),
    fat_g: Math.round(Number(t?.fat_g) || 0),
})

const toValues = (t: Target): MacroValues => ({ kcal: t.kcal, protein: t.protein_g, carbs: t.carbs_g, fat: t.fat_g })
const fromValues = (v: MacroValues): Target => ({ kcal: v.kcal, protein_g: v.protein, carbs_g: v.carbs, fat_g: v.fat })

/** Igual que al editar un plan: si las kcal ya cuadran, hidratos en automático; si no, se respeta lo que hay. */
const autoFor = (row: Pick<DayRow, 'simple' | 'dayType'>): AutoCarbs => ({
    simple: isBalanced(toValues(row.simple)),
    training: row.dayType ? isBalanced(toValues(row.dayType.training)) : true,
    rest: row.dayType ? isBalanced(toValues(row.dayType.rest)) : true,
})

/** Fila a partir de un día del calendario (planificado o del plan base) o de un día generado. */
export function rowFromDay(
    date: string,
    day: (Partial<CalendarDay> & Partial<PlannedDayInput>) | undefined,
    fallback: Target = DEFAULT_TARGET,
): DayRow {
    const has = !!day && day.source !== 'none'
    const cfg = has ? day?.day_type_config : null
    const simple = has ? clean(day) : clean(fallback)
    const dayType = cfg?.training && cfg?.rest ? { training: clean(cfg.training), rest: clean(cfg.rest) } : null
    return {
        date,
        include: true,
        label: (has && day?.label) || '',
        simple,
        dayType,
        auto: autoFor({ simple, dayType }),
        steps: (has && day?.steps) || null,
    }
}

/** Lo que se guarda de una fila. Con entreno/descanso, los macros de arriba son los de entreno. */
export function rowToInput(row: DayRow, dietPlanId: string | null): PlannedDayInput {
    const top = row.dayType ? row.dayType.training : row.simple
    return {
        date: row.date,
        ...top,
        day_type_config: row.dayType ? { training: { ...row.dayType.training }, rest: { ...row.dayType.rest } } : null,
        steps: row.steps,
        label: row.label.trim() || null,
        diet_plan_id: dietPlanId,
    }
}

const copyMacros = (from: DayRow) => ({
    simple: { ...from.simple },
    dayType: from.dayType ? { training: { ...from.dayType.training }, rest: { ...from.dayType.rest } } : null,
    auto: { ...from.auto },
})

/** Copia los macros (y la etiqueta) de una fila modelo a todas: «mismos valores todos los días». */
export function fillRows(rows: DayRow[], from: DayRow) {
    return rows.map(r => ({ ...r, ...copyMacros(from), label: from.label }))
}

/** Fila modelo para «mismos valores para todos». */
export function templateRow(from?: DayRow): DayRow {
    return from ? { ...from, ...copyMacros(from), date: 'template', include: true } : rowFromDay('template', undefined)
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-ES')

// ============================================================================
// EDITOR DE UN DÍA (mismo aspecto que el panel de macros)
// ============================================================================

export function DayMacroEditor({ row, onChange, title, hideLabel = false, bare = false }: {
    row: DayRow
    onChange: (row: DayRow) => void
    title?: string
    hideLabel?: boolean
    /** Sin marco (dentro de otra caja) */
    bare?: boolean
}) {
    const update = (key: BlockKey, field: keyof MacroValues, value: number) => {
        const current = key === 'simple' ? row.simple : row.dayType![key]
        const next = { ...toValues(current), [field]: value }
        const target = fromValues(row.auto[key] && field !== 'carbs' ? withAutofitCarbs(next) : next)
        onChange(key === 'simple' ? { ...row, simple: target } : { ...row, dayType: { ...row.dayType!, [key]: target } })
    }
    const toggleAuto = (key: BlockKey, enabled: boolean) => {
        const fit = (t: Target) => (enabled ? fromValues(withAutofitCarbs(toValues(t))) : t)
        onChange({
            ...row,
            auto: { ...row.auto, [key]: enabled },
            ...(key === 'simple'
                ? { simple: fit(row.simple) }
                : { dayType: { ...row.dayType!, [key]: fit(row.dayType![key]) } }),
        })
    }
    const toggleDayType = (on: boolean) => {
        if (on) {
            onChange({ ...row, dayType: { training: { ...row.simple }, rest: { ...row.simple } }, auto: { ...row.auto, training: row.auto.simple, rest: row.auto.simple } })
        } else {
            onChange({ ...row, simple: { ...row.dayType!.training }, dayType: null, auto: { ...row.auto, simple: row.auto.training } })
        }
    }
    const block = (key: BlockKey, value: Target) => (
        <MacroFieldsBlock
            values={toValues(value)}
            onChange={(field, v) => update(key, field, v)}
            autoCarbs={row.auto[key]}
            onToggleAutoCarbs={(enabled) => toggleAuto(key, enabled)}
        />
    )

    return (
        <div className={cn('space-y-4', !bare && 'rounded-2xl border border-border/70 bg-card p-4')}>
            {title && <p className="text-sm font-semibold first-letter:uppercase">{title}</p>}
            {!hideLabel && (
                <div className="space-y-2">
                    <Label>Etiqueta del día</Label>
                    <Input value={row.label} maxLength={60} placeholder="ej: Carga HC 1/3" onChange={(e) => onChange({ ...row, label: e.target.value })} />
                </div>
            )}
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                <div>
                    <p className="text-sm font-medium">Entreno y descanso</p>
                    <p className="text-xs text-muted-foreground">Dos juegos de macros; el atleta elige según el día.</p>
                </div>
                <Switch checked={!!row.dayType} onCheckedChange={toggleDayType} aria-label="Entreno y descanso" />
            </div>
            {row.dayType ? (
                <Tabs defaultValue="training" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="training" className="gap-1.5">
                            <Dumbbell className="h-3.5 w-3.5" />
                            Días de entreno
                        </TabsTrigger>
                        <TabsTrigger value="rest" className="gap-1.5">
                            <Moon className="h-3.5 w-3.5" />
                            Días de descanso
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="training" className="mt-3">{block('training', row.dayType.training)}</TabsContent>
                    <TabsContent value="rest" className="mt-3">{block('rest', row.dayType.rest)}</TabsContent>
                </Tabs>
            ) : block('simple', row.simple)}
        </div>
    )
}

// ============================================================================
// LISTA DE DÍAS + EDITOR DEL DÍA ELEGIDO
// ============================================================================

function Summary({ t }: { t: Target }) {
    return (
        <span className="tabular-nums">
            <span className="font-semibold">{fmtInt(t.kcal)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
                <span className="text-rose-500">P</span> {t.protein_g} · <span className="text-amber-500">C</span> {t.carbs_g} · <span className="text-sky-500">G</span> {t.fat_g}
            </span>
        </span>
    )
}

/**
 * Los días del bloque en una lista (kcal y macros de cada uno). Al pulsar un día se edita
 * debajo con los mismos campos que el panel de macros. Un día se puede copiar al siguiente
 * o dejar en el plan base.
 */
export function NutritionDayTable({ rows, onChange, selected, onSelect, planned }: {
    rows: DayRow[]
    onChange: (rows: DayRow[]) => void
    selected: string | null
    onSelect: (date: string) => void
    /** Días que ya estaban planificados: al dejarlos en el plan base se quitan del calendario. */
    planned?: Set<string>
}) {
    const setRow = (i: number, row: DayRow) => onChange(rows.map((r, j) => (j === i ? row : r)))
    const copyDown = (i: number) => {
        const from = rows[i]
        onChange(rows.map((r, j) => (j === i + 1 ? { ...r, include: true, label: from.label, ...copyMacros(from) } : r)))
        onSelect(rows[i + 1].date)
    }
    const current = rows.findIndex(r => r.date === selected && r.include)

    return (
        <div className="space-y-3">
            <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/70">
                {rows.map((row, i) => {
                    const off = !row.include
                    const isSel = i === current
                    return (
                        <div
                            key={row.date}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2',
                                off ? 'bg-muted/30' : 'cursor-pointer hover:bg-muted/40',
                                isSel && 'bg-primary/10 hover:bg-primary/10',
                            )}
                            onClick={() => !off && onSelect(row.date)}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <span className={cn('text-sm font-medium capitalize', off && 'text-muted-foreground')}>
                                        {format(parseISO(row.date), 'EEE d MMM', { locale: es })}
                                    </span>
                                    {!off && row.label && <span className="truncate text-xs font-medium text-primary">{row.label}</span>}
                                </div>
                                {off ? (
                                    <span className="text-sm text-muted-foreground">
                                        {planned?.has(row.date) ? 'Vuelve al plan base' : 'Sigue el plan base'}
                                    </span>
                                ) : row.dayType ? (
                                    <div className="flex flex-col text-sm sm:flex-row sm:gap-4">
                                        <span><span className="mr-1 text-xs text-muted-foreground">E</span><Summary t={row.dayType.training} /></span>
                                        <span><span className="mr-1 text-xs text-muted-foreground">D</span><Summary t={row.dayType.rest} /></span>
                                    </div>
                                ) : (
                                    <div className="text-sm"><Summary t={row.simple} /></div>
                                )}
                            </div>
                            <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
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
                                    onClick={() => {
                                        setRow(i, { ...row, include: off })
                                        if (off) onSelect(row.date)
                                    }}
                                >
                                    {off ? <RotateCcw className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {current >= 0 && (
                <DayMacroEditor
                    key={rows[current].date}
                    title={format(parseISO(rows[current].date), "EEEE d 'de' MMMM", { locale: es })}
                    row={rows[current]}
                    onChange={(row) => setRow(current, row)}
                />
            )}
        </div>
    )
}
