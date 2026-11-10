'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { EyeOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
    asymmetries,
    asymmetryLevel,
    compareResults,
    dsi,
    formatChange,
    formatResult,
    SCORE_REFERENCES,
    scores,
    sortEvaluations,
    tableTests,
    testDef,
} from '@/lib/studio/eval-rules'
import {
    addEvaluationAction,
    deleteEvaluationAction,
    getClientEvaluationsAction,
    saveEvaluationTestAction,
    saveEvaluationValueAction,
    setEvaluationDateAction,
    type StudioEvaluation,
    type StudioEvaluationFile,
} from '@/lib/studio/evaluation-actions'
import { formatShortDate } from '@/lib/studio/grid-rules'
import { cn } from '@/lib/utils'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const dateText = (evaluation: StudioEvaluation, index: number) =>
    evaluation.eval_date ? formatShortDate(evaluation.eval_date) + (evaluation.eval_date.slice(0, 4) !== today().slice(0, 4) ? ` ${evaluation.eval_date.slice(2, 4)}` : '') : `Sin fecha ${index + 1}`
const LEVEL_CLASS = { ok: 'bg-primary/15 text-primary', watch: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', high: 'bg-destructive/15 text-destructive' }
/** En newtons los puntos son de miles: para escribir se quitan. En lo demás, el punto es decimal. */
const editable = (text: string, unit: string) => (unit === 'N' || unit === 'N/s' ? text.replace(/\./g, '') : text)
const INFO_LABELS: Record<string, string> = { deporte: 'Deporte', posicion: 'Posición', edad: 'Edad', peso: 'Peso', altura: 'Altura', pierna: 'Pierna', altura90: 'Altura a 90°', palanca: 'Palanca' }

/** Evaluaciones de un cliente: comparar dos fechas y tabla de datos. */
export function StudioEvaluationsPanel({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
    const [file, setFile] = useState<StudioEvaluationFile | null>(null)
    const [tab, setTab] = useState<'report' | 'data'>('report')

    const load = useCallback(async () => {
        const result = await getClientEvaluationsAction(clientId)
        if (!result.success) return void toast.error(result.error)
        setFile(result.data)
        if (result.data.evaluations.length === 0) setTab('data')
    }, [clientId])

    useEffect(() => { void load() }, [load])

    const context = useMemo(() => ({
        names: file?.names ?? {},
        custom: Object.fromEntries((file?.tests ?? []).filter(test => test.name).map(test => [test.test_key, {
            name: test.name!, unit: test.unit ?? '', direction: test.direction, group: test.group_name ?? 'Otros',
        }])),
        hidden: (file?.tests ?? []).filter(test => test.hidden).map(test => test.test_key),
    }), [file])

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-3xl">
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">Evaluaciones de {clientName}</SheetTitle>
                    <SheetDescription>
                        {file && Object.keys(file.info).length > 0
                            ? Object.entries(file.info).map(([key, value]) => `${INFO_LABELS[key] ?? key}: ${value}`).join(' · ')
                            : 'Saltos, sprints, fuerza y asimetrías, con los nombres de VALD.'}
                    </SheetDescription>
                    <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Ver">
                        {([['report', 'Informe'], ['data', 'Datos']] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={tab === value}
                                onClick={() => setTab(value)}
                                className={cn('h-8 rounded-md text-sm font-medium', tab === value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </SheetHeader>
                {!file ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {tab === 'report'
                            ? <EvaluationReport file={file} context={context} />
                            : <EvaluationData clientId={clientId} file={file} context={context} onChange={setFile} reload={load} />}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

type Context = { names: Record<string, string>; custom: Record<string, { name: string; unit: string; direction: number; group: string }>; hidden: string[] }

export function EvaluationReport({ file, context }: { file: StudioEvaluationFile; context: Context }) {
    const list = sortEvaluations(file.evaluations) as StudioEvaluation[]
    const [fromId, setFromId] = useState(list[0]?.id ?? '')
    const [toId, setToId] = useState(list[list.length - 1]?.id ?? '')
    if (list.length === 0) return <p className="text-sm text-muted-foreground">Aún no hay evaluaciones. Añade una en «Datos» o importa el Excel desde Evaluaciones.</p>

    const from = list.find(entry => entry.id === fromId) ?? list[0]
    const to = list.find(entry => entry.id === toId) ?? list[list.length - 1]
    const same = from.id === to.id
    const rows = compareResults(same ? {} : from.results, to.results, context)
    const score = scores(to.results)
    const scoreBefore = same ? null : scores(from.results)
    const asym = asymmetries(to.results, context)
    const asymBefore = same ? [] : asymmetries(from.results, context)
    const dsiNow = dsi(to.results)
    let group = ''

    const picker = (label: string, current: string, onPick: (id: string) => void) => (
        <label className="min-w-0 flex-1 space-y-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={current} onChange={event => onPick(event.target.value)}>
                {list.map((entry, index) => <option key={entry.id} value={entry.id}>{dateText(entry, index)}</option>)}
            </select>
        </label>
    )

    return (
        <div className="space-y-5">
            {list.length > 1 && (
                <div className="flex gap-3">
                    {picker('Comparar desde', from.id, setFromId)}
                    {picker('Hasta', to.id, setToId)}
                </div>
            )}

            <section className="space-y-2" aria-labelledby="ev-nota">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 id="ev-nota" className="text-sm font-semibold">Nota frente a las referencias del centro</h3>
                    <span className="text-2xl font-semibold tabular-nums">{score.total === null ? '—' : Math.round(score.total)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Object.entries(score.each).map(([quality, value]) => (
                        <div key={quality} className="rounded-md bg-muted/60 p-2 text-center" title={SCORE_REFERENCES[quality as keyof typeof SCORE_REFERENCES]}>
                            <div className="text-xs text-muted-foreground">{quality}</div>
                            <div className="font-semibold tabular-nums">{value === null ? '—' : Math.round(value)}</div>
                            {scoreBefore && value !== null && scoreBefore.each[quality] !== null && (
                                <div className="text-[0.65rem] text-muted-foreground">antes {Math.round(scoreBefore.each[quality]!)}</div>
                            )}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    Cada cualidad de 0 a 100: {Object.values(SCORE_REFERENCES).join(' · ')} son 100.{dsiNow !== null ? ` DSI ${dsiNow.toFixed(2).replace('.', ',')} (fuerza del CMJ entre fuerza isométrica).` : ''}
                </p>
            </section>

            {asym.length > 0 && (
                <section className="space-y-2" aria-labelledby="ev-asim">
                    <h3 id="ev-asim" className="text-sm font-semibold">Asimetrías</h3>
                    <ul className="space-y-1">
                        {asym.map(entry => {
                            const before = asymBefore.find(other => other.base === entry.base)
                            return (
                                <li key={entry.base} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                                    <span className="min-w-0">
                                        <span className="block truncate">{entry.name}</span>
                                        {entry.right !== null && entry.left !== null && (
                                            <span className="block text-xs text-muted-foreground">
                                                Dcha {formatResult(entry.right, `${entry.base}_r`, context)} · Izda {formatResult(entry.left, `${entry.base}_l`, context)}
                                                {before ? ` · antes ${formatResult(before.percent, 'fcmj_asym')} %` : ''}
                                            </span>
                                        )}
                                    </span>
                                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', LEVEL_CLASS[asymmetryLevel(entry.percent)])}>
                                        {formatResult(entry.percent, 'fcmj_asym')} %
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="text-xs text-muted-foreground">Menos del 10 % bien, del 10 al 15 % vigilar, más del 15 % alta.</p>
                </section>
            )}

            <section className="space-y-2" aria-labelledby="ev-tests">
                <h3 id="ev-tests" className="text-sm font-semibold">{same ? `Resultados del ${dateText(to, list.indexOf(to))}` : 'Cambio entre las dos fechas'}</h3>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                        <thead>
                            <tr className="whitespace-nowrap text-left text-xs text-muted-foreground">
                                <th className="py-1 pr-2 font-medium">Test</th>
                                {!same && <th className="px-2 py-1 text-right font-medium">{dateText(from, list.indexOf(from))}</th>}
                                <th className="px-2 py-1 text-right font-medium">{dateText(to, list.indexOf(to))}</th>
                                {!same && <th className="py-1 pl-2 text-right font-medium">Cambio</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const header = row.group !== group
                                group = row.group
                                return (
                                    <Fragment key={row.key}>
                                        {header && (
                                            <tr><th colSpan={4} className="pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-primary">{row.group}</th></tr>
                                        )}
                                        <tr className="border-b border-border/60">
                                            <td className="py-1.5 pr-2 text-xs leading-tight sm:text-sm">{row.name}{row.unit ? <span className="text-muted-foreground"> ({row.unit})</span> : null}</td>
                                            {!same && <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{formatResult(row.before, row.key, context) || '—'}</td>}
                                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatResult(row.after, row.key, context) || '—'}</td>
                                            {!same && (
                                                <td className={cn(
                                                    'py-1.5 pl-2 text-right tabular-nums',
                                                    row.better === true && 'text-primary',
                                                    row.better === false && 'text-destructive'
                                                )}>
                                                    {formatChange(row.change)}
                                                </td>
                                            )}
                                        </tr>
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}

export function EvaluationData({ clientId, file, context, onChange, reload }: {
    clientId: string
    file: StudioEvaluationFile
    context: Context
    onChange: (file: StudioEvaluationFile) => void
    reload: () => Promise<void>
}) {
    const [isPending, startTransition] = useTransition()
    const [confirm, setConfirm] = useState<StudioEvaluation | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const [newTest, setNewTest] = useState({ name: '', unit: '', direction: '1' })
    const list = sortEvaluations(file.evaluations) as StudioEvaluation[]
    const keys = tableTests(list, { ...context, hidden: showHidden ? [] : context.hidden })
    let group = ''

    function replace(evaluation: StudioEvaluation) {
        onChange({ ...file, evaluations: file.evaluations.map(entry => (entry.id === evaluation.id ? evaluation : entry)) })
    }

    /** Al salir de la casilla: si no se ha tocado, no se guarda (lo que se ve está redondeado). */
    function saveValue(evaluation: StudioEvaluation, key: string, text: string, shown: string) {
        if (text.trim() === shown) return
        const trimmed = text.trim().replace(',', '.')
        const value = trimmed === '' ? null : Number(trimmed)
        const current = evaluation.results[key] ?? null
        if (value === current) return
        if (value !== null && !Number.isFinite(value)) return void toast.error('Escribe un número.')
        startTransition(async () => {
            const result = await saveEvaluationValueAction(evaluation.id, evaluation.version, key, value)
            if (!result.success) {
                toast.error(result.error)
                return void reload()
            }
            replace(result.data)
        })
    }

    function addEvaluation() {
        startTransition(async () => {
            const result = await addEvaluationAction(clientId, today())
            if (!result.success) return void toast.error(result.error)
            await reload()
        })
    }

    function remove(evaluation: StudioEvaluation) {
        startTransition(async () => {
            const result = await deleteEvaluationAction(evaluation.id)
            setConfirm(null)
            if (!result.success) return void toast.error(result.error)
            await reload()
        })
    }

    function changeDate(evaluation: StudioEvaluation, date: string) {
        startTransition(async () => {
            const result = await setEvaluationDateAction(evaluation.id, date || null)
            if (!result.success) toast.error(result.error)
            await reload()
        })
    }

    function hideTest(key: string, hidden: boolean) {
        startTransition(async () => {
            const result = await saveEvaluationTestAction({ key, hidden })
            if (!result.success) return void toast.error(result.error)
            await reload()
        })
    }

    function addTest() {
        const name = newTest.name.trim()
        if (!name) return
        const key = `x_${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50)}`
        startTransition(async () => {
            const result = await saveEvaluationTestAction({ key, name, unit: newTest.unit, direction: Number(newTest.direction), group: 'Otros', hidden: false })
            if (!result.success) return void toast.error(result.error)
            setNewTest({ name: '', unit: '', direction: '1' })
            await reload()
        })
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" disabled={isPending} onClick={addEvaluation}>
                    <Plus className="mr-1 h-4 w-4" /> Evaluación de hoy
                </Button>
                {context.hidden.length > 0 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowHidden(!showHidden)}>
                        {showHidden ? 'Esconder los ocultos' : `Ver tests ocultos (${context.hidden.length})`}
                    </Button>
                )}
                {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando" />}
            </div>
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin evaluaciones todavía.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="text-sm">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-10 min-w-[180px] bg-background py-1 pr-2 text-left text-xs font-medium text-muted-foreground">Test</th>
                                {list.map((evaluation, index) => (
                                    <th key={evaluation.id} className="min-w-[96px] px-1 py-1 align-bottom">
                                        <div className="flex items-center gap-0.5">
                                            <Input
                                                type="date"
                                                defaultValue={evaluation.eval_date ?? ''}
                                                aria-label={`Fecha de la evaluación ${index + 1}`}
                                                className="h-8 px-1 text-xs"
                                                onBlur={event => {
                                                    if (event.target.value !== (evaluation.eval_date ?? '')) changeDate(evaluation, event.target.value)
                                                }}
                                            />
                                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Borrar la evaluación ${dateText(evaluation, index)}`} onClick={() => setConfirm(evaluation)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(key => {
                                const def = testDef(key, context)
                                const header = def.group !== group
                                group = def.group
                                const hidden = context.hidden.includes(key)
                                return (
                                    <Fragment key={key}>
                                        {header && (
                                            <tr><th colSpan={list.length + 1} className="sticky left-0 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-primary">{def.group}</th></tr>
                                        )}
                                        <tr className={cn(hidden && 'opacity-60')}>
                                            <td className="sticky left-0 z-10 bg-background py-0.5 pr-2">
                                                <div className="flex items-center gap-1">
                                                    <span className="min-w-0 flex-1 text-xs leading-tight">{def.name}{def.unit ? <span className="text-muted-foreground"> ({def.unit})</span> : null}</span>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                                        aria-label={hidden ? `Recuperar ${def.name}` : `Ocultar ${def.name}`}
                                                        title={hidden ? 'Recuperar en la tabla' : 'Ocultar de la tabla (los datos se conservan)'}
                                                        onClick={() => hideTest(key, !hidden)}
                                                    >
                                                        {hidden ? <Plus className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                                    </button>
                                                </div>
                                            </td>
                                            {list.map(evaluation => {
                                                const shown = editable(formatResult(evaluation.results[key], key, context), def.unit)
                                                return (
                                                <td key={evaluation.id} className="px-1 py-0.5">
                                                    <Input
                                                        key={`${evaluation.id}-${evaluation.version}-${key}`}
                                                        defaultValue={shown}
                                                        inputMode="decimal"
                                                        autoComplete="off"
                                                        aria-label={`${def.name}, ${evaluation.eval_date ?? 'sin fecha'}`}
                                                        className="h-8 px-1.5 text-right tabular-nums"
                                                        onBlur={event => saveValue(evaluation, key, editable(event.target.value, def.unit), shown)}
                                                        onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
                                                    />
                                                </td>
                                                )
                                            })}
                                        </tr>
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="space-y-2 rounded-md border p-3">
                <span className="text-sm font-medium">Test propio del centro</span>
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_auto] gap-2">
                    <Input value={newTest.name} maxLength={80} placeholder="Salto al cajón, Dinamometría…" aria-label="Nombre del test" onChange={event => setNewTest({ ...newTest, name: event.target.value })} />
                    <Input value={newTest.unit} maxLength={12} placeholder="cm" aria-label="Unidad" onChange={event => setNewTest({ ...newTest, unit: event.target.value })} />
                    <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        aria-label="Qué es mejor"
                        value={newTest.direction}
                        onChange={event => setNewTest({ ...newTest, direction: event.target.value })}
                    >
                        <option value="1">Más es mejor</option>
                        <option value="-1">Menos es mejor</option>
                        <option value="0">Neutro</option>
                    </select>
                    <Button type="button" size="sm" className="h-9" disabled={!newTest.name.trim() || isPending} onClick={addTest}>Añadir</Button>
                </div>
                <p className="text-xs text-muted-foreground">Sale en la tabla de todos los clientes del espacio. Se puede ocultar y recuperar sin perder datos.</p>
            </div>

            <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Borrar esta evaluación?</AlertDialogTitle>
                        <AlertDialogDescription>Se borran todos sus resultados y no se pueden recuperar.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirm && remove(confirm)}>Borrar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
