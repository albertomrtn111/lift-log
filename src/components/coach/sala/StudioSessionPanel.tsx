'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { StudioExerciseSearch } from '@/components/coach/sala/StudioExerciseSearch'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, ClipboardCopy, ClipboardPaste, Copy, CopyPlus, FileText, Loader2, Save, Trash2, X } from 'lucide-react'
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
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { StudioGridData, StudioItem, StudioSession } from '@/data/studio'
import {
    DEFAULT_SESSION_MINUTES,
    WELLNESS_QUESTIONS,
    libraryDefaults,
    listLayout,
    moveEntry,
    parseNumber,
    previousWellness,
    sessionDiff,
    sessionList,
    sessionLoad,
    sessionPatch,
    sessionToForm,
    wellnessScore,
} from '@/lib/studio/editor-rules'
import { clipItemFields, routineItemFields, routinesForClient } from '@/lib/studio/copy-rules'
import { blockItems, blockOptions, sessionText } from '@/lib/studio/session-text-rules'
import type { StudioClip } from '@/lib/studio/clipboard'
import { cellSummary, formatShortDate } from '@/lib/studio/grid-rules'
import {
    addItemAction,
    addItemsAction,
    arrangeSessionAction,
    createGroupSessionAction,
    createSessionAction,
    deleteItemAction,
    deleteSectionAction,
    deleteSessionAction,
    duplicateSessionAction,
    getStudioTemplatesAction,
    saveSectionAction,
    saveSessionAsTemplateAction,
    setAttendanceAction,
    setSectionParentAction,
    updateSessionAction,
    type StudioTemplateOption,
} from '@/lib/studio/session-actions'
import { cn } from '@/lib/utils'

const NO_PROFESSIONAL = 'none'
const NO_SECTION = 'none'
const NO_TEMPLATE = 'none'
const NO_ROUTINE = 'none'

const STATUS_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'cancelled', label: 'Anulada' },
    { value: 'no_show', label: 'No vino' },
]

interface BasicsForm {
    date: string
    time: string
    professionalId: string
    name: string
}

function BasicFields({ form, team, professionals, onChange }: {
    form: BasicsForm
    team: StudioGridData['team']
    professionals: StudioGridData['professionals']
    onChange: (changes: Partial<BasicsForm>) => void
}) {
    // Un profesional que ya no está en el equipo se sigue viendo en las sesiones que dio.
    const options = form.professionalId && !team.some(member => member.id === form.professionalId)
        ? [...team, { id: form.professionalId, name: professionals[form.professionalId] ?? 'Antiguo profesional' }]
        : team
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
                <Label htmlFor="sesion-fecha">Fecha</Label>
                <Input id="sesion-fecha" type="date" value={form.date} onChange={event => onChange({ date: event.target.value })} />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="sesion-hora">Hora</Label>
                <Input id="sesion-hora" type="time" value={form.time} onChange={event => onChange({ time: event.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
                <Label>Profesional</Label>
                <Select
                    value={form.professionalId || NO_PROFESSIONAL}
                    onValueChange={value => onChange({ professionalId: value === NO_PROFESSIONAL ? '' : value })}
                >
                    <SelectTrigger aria-label="Profesional"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_PROFESSIONAL}>Sin asignar</SelectItem>
                        {options.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
                <Label htmlFor="sesion-nombre">Nombre (opcional)</Label>
                <Input
                    id="sesion-nombre"
                    value={form.name}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Fuerza A, Pliometría, Readaptación…"
                    onChange={event => onChange({ name: event.target.value })}
                />
            </div>
        </div>
    )
}

/** Crear una sesión o duplicar otra: fecha, hora, profesional y nombre. */
export function StudioNewSessionPanel({ data, today, currentUserId, source, onClose, onCreated }: {
    data: StudioGridData
    today: string
    currentUserId: string | null
    source: StudioSession | null
    onClose: () => void
    onCreated: (sessionId: string) => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState<BasicsForm>({
        date: today,
        time: '',
        professionalId: data.team.some(member => member.id === currentUserId) ? currentUserId! : '',
        name: source?.name ?? '',
    })
    const [templates, setTemplates] = useState<StudioTemplateOption[]>([])
    const [templateDay, setTemplateDay] = useState(NO_TEMPLATE)

    useEffect(() => {
        if (source) return
        let current = true
        getStudioTemplatesAction().then(result => {
            if (current && result.success) setTemplates(result.data)
        })
        return () => { current = false }
    }, [source])

    function submit() {
        if (!form.date) return void toast.error('Elige una fecha.')
        startTransition(async () => {
            const input = {
                date: form.date,
                time: form.time || null,
                professionalId: form.professionalId || null,
                name: form.name.trim() || null,
            }
            const result = source
                ? await duplicateSessionAction({ ...input, sessionId: source.id })
                : data.group
                    ? await createGroupSessionAction({ ...input, groupId: data.group.id })
                    : await createSessionAction({ ...input, clientId: data.client.id })
            if (!result.success) return void toast.error(result.error)

            const day = templates.flatMap(template => template.days).find(entry => entry.id === templateDay)
            if (day && day.items.length > 0) {
                const added = await addItemsAction(result.data.id, day.items, { origin: 'template' })
                if (!added.success) toast.error(added.error)
                else if (day.skipped > 0) toast.warning(`${day.skipped} ejercicios de la plantilla no están en el catálogo y no se han añadido.`)
            }
            router.refresh()
            onCreated(result.data.id)
        })
    }

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">{source ? 'Duplicar sesión' : 'Nueva sesión'}</SheetTitle>
                    <SheetDescription>{data.client.fullName}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {source && (
                        <p className="text-sm text-muted-foreground">
                            Se crea una sesión nueva con los mismos ejercicios, series, repeticiones y pesos que la del {formatShortDate(source.session_date)}. Las notas no se copian.
                        </p>
                    )}
                    <BasicFields
                        form={form}
                        team={data.team}
                        professionals={data.professionals}
                        onChange={changes => setForm({ ...form, ...changes })}
                    />
                    {templates.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Desde una plantilla (opcional)</Label>
                            <Select value={templateDay} onValueChange={setTemplateDay}>
                                <SelectTrigger aria-label="Plantilla"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TEMPLATE}>Sin plantilla</SelectItem>
                                    {templates.flatMap(template => template.days.map(day => (
                                        <SelectItem key={day.id} value={day.id}>{template.name} · {day.name}</SelectItem>
                                    )))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <div className="border-t p-4">
                    <Button type="button" className="w-full" disabled={isPending} onClick={submit}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {source ? 'Duplicar' : 'Crear sesión'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

export function StudioSessionPanel({ data, session, clip, onClose, onOpenItem, onDuplicate, onCopy, onPasted, onReport }: {
    data: StudioGridData
    session: StudioSession
    clip: StudioClip | null
    onClose: () => void
    onOpenItem: (itemId: string) => void
    onDuplicate: () => void
    onCopy: (entries: ReturnType<typeof sessionList>) => void
    onPasted: () => void
    onReport: () => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState(() => sessionToForm(session))
    // Lo que había al abrir: si otro lo cambia después, guardar no debe pisarlo sin que lo veas.
    const [base, setBase] = useState(() => ({ version: session.version, form: sessionToForm(session) }))
    const [confirm, setConfirm] = useState<{ type: 'session' } | { type: 'item'; item: StudioItem } | null>(null)
    const [routineId, setRoutineId] = useState(NO_ROUTINE)
    const [skipped, setSkipped] = useState<Set<number>>(new Set())
    const [templateName, setTemplateName] = useState<string | null>(null)
    const [newSection, setNewSection] = useState('')
    const [addTo, setAddTo] = useState(NO_SECTION)
    const [blockKey, setBlockKey] = useState('')

    const items = useMemo(() => data.items.filter(item => item.session_id === session.id), [data.items, session.id])
    const sections = useMemo(() => data.sections.filter(section => section.session_id === session.id), [data.sections, session.id])
    const entries = useMemo(() => sessionList(items, sections), [items, sections])

    const routines = useMemo(
        () => routinesForClient(data.routines, data.client.id) as StudioGridData['routines'],
        [data.routines, data.client.id]
    )
    const routine = routines.find(entry => entry.id === routineId) ?? null
    // En la cuadrícula una celda se pega tocando otra celda; en el móvil, desde aquí.
    const canPaste = clip !== null && (clip.kind === 'cell' || clip.fromSessionId !== session.id)

    const latest = useMemo(() => sessionToForm(session), [session])
    // Solo cuenta una versión más nueva: tras guardar, la mía llega antes que los datos recargados.
    const changedByOther = session.version > base.version
    const conflictRows = changedByOther ? sessionDiff(form, latest, data.professionals) : []

    // Si no habías tocado nada, o acabáis en lo mismo, no hay nada que elegir.
    useEffect(() => {
        if (!changedByOther) return
        if (sessionDiff(form, base.form).length === 0 || sessionDiff(form, latest).length === 0) {
            setForm(latest)
            setBase({ version: session.version, form: latest })
        }
    }, [changedByOther, session.version, latest, base, form])

    const score = wellnessScore(form)
    const earlierScore = previousWellness(data.sessions, session.id)
    const load = sessionLoad(parseNumber(form.rpe), parseNumber(form.duration))

    /** Las acciones de la ficha se guardan al momento; el formulario sigue con lo que se está escribiendo. */
    function run(action: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
        startTransition(async () => {
            const result = await action()
            router.refresh()
            if (!result.success) return void toast.error(result.error)
            after?.()
        })
    }

    function move(index: number, direction: number) {
        const next = moveEntry(entries, index, direction)
        if (next === entries) return
        const layout = listLayout(next)
        run(() => arrangeSessionAction(session.id, layout.sectionIds, layout.items))
    }

    function save(version = base.version) {
        const { patch, error } = sessionPatch(form, session)
        if (error) return void toast.error(error)
        startTransition(async () => {
            const result = await updateSessionAction(session.id, version, patch!)
            router.refresh()
            if (result.success) {
                setBase({ version: result.data.version, form })
                toast.success('Sesión guardada')
            } else if (!result.conflict) {
                toast.error(result.error)
            }
        })
    }

    function useTheirs() {
        setForm(latest)
        setBase({ version: session.version, form: latest })
    }

    function addRoutine() {
        if (!routine) return
        const chosen = routine.items.filter((_, index) => !skipped.has(index)).map(routineItemFields)
        if (chosen.length === 0) return void toast.error('Elige al menos un ejercicio.')
        run(
            () => addItemsAction(session.id, chosen, { routineId: routine.id }),
            () => {
                setRoutineId(NO_ROUTINE)
                setSkipped(new Set())
            }
        )
    }

    const packs = useMemo(() => blockOptions(data.entries, data.blocks), [data.entries, data.blocks])
    const packItems = blockKey
        ? blockItems(data.entries, data.blocks, blockKey, new Set(items.map(item => item.catalog_exercise_id)))
        : []

    function addBlock() {
        if (packItems.length === 0) return void toast.error('Ese bloque ya está entero en la sesión.')
        const sectionId = addTo === NO_SECTION ? null : addTo
        run(
            () => addItemsAction(session.id, packItems.map(item => ({ ...item, section_id: sectionId }))),
            () => setBlockKey('')
        )
    }

    async function copySummary() {
        const text = sessionText({ personName: data.client.fullName, session, entries })
        try {
            await navigator.clipboard.writeText(text)
            toast.success('Resumen copiado: pégalo donde quieras.')
        } catch {
            toast.error('No se ha podido copiar. Prueba otra vez.')
        }
    }

    function paste() {
        if (!clip) return
        const items = clip.kind === 'cell' ? [clip.item] : clip.items
        run(() => addItemsAction(session.id, items.map(item => clipItemFields(item)), { origin: 'copy' }), onPasted)
    }

    function saveAsTemplate() {
        const name = templateName?.trim()
        if (!name) return void toast.error('Ponle un nombre a la plantilla.')
        run(() => saveSessionAsTemplateAction(name, entries), () => {
            setTemplateName(null)
            toast.success('Plantilla guardada')
        })
    }

    function removeItem(item: StudioItem) {
        run(() => deleteItemAction(item.id, item.version))
    }

    function runConfirmed() {
        if (confirm?.type === 'item') removeItem(confirm.item)
        if (confirm?.type === 'session') run(() => deleteSessionAction(session.id, session.version), onClose)
        setConfirm(null)
    }

    const sectionTarget = sections.some(section => section.id === addTo) ? addTo : NO_SECTION

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">{session.name || 'Sesión'} · {formatShortDate(session.session_date)}</SheetTitle>
                    <SheetDescription>{data.client.fullName}</SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                    {conflictRows.length > 0 && (
                        <StudioConflict
                            title="Otra persona ha cambiado esta sesión"
                            rows={conflictRows}
                            disabled={isPending}
                            onKeepMine={() => save(session.version)}
                            onUseTheirs={useTheirs}
                        />
                    )}

                    <section className="space-y-3" aria-label="Datos de la sesión">
                        <BasicFields
                            form={form}
                            team={data.team}
                            professionals={data.professionals}
                            onChange={changes => setForm({ ...form, ...changes })}
                        />
                        <div className="space-y-1.5">
                            <span className="text-sm font-medium">Estado</span>
                            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Estado de la sesión">
                                {STATUS_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={form.status === option.value}
                                        onClick={() => setForm({ ...form, status: option.value })}
                                        className={cn(
                                            'h-9 rounded-md border text-sm font-medium',
                                            form.status === option.value
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Pasa a hecha sola en cuanto hay un ejercicio realizado. Las anuladas no cuentan en el historial.
                            </p>
                        </div>
                    </section>

                    <section className="space-y-3" aria-labelledby="sesion-ejercicios">
                        <h3 id="sesion-ejercicios" className="text-sm font-semibold">Ejercicios</h3>
                        {entries.length === 0 && <p className="text-sm text-muted-foreground">Aún no tiene ejercicios.</p>}
                        <ol className="space-y-1">
                            {entries.map((entry, index) => {
                                const canUp = moveEntry(entries, index, -1) !== entries
                                const canDown = moveEntry(entries, index, 1) !== entries
                                const arrows = (label: string) => (
                                    <>
                                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={!canUp || isPending} aria-label={`Subir ${label}`} onClick={() => move(index, -1)}>
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={!canDown || isPending} aria-label={`Bajar ${label}`} onClick={() => move(index, 1)}>
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                )

                                if (entry.type === 'section') {
                                    const section = entry.section
                                    return (
                                        <li key={section.id} className="space-y-1 pt-2">
                                            <Input
                                                key={section.parent_title ?? ''}
                                                defaultValue={section.parent_title ?? ''}
                                                maxLength={80}
                                                aria-label={`Título superior de ${section.title}`}
                                                placeholder="Título superior (opcional)"
                                                className="h-7 text-xs uppercase"
                                                onBlur={event => {
                                                    const parent = event.target.value.trim()
                                                    if (parent !== (section.parent_title ?? '')) run(() => setSectionParentAction(section.id, parent))
                                                }}
                                            />
                                            <div className="flex items-center gap-1">
                                            <Input
                                                key={section.title}
                                                defaultValue={section.title}
                                                maxLength={80}
                                                aria-label="Título del subbloque"
                                                className="h-8 flex-1 font-semibold text-primary"
                                                onBlur={event => {
                                                    const title = event.target.value.trim()
                                                    if (title && title !== section.title) run(() => saveSectionAction(session.id, section.id, title))
                                                }}
                                            />
                                            {arrows(section.title)}
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8"
                                                disabled={isPending}
                                                aria-label={`Quitar el subbloque ${section.title}`}
                                                title="Quita el título; los ejercicios se quedan"
                                                onClick={() => run(() => deleteSectionAction(section.id))}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                            </div>
                                        </li>
                                    )
                                }

                                const item = entry.item
                                const summary = cellSummary(item)
                                return (
                                    <li key={item.id} className="flex items-center gap-1 rounded-md bg-muted/50 pl-2">
                                        <button type="button" className="min-w-0 flex-1 py-1.5 text-left text-sm" onClick={() => onOpenItem(item.id)}>
                                            <span className="flex items-center gap-1 font-medium">
                                                {item.is_done && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Realizado" />}
                                                <span className="truncate">{item.exercise_name}</span>
                                            </span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {[summary.volume, summary.load, summary.details].filter(Boolean).join(' · ') || 'Sin valores'}
                                            </span>
                                        </button>
                                        {arrows(item.exercise_name)}
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            disabled={isPending}
                                            aria-label={`Quitar ${item.exercise_name}`}
                                            onClick={() => (item.is_done ? setConfirm({ type: 'item', item }) : removeItem(item))}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </li>
                                )
                            })}
                        </ol>

                        <div className="space-y-2 rounded-md border p-3">
                            {sections.length > 0 && (
                                <Select value={sectionTarget} onValueChange={setAddTo}>
                                    <SelectTrigger aria-label="Añadir en"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_SECTION}>Sin subbloque</SelectItem>
                                        {sections.map(section => <SelectItem key={section.id} value={section.id}>{section.title}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            <StudioExerciseSearch
                                id="sesion-buscar"
                                label="Añadir ejercicio"
                                entries={data.entries}
                                disabled={isPending}
                                onPick={entry => run(() => addItemAction(
                                    session.id,
                                    entry.catalogExerciseId,
                                    sectionTarget === NO_SECTION ? null : sectionTarget,
                                    libraryDefaults(data.entries, data.blocks, entry.catalogExerciseId)
                                ))}
                            />
                        </div>

                        {packs.length > 0 && (
                            <div className="space-y-2 rounded-md border p-3">
                                <Label htmlFor="sesion-bloque">Añadir un bloque entero</Label>
                                <div className="flex gap-2">
                                    <select
                                        id="sesion-bloque"
                                        className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                                        value={blockKey}
                                        onChange={event => setBlockKey(event.target.value)}
                                    >
                                        <option value="">Elige un bloque de la biblioteca</option>
                                        {packs.map(option => (
                                            <option key={option.key} value={option.key}>{option.name} · {option.count} ej.</option>
                                        ))}
                                    </select>
                                    <Button type="button" size="sm" className="h-9 shrink-0" disabled={!blockKey || isPending} onClick={addBlock}>
                                        {blockKey && packItems.length > 0 ? `Añadir ${packItems.length}` : 'Añadir'}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Con las series y repeticiones de la biblioteca. Lo que ya está en la sesión no se repite.</p>
                            </div>
                        )}

                        {routines.length > 0 && (
                            <div className="space-y-2 rounded-md border p-3">
                                <Label>Añadir una rutina</Label>
                                <Select
                                    value={routineId}
                                    onValueChange={value => {
                                        setRoutineId(value)
                                        setSkipped(new Set())
                                    }}
                                >
                                    <SelectTrigger aria-label="Rutina"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_ROUTINE}>Elige una rutina</SelectItem>
                                        {routines.map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {routine && (
                                    <>
                                        <ul className="space-y-1">
                                            {routine.items.map((item, index) => (
                                                <li key={`${item.catalog_exercise_id}-${index}`} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={!skipped.has(index)}
                                                        aria-label={`Incluir ${item.exercise_name}`}
                                                        onCheckedChange={checked => {
                                                            const next = new Set(skipped)
                                                            if (checked) next.delete(index)
                                                            else next.add(index)
                                                            setSkipped(next)
                                                        }}
                                                    />
                                                    <span className="min-w-0 truncate">{item.exercise_name}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <Button type="button" size="sm" className="w-full" disabled={isPending} onClick={addRoutine}>
                                            Añadir {routine.items.length - skipped.size} ejercicios
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Input
                                value={newSection}
                                maxLength={80}
                                autoComplete="off"
                                aria-label="Título del nuevo subbloque"
                                placeholder="Calentamiento, Fuerza…"
                                onChange={event => setNewSection(event.target.value)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                className="shrink-0"
                                disabled={!newSection.trim() || isPending}
                                onClick={() => run(() => saveSectionAction(session.id, null, newSection), () => setNewSection(''))}
                            >
                                Añadir subbloque
                            </Button>
                        </div>
                    </section>

                    {data.group && (
                        <section className="space-y-2" aria-labelledby="sesion-asistencia">
                            <h3 id="sesion-asistencia" className="text-sm font-semibold">Asistencia</h3>
                            {data.attendance.filter(entry => entry.session_id === session.id).map(entry => (
                                <div key={entry.client_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-1.5 pl-3 text-sm">
                                    <span className="min-w-0 truncate">
                                        {data.group?.members.find(member => member.id === entry.client_id)?.name ?? 'Persona'}
                                    </span>
                                    <div className="grid shrink-0 grid-cols-2 gap-1" role="group" aria-label="Asistencia">
                                        {([['attended', 'Vino'], ['absent', 'No vino']] as const).map(([status, label]) => (
                                            <button
                                                key={status}
                                                type="button"
                                                disabled={isPending}
                                                aria-pressed={entry.status === status}
                                                onClick={() => run(() => setAttendanceAction(session.id, entry.client_id, entry.status === status ? 'unmarked' : status))}
                                                className={cn(
                                                    'h-9 rounded-md border px-3 text-xs font-medium',
                                                    entry.status === status
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}

                    {!data.group && <section className="space-y-3" aria-labelledby="sesion-llega">
                        <div className="flex items-baseline justify-between gap-2">
                            <h3 id="sesion-llega" className="text-sm font-semibold">Cómo llega</h3>
                            {score !== null && (
                                <span className="text-sm">
                                    <span className="font-semibold">{score.toLocaleString('es-ES', { maximumFractionDigits: 1 })}/10</span>
                                    {earlierScore !== null && (
                                        <span className="text-muted-foreground"> · antes {earlierScore.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span>
                                    )}
                                </span>
                            )}
                        </div>
                        {WELLNESS_QUESTIONS.map(question => (
                            <Scale
                                key={question.key}
                                label={question.label}
                                hint={question.hint}
                                value={form[question.key as keyof typeof form] as number | null}
                                onChange={value => setForm({ ...form, [question.key]: value })}
                            />
                        ))}
                        <Textarea
                            rows={2}
                            maxLength={1000}
                            aria-label="Cómo llega, en texto libre"
                            placeholder="Viene con molestias en el hombro, ha dormido mal…"
                            value={form.arrivalNote}
                            onChange={event => setForm({ ...form, arrivalNote: event.target.value })}
                        />
                    </section>}

                    <section className="space-y-2" aria-labelledby="sesion-final">
                        <h3 id="sesion-final" className="text-sm font-semibold">Al terminar</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="sesion-rpe">RPE de la sesión</Label>
                                <Input id="sesion-rpe" inputMode="decimal" autoComplete="off" value={form.rpe} onChange={event => setForm({ ...form, rpe: event.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="sesion-duracion">Minutos</Label>
                                <Input
                                    id="sesion-duracion"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder={String(DEFAULT_SESSION_MINUTES)}
                                    value={form.duration}
                                    onChange={event => setForm({ ...form, duration: event.target.value })}
                                />
                            </div>
                        </div>
                        {load !== null && <p className="text-sm text-muted-foreground">Carga de la sesión: <span className="font-semibold text-foreground">{load}</span></p>}
                        {data.feedback.filter(entry => entry.session_id === session.id).map(entry => (
                            <div key={entry.client_id} className="rounded-md bg-muted/60 p-2 text-sm">
                                <span className="font-medium">
                                    {data.group?.members.find(member => member.id === entry.client_id)?.name ?? data.client.fullName} cuenta
                                    {entry.rpe !== null ? `: RPE ${entry.rpe}` : ':'}
                                </span>
                                {entry.comment && <p className="text-muted-foreground">{entry.comment}</p>}
                            </div>
                        ))}
                    </section>

                    <div className="space-y-2 border-t pt-4">
                        <div className="grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" disabled={isPending} onClick={onReport}>
                                <FileText className="mr-2 h-4 w-4" /> Informe
                            </Button>
                            <Button type="button" variant="outline" disabled={isPending || items.length === 0} onClick={() => void copySummary()}>
                                <ClipboardCopy className="mr-2 h-4 w-4" /> Copiar resumen
                            </Button>
                        </div>
                        {canPaste && (
                            <Button type="button" className="w-full" disabled={isPending} onClick={paste}>
                                <ClipboardPaste className="mr-2 h-4 w-4" /> Pegar aquí: {clip.label}
                            </Button>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" disabled={isPending || items.length === 0} onClick={() => onCopy(entries)}>
                                <Copy className="mr-2 h-4 w-4" /> Copiar
                            </Button>
                            <Button type="button" variant="outline" disabled={isPending} onClick={onDuplicate}>
                                <CopyPlus className="mr-2 h-4 w-4" /> Duplicar
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isPending || items.length === 0}
                                onClick={() => setTemplateName(templateName === null ? session.name ?? '' : null)}
                            >
                                <Save className="mr-2 h-4 w-4" /> Plantilla
                            </Button>
                            <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirm({ type: 'session' })}>
                                <Trash2 className="mr-2 h-4 w-4" /> Borrar
                            </Button>
                        </div>
                        {templateName !== null && (
                            <div className="flex gap-2">
                                <Input
                                    value={templateName}
                                    maxLength={120}
                                    autoComplete="off"
                                    aria-label="Nombre de la plantilla"
                                    placeholder="Nombre de la plantilla"
                                    onChange={event => setTemplateName(event.target.value)}
                                />
                                <Button type="button" className="shrink-0" disabled={isPending} onClick={saveAsTemplate}>Guardar</Button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t p-4">
                    <Button type="button" className="w-full" disabled={isPending} onClick={() => save()}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar cambios
                    </Button>
                </div>

                <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirm?.type === 'session' ? '¿Borrar esta sesión?' : '¿Quitar este ejercicio?'}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {confirm?.type === 'session'
                                    ? 'Se borran sus ejercicios y las series registradas, que dejarán de contar en el historial. Si solo no ha venido, márcala como Anulada o No vino.'
                                    : 'Está marcado como realizado: sus series dejarán de contar en el historial.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={runConfirmed}>{confirm?.type === 'session' ? 'Borrar' : 'Quitar'}</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SheetContent>
        </Sheet>
    )
}

/** De 0 a 10. Tocar otra vez el valor elegido lo quita. */
function Scale({ label, hint, value, onChange }: {
    label: string
    hint: string
    value: number | null
    onChange: (value: number | null) => void
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
            <div className="grid grid-cols-11 gap-0.5" role="group" aria-label={label}>
                {Array.from({ length: 11 }, (_, option) => (
                    <button
                        key={option}
                        type="button"
                        aria-pressed={value === option}
                        onClick={() => onChange(value === option ? null : option)}
                        className={cn(
                            'h-8 rounded text-xs font-medium',
                            value === option ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    )
}
