'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
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
import { StudioConflict } from '@/components/coach/sala/StudioConflict'
import { StudioTechnique } from '@/components/coach/sala/StudioTechnique'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { StudioGridData, StudioItem } from '@/data/studio'
import {
    cellDiff,
    cellFields,
    formFromPrevious,
    itemToForm,
    libraryDefaults,
    previousByVariant,
    setRows,
    setsFields,
    timeAgo,
} from '@/lib/studio/editor-rules'
import { cellSummary, formatShortDate, normalizeText } from '@/lib/studio/grid-rules'
import { ATTENDANCE_LABELS, changedPeople, personFields, personForm } from '@/lib/studio/group-rules'
import { deleteItemAction, getItemSetsAction, saveCellAction } from '@/lib/studio/session-actions'
import { cn } from '@/lib/utils'

export type CellTarget =
    | { itemId: string }
    | { sessionId: string; catalogExerciseId: string; exerciseName: string }

const NEXT_LOAD_OPTIONS = [
    { value: 'up', mark: '↑', label: 'Subir carga' },
    { value: 'same', mark: '=', label: 'Mantener carga' },
    { value: 'down', mark: '↓', label: 'Bajar carga' },
]

const SET_COLUMNS = [
    { key: 'loadKg', label: 'Kg' },
    { key: 'reps', label: 'Reps' },
    { key: 'timeSeconds', label: 'Seg' },
    { key: 'rir', label: 'RIR' },
    { key: 'rpe', label: 'RPE' },
] as const

type SetRow = Record<(typeof SET_COLUMNS)[number]['key'], string>

function previousText(item: StudioItem) {
    const summary = cellSummary(item)
    return [summary.volume, summary.load, summary.details].filter(Boolean).join(' · ') || 'sin datos'
}

export function StudioCellPanel({ data, target, onClose, onCopy }: {
    data: StudioGridData
    target: CellTarget
    onClose: () => void
    onCopy: (item: StudioItem) => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const item = 'itemId' in target ? data.items.find(entry => entry.id === target.itemId) ?? null : null
    const sessionId = item?.session_id ?? ('sessionId' in target ? target.sessionId : '')
    const catalogExerciseId = item?.catalog_exercise_id ?? ('catalogExerciseId' in target ? target.catalogExerciseId : '')
    const exerciseName = item?.exercise_name ?? ('exerciseName' in target ? target.exerciseName : '')
    const session = data.sessions.find(entry => entry.id === sessionId)

    const [form, setForm] = useState(() => itemToForm(item ?? libraryDefaults(data.entries, data.blocks, catalogExerciseId)))
    // Lo que había al abrir: si otro lo cambia después, guardar no debe pisarlo sin que lo veas.
    const [base, setBase] = useState(() => ({ version: item?.version ?? null, form: itemToForm(item) }))
    const [tagText, setTagText] = useState('')
    const [showCircuit, setShowCircuit] = useState((item?.circuit.length ?? 0) > 0)
    const [detailOn, setDetailOn] = useState(false)
    const [wasDetailed, setWasDetailed] = useState(false)
    const [rows, setRows_] = useState<SetRow[]>([])
    const [confirmDelete, setConfirmDelete] = useState(false)

    // En un grupo, cada persona de la sesión con sus valores. Lo vacío hereda lo general.
    const inGroup = Boolean(data.group)
    const roster = useMemo(() => data.attendance.filter(entry => entry.session_id === sessionId), [data.attendance, sessionId])
    const savedPeople = useMemo(() => data.people.filter(person => person.item_id === item?.id), [data.people, item?.id])
    const memberName = (clientId: string) => data.group?.members.find(member => member.id === clientId)?.name ?? 'Persona'
    const [personRows, setPersonRows] = useState(() => roster.map(entry => ({
        clientId: entry.client_id,
        form: personForm(savedPeople.find(person => person.client_id === entry.client_id)),
    })))

    // Lo detallado no viaja con la cuadrícula: se pide al abrir la celda.
    const itemId = item?.id ?? null
    useEffect(() => {
        if (!itemId) return
        let current = true
        getItemSetsAction(itemId).then(result => {
            if (!current || !result.success) return
            const detailed = result.data.some(set => set.is_detailed)
            setWasDetailed(detailed)
            setDetailOn(detailed)
            if (detailed) setRows_(setRows(result.data, 0))
        })
        return () => { current = false }
    }, [itemId])

    const latest = useMemo(() => (item ? itemToForm(item) : null), [item])
    const changedByOther = item !== null && base.version !== null && item.version > base.version
    const conflictRows = changedByOther ? cellDiff(form, latest) : []

    // Si no habías tocado nada, o acabáis en lo mismo, no hay nada que elegir.
    useEffect(() => {
        if (!item || !latest || !changedByOther) return
        if (cellDiff(form, base.form).length === 0 || cellDiff(form, latest).length === 0) {
            setForm(latest)
            setBase({ version: item.version, form: latest })
        }
    }, [item, latest, base, form, changedByOther])

    // Otro profesional puede quitar el ejercicio mientras lo tienes abierto.
    const existed = useRef(item !== null)
    const removing = useRef(false)
    useEffect(() => {
        if (existed.current && !item && !removing.current) {
            toast.error('Otra persona ha quitado este ejercicio.')
            onClose()
        }
    }, [item, onClose])

    const previous = useMemo(
        () => previousByVariant(data.sessions, data.items, sessionId, catalogExerciseId),
        [data.sessions, data.items, sessionId, catalogExerciseId]
    )

    const suggestions = useMemo(() => {
        const search = normalizeText(tagText)
        const chosen = new Set(form.tags.map(normalizeText))
        return data.tags
            .filter(tag => !chosen.has(normalizeText(tag)) && (!search || normalizeText(tag).includes(search)))
            .slice(0, 6)
    }, [data.tags, form.tags, tagText])

    function addTag(value: string) {
        const name = value.trim().replace(/\s+/g, ' ')
        if (name && !form.tags.some(tag => normalizeText(tag) === normalizeText(name))) {
            setForm({ ...form, tags: [...form.tags, name] })
        }
        setTagText('')
    }

    function toggleDetail(on: boolean) {
        setDetailOn(on)
        if (on && rows.length === 0) setRows_(setRows([], Number(form.sets) || 1))
    }

    function save(version = base.version) {
        const tags = tagText.trim() ? [...form.tags, tagText.trim()] : form.tags
        const cell = cellFields({ ...form, tags })
        if (cell.error) return void toast.error(cell.error)
        const details = detailOn ? setsFields(rows) : null
        if (details?.error) return void toast.error(details.error)

        const sets = details?.sets ?? (wasDetailed ? [] : undefined)
        const people: { clientId: string; fields: Record<string, unknown> }[] = []
        for (const row of changedPeople(personRows, savedPeople)) {
            const person = personFields(row.form)
            if (person.error) return void toast.error(`${memberName(row.clientId)}: ${person.error}`)
            people.push({ clientId: row.clientId, fields: person.fields! })
        }
        startTransition(async () => {
            const result = await saveCellAction({
                sessionId,
                itemId: item?.id ?? null,
                version,
                fields: item ? cell.fields! : { ...cell.fields!, catalog_exercise_id: catalogExerciseId },
                sets,
                people,
                done: details ? true : form.isDone,
            })
            router.refresh()
            if (result.success) return onClose()
            // Con conflicto, al llegar lo último aparece la comparación.
            if (!result.conflict) toast.error(result.error)
        })
    }

    function useTheirs() {
        if (!item || !latest) return
        setForm(latest)
        setBase({ version: item.version, form: latest })
    }

    function remove() {
        if (!item) return
        removing.current = true
        startTransition(async () => {
            const result = await deleteItemAction(item.id, item.version)
            router.refresh()
            if (result.success) return onClose()
            removing.current = false
            toast.error(result.error)
        })
    }

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">{exerciseName}</SheetTitle>
                    <SheetDescription>
                        {session ? `${session.name ? `${session.name} · ` : ''}${formatShortDate(session.session_date)}` : ''}
                    </SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {changedByOther && conflictRows.length > 0 && (
                        <StudioConflict
                            title={`${(item.updated_by && data.professionals[item.updated_by]) || 'Otra persona'} lo cambió ${timeAgo(item.updated_at)}`}
                            rows={conflictRows}
                            disabled={isPending}
                            onKeepMine={() => save(item.version)}
                            onUseTheirs={useTheirs}
                        />
                    )}

                    {previous.map(({ session: earlier, item: earlierItem, variant }) => (
                        <div key={earlier.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 p-2 text-sm">
                            <span className="min-w-0">
                                <span className="text-muted-foreground">
                                    {previous.length > 1 || variant
                                        ? `Última vez ${variant ? `con ${variant}` : 'sin variante'}`
                                        : 'Sesión anterior'} ({formatShortDate(earlier.session_date)}):{' '}
                                </span>
                                <span className="font-medium">{previousText(earlierItem)}</span>
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={() => setForm(formFromPrevious(form, earlierItem))}
                            >
                                Usar
                            </Button>
                        </div>
                    ))}

                    <StudioTechnique data={data} item={item} catalogExerciseId={catalogExerciseId} exerciseName={exerciseName} />

                    <div className="space-y-1.5">
                        <Label htmlFor="sala-tag">Material o variante</Label>
                        {form.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {form.tags.map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium">
                                        {tag}
                                        <button
                                            type="button"
                                            aria-label={`Quitar ${tag}`}
                                            className="rounded-full p-0.5 hover:bg-primary/20"
                                            onClick={() => setForm({ ...form, tags: form.tags.filter(entry => entry !== tag) })}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <Input
                            id="sala-tag"
                            value={tagText}
                            placeholder="Banda roja, fitball, semiarrodillado…"
                            autoComplete="off"
                            onChange={event => setTagText(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ',') {
                                    event.preventDefault()
                                    addTag(tagText)
                                }
                            }}
                        />
                        {suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {suggestions.map(tag => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => addTag(tag)}
                                        className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Field id="sala-sets" label="Series" value={form.sets} onChange={sets => setForm({ ...form, sets })} numeric />
                        <Field id="sala-reps" label="Repeticiones" value={form.reps} onChange={reps => setForm({ ...form, reps })} />
                        <Field id="sala-time" label="Tiempo (s)" value={form.timeSeconds} onChange={timeSeconds => setForm({ ...form, timeSeconds })} numeric />
                        <Field id="sala-load" label="Carga (kg)" value={form.loadKg} onChange={loadKg => setForm({ ...form, loadKg })} numeric />
                        <Field id="sala-rir" label="RIR" value={form.rir} onChange={rir => setForm({ ...form, rir })} numeric />
                        <Field id="sala-rpe" label="RPE" value={form.rpe} onChange={rpe => setForm({ ...form, rpe })} numeric />
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                        <Label htmlFor="sala-done">Realizado</Label>
                        <Switch
                            id="sala-done"
                            checked={detailOn || form.isDone}
                            disabled={detailOn}
                            onCheckedChange={isDone => setForm({ ...form, isDone })}
                        />
                    </div>

                    {inGroup && personRows.length > 0 && (
                        <div className="space-y-2 rounded-md border p-3">
                            <span className="text-sm font-medium">Por persona</span>
                            <p className="text-xs text-muted-foreground">Lo que dejes vacío hereda lo general.</p>
                            {personRows.map((row, index) => {
                                const status = roster.find(entry => entry.client_id === row.clientId)?.status ?? 'unmarked'
                                const change = (key: string, value: string) => setPersonRows(personRows.map((entry, position) => (
                                    position === index ? { ...entry, form: { ...entry.form, [key]: value } } : entry
                                )))
                                return (
                                    <div key={row.clientId} className="space-y-1">
                                        <div className="flex items-baseline justify-between gap-2 text-sm">
                                            <span className="min-w-0 truncate font-medium">{memberName(row.clientId)}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{ATTENDANCE_LABELS[status]}</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[['loadKg', 'Kg'], ['reps', 'Reps'], ['rir', 'RIR'], ['rpe', 'RPE']].map(([key, label]) => (
                                                <Input
                                                    key={key}
                                                    value={row.form[key as keyof typeof row.form]}
                                                    inputMode={key === 'reps' ? undefined : 'decimal'}
                                                    autoComplete="off"
                                                    placeholder={label}
                                                    aria-label={`${label} de ${memberName(row.clientId)}`}
                                                    className="h-9 px-2 text-center"
                                                    onChange={event => change(key, event.target.value)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {!inGroup && <div className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="sala-detail">Por series</Label>
                            <Switch id="sala-detail" checked={detailOn} onCheckedChange={toggleDetail} />
                        </div>
                        {detailOn && (
                            <>
                                <p className="text-xs text-muted-foreground">Lo que dejes vacío hereda lo general.</p>
                                <div className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] items-center gap-1 text-xs">
                                    <span />
                                    {SET_COLUMNS.map(column => (
                                        <span key={column.key} className="text-center text-muted-foreground">{column.label}</span>
                                    ))}
                                    {rows.map((row, index) => (
                                        <SetLine
                                            key={index}
                                            index={index}
                                            row={row}
                                            onChange={next => setRows_(rows.map((entry, position) => (position === index ? next : entry)))}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setRows_([...rows, { loadKg: '', reps: '', timeSeconds: '', rir: '', rpe: '' }])}
                                    >
                                        <Plus className="mr-1 h-3.5 w-3.5" /> Serie
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={rows.length <= 1}
                                        onClick={() => setRows_(rows.slice(0, -1))}
                                    >
                                        Quitar la última
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>}

                    <div className="space-y-1.5">
                        <span className="text-sm font-medium">Próxima sesión</span>
                        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Próxima sesión">
                            {NEXT_LOAD_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={form.nextLoad === option.value}
                                    aria-label={option.label}
                                    title={option.label}
                                    onClick={() => setForm({ ...form, nextLoad: form.nextLoad === option.value ? null : option.value })}
                                    className={cn(
                                        'h-10 rounded-md border text-base font-semibold',
                                        form.nextLoad === option.value
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {option.mark}
                                </button>
                            ))}
                        </div>
                    </div>

                    {showCircuit ? (
                        <div className="space-y-1.5">
                            <span className="text-sm font-medium">Ejercicios del circuito</span>
                            {(form.circuit.length > 0 ? form.circuit : ['']).map((name, index) => (
                                <div key={index} className="flex gap-2">
                                    <Input
                                        value={name}
                                        aria-label={`Ejercicio ${index + 1} del circuito`}
                                        onChange={event => {
                                            const circuit = form.circuit.length > 0 ? [...form.circuit] : ['']
                                            circuit[index] = event.target.value
                                            setForm({ ...form, circuit })
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Quitar el ejercicio ${index + 1}`}
                                        onClick={() => setForm({ ...form, circuit: form.circuit.filter((_, position) => position !== index) })}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setForm({ ...form, circuit: [...(form.circuit.length > 0 ? form.circuit : ['']), ''] })}
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Otro ejercicio
                            </Button>
                        </div>
                    ) : (
                        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setShowCircuit(true)}>
                            + Ejercicios que lo componen (circuito)
                        </button>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="sala-note">Nota</Label>
                        <Textarea id="sala-note" rows={3} maxLength={2000} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
                    </div>

                    {item && (
                        <p className="text-xs text-muted-foreground">
                            Último cambio: {(item.updated_by && data.professionals[item.updated_by]) || 'alguien del equipo'}, {timeAgo(item.updated_at)}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 border-t p-4">
                    <Button type="button" className="flex-1" disabled={isPending} onClick={() => save()}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar
                    </Button>
                    {item && (
                        <Button type="button" variant="outline" disabled={isPending} onClick={() => onCopy(item)}>
                            Copiar
                        </Button>
                    )}
                    {item && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => (item.is_done ? setConfirmDelete(true) : remove())}
                        >
                            Quitar
                        </Button>
                    )}
                </div>

                <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Quitar este ejercicio?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Está marcado como realizado: sus series dejarán de contar en el historial.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={remove}>Quitar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SheetContent>
        </Sheet>
    )
}

function Field({ id, label, value, onChange, numeric }: {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
    numeric?: boolean
}) {
    return (
        <div className="min-w-0 space-y-1.5">
            <Label htmlFor={id} className="text-xs">{label}</Label>
            <Input
                id={id}
                value={value}
                autoComplete="off"
                inputMode={numeric ? 'decimal' : undefined}
                onChange={event => onChange(event.target.value)}
            />
        </div>
    )
}

function SetLine({ index, row, onChange }: { index: number; row: SetRow; onChange: (row: SetRow) => void }) {
    return (
        <>
            <span className="text-center font-medium">{index + 1}</span>
            {SET_COLUMNS.map(column => (
                <Input
                    key={column.key}
                    value={row[column.key]}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${column.label} de la serie ${index + 1}`}
                    className="h-9 px-1 text-center"
                    onChange={event => onChange({ ...row, [column.key]: event.target.value })}
                />
            ))}
        </>
    )
}
