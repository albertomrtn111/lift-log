'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { importMyJumpAction } from '@/lib/studio/my-jump-actions'
import {
    analyzeMyJump,
    clientCandidates,
    exerciseCandidates,
    fileDate,
    guessClient,
    guessExercise,
    parseMyJumpName,
    readableName,
} from '@/lib/studio/my-jump-rules'
import { formatVelocity } from '@/lib/studio/vbt-rules'
import { getLibraryAction, type LibraryEntry } from '@/lib/training/workspace-library-actions'
import { cn } from '@/lib/utils'

type Analysis = NonNullable<ReturnType<typeof analyzeMyJump>>

interface ImportRow {
    file: string
    who: string
    exercise: string
    analysis: Analysis | null
    clientId: string
    clientSure: boolean
    clientOptions: string[]
    catalogExerciseId: string
    exerciseSure: boolean
    exerciseOptions: string[]
    date: string
    loadKg: string
}

const SELECT = 'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm'

/** Leer los CSV y proponer cliente, ejercicio, día y carga de cada uno. */
async function readFiles(files: File[], clients: { id: string; name: string }[], entries: LibraryEntry[], fixedClientId?: string) {
    const visible = entries.filter(entry => !entry.isHidden)
    return Promise.all(files.map(async (file): Promise<ImportRow> => {
        const meta = parseMyJumpName(file.name)
        const analysis = /\.csv$/i.test(file.name) ? analyzeMyJump(await file.text()) : null
        const client = fixedClientId ? clients.find(entry => entry.id === fixedClientId) ?? null : guessClient(file.name, clients)
        const exercise = guessExercise(file.name, visible, client?.name ?? '')
        const exerciseOptions = exerciseCandidates(file.name, visible, client?.name ?? '').slice(0, 5).map(found => found.entry.catalogExerciseId)
        return {
            file: file.name,
            who: readableName(meta.who),
            exercise: meta.exercise,
            analysis,
            clientId: client?.id ?? '',
            clientSure: Boolean(client),
            clientOptions: fixedClientId ? [] : clientCandidates(file.name, clients).slice(0, 3).map(found => found.client.id),
            catalogExerciseId: exercise?.catalogExerciseId ?? exerciseOptions[0] ?? '',
            exerciseSure: Boolean(exercise),
            exerciseOptions,
            date: fileDate(file.lastModified || Date.now()),
            loadKg: meta.loadKg ? String(meta.loadKg).replace('.', ',') : '',
        }
    }))
}

/** Importar series de My Jump Lab: cada CSV a su cliente, su ejercicio y su día. */
export function StudioMyJumpImport({ clients, fixedClientId, library, className }: {
    clients: { id: string; name: string }[]
    /** En la cuadrícula de un cliente, todo va a él. */
    fixedClientId?: string
    /** La biblioteca, si ya está cargada; si no, se pide al abrir. */
    library?: LibraryEntry[]
    className?: string
}) {
    const router = useRouter()
    const input = useRef<HTMLInputElement>(null)
    const [rows, setRows] = useState<ImportRow[] | null>(null)
    const [entries, setEntries] = useState<LibraryEntry[]>(library ?? [])
    const [reading, setReading] = useState(false)
    const [isPending, startTransition] = useTransition()

    async function open(files: File[]) {
        if (files.length === 0) return
        setReading(true)
        try {
            const library = entries.length > 0 ? { success: true as const, data: { entries } } : await getLibraryAction()
            const list = library.success ? library.data?.entries ?? [] : []
            setEntries(list)
            setRows(await readFiles(files, clients, list, fixedClientId))
        } catch {
            toast.error('No he podido leer esos archivos.')
        } finally {
            setReading(false)
        }
    }

    const change = (index: number, patch: Partial<ImportRow>) =>
        setRows(current => current?.map((row, position) => (position === index ? { ...row, ...patch } : row)) ?? null)

    const ready = (rows ?? []).filter(row => row.analysis && row.clientId && row.catalogExerciseId && /^\d{4}-\d{2}-\d{2}$/.test(row.date))

    function importAll() {
        if (ready.length === 0) return void toast.error('Elige cliente, ejercicio y día de cada archivo.')
        startTransition(async () => {
            const result = await importMyJumpAction(ready.map(row => ({
                clientId: row.clientId,
                date: row.date,
                catalogExerciseId: row.catalogExerciseId,
                loadKg: Number.parseFloat(row.loadKg.replace(',', '.')) || null,
                reps: row.analysis!.reps,
            })))
            if (!result.success) return void toast.error(result.error)
            const { sets, sessions } = result.data
            toast.success(`${sets === 1 ? '1 serie importada' : `${sets} series importadas`}${sessions ? ` · ${sessions === 1 ? '1 sesión nueva' : `${sessions} sesiones nuevas`}` : ''}`)
            const people = [...new Set(ready.map(row => row.clientId))]
            setRows(null)
            if (!fixedClientId && people.length === 1) router.push(`/coach/sala?cliente=${people[0]}`)
            else router.refresh()
        })
    }

    const sorted = [...entries].filter(entry => !entry.isHidden).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const nameOf = (catalogId: string) => entries.find(entry => entry.catalogExerciseId === catalogId)?.name ?? ''
    const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'))

    return (
        <>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('h-9', className)}
                disabled={reading}
                onClick={() => input.current?.click()}
                title="Importar series de My Jump Lab (CSV)"
            >
                {reading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />} My Jump
            </Button>
            <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                multiple
                hidden
                onChange={event => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    void open(files)
                }}
            />

            <Sheet open={rows !== null} onOpenChange={value => { if (!value && !isPending) setRows(null) }}>
                <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
                    <SheetHeader className="border-b p-4 pr-10 text-left">
                        <SheetTitle className="text-base">
                            Importar de My Jump · {rows?.length === 1 ? '1 archivo' : `${rows?.length ?? 0} archivos`}
                        </SheetTitle>
                        <SheetDescription>
                            Revisa a quién, a qué ejercicio y a qué día va cada archivo. Si ese día no hay sesión, se crea.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                        {(rows ?? []).map((row, index) => (
                            <div key={`${row.file}-${index}`} className="space-y-2 rounded-md border p-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{row.who || 'Sin nombre'} · {row.exercise || row.file}</p>
                                    <p className="truncate text-xs text-muted-foreground">{row.file}</p>
                                    <p className={cn('text-xs', row.analysis ? 'text-muted-foreground' : 'text-destructive')}>
                                        {row.analysis
                                            ? `${row.analysis.reps.length} rep · mejor VMP ${formatVelocity(row.analysis.mpv)} m/s · pérdida ${row.analysis.loss} %`
                                            : 'No encuentro repeticiones en este archivo: no se importa.'}
                                    </p>
                                </div>
                                {row.analysis && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {!fixedClientId && (
                                            <label className="col-span-2 space-y-1 text-xs">
                                                <span className="flex items-center gap-1.5">
                                                    Cliente <Hint sure={row.clientSure} maybe={row.clientOptions.length > 0} />
                                                </span>
                                                <select className={SELECT} value={row.clientId} onChange={event => change(index, { clientId: event.target.value, clientSure: true })}>
                                                    <option value="">Elige cliente…</option>
                                                    {row.clientOptions.length > 0 && !row.clientSure && (
                                                        <optgroup label={`Parecidos a «${row.who}»`}>
                                                            {row.clientOptions.map(id => (
                                                                <option key={id} value={id}>{clients.find(client => client.id === id)?.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                    <optgroup label="Todos">
                                                        {sortedClients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                                                    </optgroup>
                                                </select>
                                            </label>
                                        )}
                                        <label className="col-span-2 space-y-1 text-xs">
                                            <span className="flex items-center gap-1.5">
                                                Ejercicio <Hint sure={row.exerciseSure} maybe={Boolean(row.catalogExerciseId)} />
                                            </span>
                                            <select className={SELECT} value={row.catalogExerciseId} onChange={event => change(index, { catalogExerciseId: event.target.value, exerciseSure: true })}>
                                                <option value="">Elige ejercicio…</option>
                                                {row.exerciseOptions.length > 0 && (
                                                    <optgroup label={`Parecidos a «${row.exercise}»`}>
                                                        {row.exerciseOptions.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
                                                    </optgroup>
                                                )}
                                                <optgroup label="Biblioteca">
                                                    {sorted.map(entry => <option key={entry.catalogExerciseId} value={entry.catalogExerciseId}>{entry.name}</option>)}
                                                </optgroup>
                                            </select>
                                        </label>
                                        <label className="space-y-1 text-xs">
                                            <span>Día</span>
                                            <Input type="date" className="h-9" value={row.date} onChange={event => change(index, { date: event.target.value })} />
                                        </label>
                                        <label className="space-y-1 text-xs">
                                            <span>Carga (kg)</span>
                                            <Input
                                                className="h-9"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="kg"
                                                value={row.loadKg}
                                                onChange={event => change(index, { loadKg: event.target.value })}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                            El día es la fecha del archivo. Las series se suman a las que ya tenga ese ejercicio ese día.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 border-t p-4">
                        <Button type="button" className="flex-1" disabled={isPending || ready.length === 0} onClick={importAll}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Importar {ready.length === 1 ? '1 serie' : `${ready.length} series`}
                        </Button>
                        <Button type="button" variant="outline" disabled={isPending} onClick={() => setRows(null)}>
                            Cancelar
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    )
}

function Hint({ sure, maybe }: { sure: boolean; maybe: boolean }) {
    if (sure) return <span className="rounded-full bg-primary/10 px-1.5 text-[0.65rem] text-primary">por el nombre</span>
    if (maybe) return <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">¿es este?</span>
    return <span className="rounded-full bg-destructive/10 px-1.5 text-[0.65rem] text-destructive">no lo encuentro</span>
}
