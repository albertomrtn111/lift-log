'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { StudioExerciseSearch } from '@/components/coach/sala/StudioExerciseSearch'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { StudioGridData, StudioRoutine } from '@/data/studio'
import { parseNumber } from '@/lib/studio/editor-rules'
import { ROUTINE_KINDS, routineItemFields, routinesForClient } from '@/lib/studio/copy-rules'
import { deleteRoutineAction, saveRoutineAction } from '@/lib/studio/session-actions'

interface DraftItem {
    catalog_exercise_id: string
    exercise_name: string
    sets: string
    reps: string
}

interface Draft {
    id: string | null
    name: string
    kind: string
    onlyThisClient: boolean
    items: DraftItem[]
}

function draftFrom(routine: StudioRoutine | null, clientId: string): Draft {
    return {
        id: routine?.id ?? null,
        name: routine?.name ?? '',
        kind: routine?.kind ?? 'other',
        onlyThisClient: routine ? routine.client_id === clientId : false,
        items: (routine?.items ?? []).map(item => ({
            catalog_exercise_id: item.catalog_exercise_id,
            exercise_name: item.exercise_name,
            sets: item.sets === null ? '' : String(item.sets),
            reps: item.reps ?? '',
        })),
    }
}

/** Crear, cambiar y borrar rutinas: paquetes de ejercicios con sus valores. */
export function StudioRoutinesPanel({ data, onClose }: { data: StudioGridData; onClose: () => void }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [draft, setDraft] = useState<Draft | null>(null)
    const routines = routinesForClient(data.routines, data.client.id) as StudioRoutine[]

    function save() {
        if (!draft) return
        if (!draft.name.trim()) return void toast.error('Ponle un nombre a la rutina.')
        if (draft.items.length === 0) return void toast.error('Añade al menos un ejercicio.')
        const original = data.routines.find(routine => routine.id === draft.id)
        const items = draft.items.map(item => {
            const saved = original?.items.find(entry => entry.catalog_exercise_id === item.catalog_exercise_id)
            const sets = parseNumber(item.sets)
            return {
                ...(saved ? routineItemFields(saved) : { catalog_exercise_id: item.catalog_exercise_id }),
                sets: sets !== null && Number.isInteger(sets) && sets >= 1 && sets <= 30 ? sets : null,
                reps: item.reps.trim() || null,
            }
        })
        startTransition(async () => {
            const result = await saveRoutineAction({
                coachId: data.coachId,
                routineId: draft.id,
                name: draft.name,
                kind: draft.kind,
                clientId: draft.onlyThisClient ? data.client.id : null,
                items,
            })
            if (!result.success) return void toast.error(result.error)
            router.refresh()
            setDraft(null)
        })
    }

    function remove(routine: StudioRoutine) {
        startTransition(async () => {
            const result = await deleteRoutineAction(routine.id)
            if (!result.success) return void toast.error(result.error)
            router.refresh()
        })
    }

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">Rutinas</SheetTitle>
                    <SheetDescription>Paquetes de ejercicios para añadir de una vez a una sesión.</SheetDescription>
                </SheetHeader>

                {draft ? (
                    <>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="rutina-nombre">Nombre</Label>
                                <Input
                                    id="rutina-nombre"
                                    value={draft.name}
                                    maxLength={80}
                                    autoComplete="off"
                                    placeholder="Movilidad 1, Activación tren inferior…"
                                    onChange={event => setDraft({ ...draft, name: event.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Tipo</Label>
                                <Select value={draft.kind} onValueChange={kind => setDraft({ ...draft, kind })}>
                                    <SelectTrigger aria-label="Tipo de rutina"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(ROUTINE_KINDS).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <Label htmlFor="rutina-cliente">Solo para {data.client.fullName}</Label>
                                <Switch
                                    id="rutina-cliente"
                                    checked={draft.onlyThisClient}
                                    onCheckedChange={onlyThisClient => setDraft({ ...draft, onlyThisClient })}
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="text-sm font-medium">Ejercicios</span>
                                {draft.items.map((item, index) => (
                                    <div key={`${item.catalog_exercise_id}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
                                        <span className="min-w-0 flex-1 truncate">{item.exercise_name}</span>
                                        <Input
                                            value={item.sets}
                                            inputMode="numeric"
                                            aria-label={`Series de ${item.exercise_name}`}
                                            placeholder="Series"
                                            className="h-8 w-16 px-2"
                                            onChange={event => setDraft({
                                                ...draft,
                                                items: draft.items.map((entry, position) => (position === index ? { ...entry, sets: event.target.value } : entry)),
                                            })}
                                        />
                                        <Input
                                            value={item.reps}
                                            aria-label={`Repeticiones de ${item.exercise_name}`}
                                            placeholder="Reps"
                                            className="h-8 w-16 px-2"
                                            onChange={event => setDraft({
                                                ...draft,
                                                items: draft.items.map((entry, position) => (position === index ? { ...entry, reps: event.target.value } : entry)),
                                            })}
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 shrink-0"
                                            aria-label={`Quitar ${item.exercise_name}`}
                                            onClick={() => setDraft({ ...draft, items: draft.items.filter((_, position) => position !== index) })}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                                <StudioExerciseSearch
                                    id="rutina-buscar"
                                    label="Añadir ejercicio"
                                    entries={data.entries}
                                    onPick={entry => setDraft({
                                        ...draft,
                                        items: [...draft.items, {
                                            catalog_exercise_id: entry.catalogExerciseId,
                                            exercise_name: entry.shortName ?? entry.name,
                                            sets: entry.defaultSets === null ? '' : String(entry.defaultSets),
                                            reps: entry.defaultReps ?? '',
                                        }],
                                    })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 border-t p-4">
                            <Button type="button" className="flex-1" disabled={isPending} onClick={save}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar rutina
                            </Button>
                            <Button type="button" variant="outline" disabled={isPending} onClick={() => setDraft(null)}>Volver</Button>
                        </div>
                    </>
                ) : (
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                        {routines.length === 0 && (
                            <p className="text-sm text-muted-foreground">Crea rutinas como «Movilidad 1» para añadir varios ejercicios de una vez.</p>
                        )}
                        {routines.map(routine => (
                            <div key={routine.id} className="flex items-center gap-1 rounded-md bg-muted/50 p-2">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{routine.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {ROUTINE_KINDS[routine.kind as keyof typeof ROUTINE_KINDS]} · {routine.items.length} ejercicios
                                        {routine.client_id ? ` · solo ${data.client.fullName}` : ''}
                                    </span>
                                </span>
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${routine.name}`} onClick={() => setDraft(draftFrom(routine, data.client.id))}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={isPending} aria-label={`Borrar ${routine.name}`} onClick={() => remove(routine)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" className="w-full" onClick={() => setDraft(draftFrom(null, data.client.id))}>
                            <Plus className="mr-1 h-4 w-4" /> Nueva rutina
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
