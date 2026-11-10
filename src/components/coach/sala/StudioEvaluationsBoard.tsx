'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { StudioEvaluationsPanel } from '@/components/coach/sala/StudioEvaluationsPanel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { EvaluationBoardRow } from '@/data/evaluations'
import { nameMatches } from '@/lib/studio/client-rules'
import { asymmetryLevel, evaluationSummary, formatChange, formatResult, matchClient, parseEvalSheet } from '@/lib/studio/eval-rules'
import { importEvaluationsAction } from '@/lib/studio/evaluation-actions'
import { formatShortDate } from '@/lib/studio/grid-rules'
import { readXlsx } from '@/lib/studio/xlsx-reader'
import { cn } from '@/lib/utils'

type Client = { id: string; name: string }
type SortKey = 'name' | 'count' | 'last' | 'score' | 'cmj' | 'bj' | 'rsi' | 'dsi' | 'asym'

const LEVEL_CLASS = { ok: 'text-primary', watch: 'text-amber-600 dark:text-amber-400', high: 'text-destructive' }

/** Todas las evaluaciones del espacio: una fila por deportista con lo último de cada prueba. */
export function StudioEvaluationsBoard({ clients, evaluations }: { clients: Client[]; evaluations: EvaluationBoardRow[] }) {
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'name', dir: 1 })
    const [open, setOpen] = useState<Client | null>(null)
    const [newFor, setNewFor] = useState('')

    const rows = useMemo(() => {
        const byClient = new Map<string, EvaluationBoardRow[]>()
        for (const evaluation of evaluations) byClient.set(evaluation.client_id, [...(byClient.get(evaluation.client_id) ?? []), evaluation])
        return clients
            .filter(client => byClient.has(client.id) && (!query || nameMatches(client.name, query)))
            .map(client => ({ client, summary: evaluationSummary(byClient.get(client.id) ?? [])! }))
    }, [clients, evaluations, query])

    const sorted = useMemo(() => {
        const valueOf = (row: (typeof rows)[number]): string | number | null => {
            const { summary } = row
            switch (sort.key) {
                case 'name': return row.client.name
                case 'count': return summary.count
                case 'last': return summary.lastDate
                case 'score': return summary.score
                case 'cmj': return summary.cmj?.value ?? null
                case 'bj': return summary.bj?.value ?? null
                case 'rsi': return summary.rsi?.value ?? null
                case 'dsi': return summary.dsi
                case 'asym': return summary.asymmetry?.percent ?? null
            }
        }
        return [...rows].sort((a, b) => {
            const x = valueOf(a)
            const y = valueOf(b)
            if (x === null || x === '') return 1
            if (y === null || y === '') return -1
            return (typeof x === 'string' ? x.localeCompare(String(y), 'es') : x - Number(y)) * sort.dir
        })
    }, [rows, sort])

    const header = (key: SortKey, label: string, title?: string) => (
        <th className="px-2 py-2 text-left font-medium">
            <button
                type="button"
                title={title}
                className={cn('hover:text-foreground', sort.key === key ? 'text-foreground' : 'text-muted-foreground')}
                onClick={() => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'name' ? 1 : -1 })}
            >
                {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
            </button>
        </th>
    )
    const metric = (entry: { value: number; change: number | null } | null, key: string) => entry ? (
        <>
            {formatResult(entry.value, key)}
            {entry.change !== null && (
                <small className={cn('ml-1', entry.change >= 0 ? 'text-primary' : 'text-destructive')}>{formatChange(entry.change)}</small>
            )}
        </>
    ) : <span className="text-muted-foreground">—</span>

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar deportista" className="pl-9" aria-label="Buscar deportista" />
                </div>
                <select
                    className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Cliente de la nueva evaluación"
                    value={newFor}
                    onChange={event => setNewFor(event.target.value)}
                >
                    <option value="">Cliente de la nueva evaluación…</option>
                    {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
                <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    disabled={!newFor}
                    onClick={() => setOpen(clients.find(client => client.id === newFor) ?? null)}
                >
                    <Plus className="mr-1 h-4 w-4" /> Evaluar
                </Button>
                <StudioEvaluationImport clients={clients} />
            </div>

            {sorted.length === 0 ? (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                    {evaluations.length === 0
                        ? 'Todavía no hay evaluaciones. Importa el Excel del centro o evalúa a un cliente.'
                        : 'Nadie coincide con la búsqueda.'}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="border-b bg-muted/40 text-xs">
                            <tr>
                                {header('name', 'Deportista')}
                                {header('count', 'Eval.')}
                                {header('last', 'Última')}
                                {header('score', 'Nota')}
                                {header('cmj', 'CMJ')}
                                {header('bj', 'BJ')}
                                {header('rsi', 'RSI')}
                                {header('dsi', 'DSI', 'Fuerza del CMJ entre fuerza isométrica')}
                                {header('asym', 'Asim. máx')}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(({ client, summary }) => (
                                <tr
                                    key={client.id}
                                    tabIndex={0}
                                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                    onClick={() => setOpen(client)}
                                    onKeyDown={event => { if (event.key === 'Enter') setOpen(client) }}
                                >
                                    <th scope="row" className="px-2 py-2 text-left font-medium">{client.name}</th>
                                    <td className="px-2 py-2 tabular-nums">{summary.count}</td>
                                    <td className="px-2 py-2">{summary.lastDate ? formatShortDate(summary.lastDate) : <span className="text-muted-foreground">sin fecha</span>}</td>
                                    <td className="px-2 py-2 font-semibold tabular-nums">{summary.score === null ? '—' : Math.round(summary.score)}</td>
                                    <td className="px-2 py-2 tabular-nums">{metric(summary.cmj, 'cmj')}</td>
                                    <td className="px-2 py-2 tabular-nums">{metric(summary.bj, 'bj')}</td>
                                    <td className="px-2 py-2 tabular-nums">{metric(summary.rsi, 'rsi')}</td>
                                    <td className="px-2 py-2 tabular-nums">{summary.dsi === null ? '—' : summary.dsi.toFixed(2).replace('.', ',')}</td>
                                    <td className="px-2 py-2">
                                        {summary.asymmetry ? (
                                            <span className={cn('font-semibold tabular-nums', LEVEL_CLASS[asymmetryLevel(summary.asymmetry.percent)])}>
                                                {formatResult(summary.asymmetry.percent, 'fcmj_asym')} %
                                                <small className="ml-1 font-normal text-muted-foreground">{summary.asymmetry.name}</small>
                                            </span>
                                        ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-muted-foreground">
                Cada columna es el último dato de esa prueba y, en pequeño, el cambio desde la primera evaluación. Pulsa una fila para ver sus evaluaciones.
            </p>

            {open && <StudioEvaluationsPanel clientId={open.id} clientName={open.name} onClose={() => setOpen(null)} />}
        </div>
    )
}

type ImportRow = ReturnType<typeof parseEvalSheet> & { clientId: string; on: boolean }

/** Importar la hoja de evaluaciones del centro: una hoja por deportista. */
function StudioEvaluationImport({ clients }: { clients: Client[] }) {
    const router = useRouter()
    const input = useRef<HTMLInputElement>(null)
    const [rows, setRows] = useState<ImportRow[] | null>(null)
    const [fileName, setFileName] = useState('')
    const [reading, setReading] = useState(false)
    const [isPending, startTransition] = useTransition()

    async function read(file: File) {
        setReading(true)
        try {
            const sheets = await readXlsx(await file.arrayBuffer())
            const parsed = sheets
                .map(sheet => parseEvalSheet(sheet.cell, sheet.name))
                .filter(sheet => sheet.dates.length > 0)
                .map(sheet => {
                    const client = matchClient(sheet.athlete, clients) ?? matchClient(sheet.sheet, clients)
                    return { ...sheet, clientId: client?.id ?? '', on: Boolean(client) }
                })
            if (parsed.length === 0) return void toast.error('No encuentro evaluaciones en ese Excel.')
            setFileName(file.name)
            setRows(parsed)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No he podido leer ese Excel.')
        } finally {
            setReading(false)
        }
    }

    const ready = (rows ?? []).filter(row => row.on && row.clientId)
    const change = (index: number, patch: Partial<ImportRow>) => setRows(current => current?.map((row, position) => (position === index ? { ...row, ...patch } : row)) ?? null)

    function importAll() {
        startTransition(async () => {
            const result = await importEvaluationsAction(ready.map(row => ({ clientId: row.clientId, info: row.info, names: row.names, dates: row.dates })))
            if (!result.success) return void toast.error(result.error)
            toast.success(`${result.data.people === 1 ? '1 deportista' : `${result.data.people} deportistas`} · ${result.data.evaluations} evaluaciones importadas`)
            setRows(null)
            router.refresh()
        })
    }

    return (
        <>
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={reading} onClick={() => input.current?.click()}>
                {reading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />} Importar Excel
            </Button>
            <input
                ref={input}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={event => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void read(file)
                }}
            />
            <Sheet open={rows !== null} onOpenChange={value => { if (!value && !isPending) setRows(null) }}>
                <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
                    <SheetHeader className="border-b p-4 pr-10 text-left">
                        <SheetTitle className="text-base">Importar evaluaciones</SheetTitle>
                        <SheetDescription>{fileName}: revisa a qué cliente va cada hoja. Las fechas que ya existan se completan con lo nuevo.</SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                        {(rows ?? []).map((row, index) => {
                            const tests = new Set(row.dates.flatMap(entry => Object.keys(entry.results))).size
                            return (
                                <div key={`${row.sheet}-${index}`} className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        className="mt-1"
                                        checked={row.on}
                                        disabled={!row.clientId}
                                        aria-label={`Importar ${row.athlete || row.sheet}`}
                                        onCheckedChange={checked => change(index, { on: checked === true })}
                                    />
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <p className="truncate text-sm font-medium">{row.athlete || row.sheet}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {`Hoja «${row.sheet}» · ${row.dates.length === 1 ? '1 fecha' : `${row.dates.length} fechas`} · ${tests} tests`}
                                        </p>
                                        <select
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                            aria-label={`Cliente de ${row.athlete || row.sheet}`}
                                            value={row.clientId}
                                            onChange={event => change(index, { clientId: event.target.value, on: Boolean(event.target.value) })}
                                        >
                                            <option value="">{row.clientId ? 'Elige cliente…' : 'No lo encuentro: elige cliente…'}</option>
                                            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-2 border-t p-4">
                        <Button type="button" className="flex-1" disabled={isPending || ready.length === 0} onClick={importAll}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Importar {ready.length === 1 ? '1 deportista' : `${ready.length} deportistas`}
                        </Button>
                        <Button type="button" variant="outline" disabled={isPending} onClick={() => setRows(null)}>Cancelar</Button>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    )
}
