'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ExerciseCatalogPicker } from '@/components/training/ExerciseCatalogPicker'
import { ExerciseLibraryDialog } from '@/components/training/ExerciseLibraryDialog'
import { refreshWorkspaceLibrary, useExerciseCatalog } from '@/hooks/use-exercise-catalog'
import {
    addToLibraryAction,
    getExerciseUsageAction,
    getLibraryAction,
    removeFromLibraryAction,
    reorderLibraryBlocksAction,
    reorderLibraryEntriesAction,
    updateLibraryBlockAction,
    updateLibraryEntryAction,
    type ExerciseUsage,
    type LibraryBlock,
    type LibraryData,
    type LibraryEntry,
    type LibraryFields,
} from '@/lib/training/workspace-library-actions'
import { moveInList, swapInList } from '@/lib/training/workspace-library-rules'
import type { CatalogExercise } from '@/lib/training/exercise-catalog'
import { cn } from '@/lib/utils'

type Editing =
    | { kind: 'entry'; entry: LibraryEntry }
    | { kind: 'block'; block: LibraryBlock }

function prescription(sets: number | null, reps: string | null) {
    if (sets && reps) return `${sets}×${reps}`
    if (sets) return `${sets} series`
    return reps ? `${reps} reps` : null
}

export function LibrarySettingsPanel() {
    const [library, setLibrary] = useState<LibraryData | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [editing, setEditing] = useState<Editing | null>(null)
    const [removing, setRemoving] = useState<LibraryEntry | null>(null)
    const [pending, startTransition] = useTransition()
    const catalog = useExerciseCatalog()

    const load = useCallback(async () => {
        const result = await getLibraryAction()
        if (result.success && result.data) {
            setLibrary(result.data)
            setLoadError(null)
        } else {
            setLoadError(result.success ? 'No se pudo cargar la biblioteca.' : result.error)
        }
        void refreshWorkspaceLibrary()
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const run = useCallback((action: () => Promise<{ success: boolean; error?: string }>, done?: string) => {
        startTransition(async () => {
            const result = await action()
            if (result.success) {
                if (done) toast.success(done)
                await load()
            } else {
                toast.error(result.error ?? 'No se pudo guardar.')
            }
        })
    }, [load])

    const sections = useMemo(() => {
        if (!library) return []
        return library.blocks
            .map(block => ({
                block,
                entries: library.entries.filter(entry => entry.blockKey === block.key),
            }))
            .filter(section => section.entries.length > 0)
    }, [library])

    if (loadError) return <Card className="p-5 text-sm text-muted-foreground">{loadError}</Card>

    if (!library) {
        return (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando la biblioteca…
            </Card>
        )
    }

    const { canManage } = library

    function moveBlock(key: string, delta: number) {
        if (!library) return
        const visible = sections.map(section => section.block.key)
        const neighbour = visible[visible.indexOf(key) + delta]
        if (!neighbour) return
        const order = swapInList(library.blocks.map(block => block.key), key, neighbour)
        run(() => reorderLibraryBlocksAction(order))
    }

    function moveEntry(entries: LibraryEntry[], id: string, delta: number) {
        const ids = entries.map(entry => entry.id)
        const order = moveInList(ids, id, delta)
        if (order !== ids) run(() => reorderLibraryEntriesAction(order))
    }

    return (
        <div className="space-y-4">
            <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="font-medium">Tu biblioteca</h2>
                    <p className="text-sm text-muted-foreground">
                        Los ejercicios que usa tu espacio, ordenados por bloques. El historial de los clientes va
                        siempre por el ejercicio del catálogo.
                    </p>
                </div>
                <Button className="shrink-0 gap-1.5" onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" />
                    Añadir ejercicio
                </Button>
            </Card>

            {sections.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    Aún no hay ejercicios. Añade los que más usas: también los verás con una estrella en el selector
                    de ejercicios.
                </Card>
            )}

            {sections.map(({ block, entries }, sectionIndex) => (
                <div key={block.key} className="space-y-1.5">
                    {block.groupTitle && (
                        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-primary">{block.groupTitle}</p>
                    )}
                    <Card className={cn('divide-y divide-border', block.isHidden && 'opacity-60')}>
                        <div className="flex items-center gap-2 p-3">
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-semibold">{block.displayName}</p>
                                {prescription(block.defaultSets, block.defaultReps) && (
                                    <p className="text-xs text-muted-foreground">
                                        Por defecto {prescription(block.defaultSets, block.defaultReps)}
                                    </p>
                                )}
                            </div>
                            {block.isHidden && <Badge variant="secondary">Oculto</Badge>}
                            {canManage && (
                                <RowControls
                                    label={block.displayName}
                                    disabled={pending}
                                    canUp={sectionIndex > 0}
                                    canDown={sectionIndex < sections.length - 1}
                                    onMove={delta => moveBlock(block.key, delta)}
                                    onEdit={() => setEditing({ kind: 'block', block })}
                                />
                            )}
                        </div>
                        {entries.map((entry, index) => (
                            <div key={entry.id} className={cn(entry.isHidden && 'opacity-60')}>
                                {entry.groupTitle && (
                                    <p className="px-3 pt-2 text-xs font-semibold text-primary">{entry.groupTitle}</p>
                                )}
                                <div className="flex items-center gap-2 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm">{entry.shortName ?? entry.name}</p>
                                        <p className="break-words text-xs text-muted-foreground">
                                            {[
                                                entry.shortName ? entry.name : null,
                                                prescription(entry.defaultSets, entry.defaultReps),
                                            ].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    {entry.isHidden && <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Oculto" />}
                                    {canManage && (
                                        <RowControls
                                            label={entry.name}
                                            disabled={pending}
                                            canUp={index > 0}
                                            canDown={index < entries.length - 1}
                                            onMove={delta => moveEntry(entries, entry.id, delta)}
                                            onEdit={() => setEditing({ kind: 'entry', entry })}
                                            onRemove={() => setRemoving(entry)}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </Card>
                </div>
            ))}

            <ExerciseLibraryDialog
                open={adding}
                onOpenChange={setAdding}
                exercises={catalog.exercises}
                loading={catalog.loading}
                error={catalog.error}
                onSelect={exercise => run(() => addToLibraryAction(exercise.id), 'Añadido a tu biblioteca')}
            />

            {editing && (
                <EditDialog
                    key={editing.kind === 'entry' ? editing.entry.id : editing.block.key}
                    editing={editing}
                    saving={pending}
                    onClose={() => setEditing(null)}
                    onSave={fields => {
                        const current = editing
                        setEditing(null)
                        run(
                            () => current.kind === 'entry'
                                ? updateLibraryEntryAction(current.entry.id, fields)
                                : updateLibraryBlockAction(current.block.key, fields),
                            'Guardado'
                        )
                    }}
                />
            )}

            {removing && (
                <RemoveDialog
                    key={removing.id}
                    entry={removing}
                    catalog={catalog.exercises}
                    onClose={() => setRemoving(null)}
                    onRemove={targetId => {
                        const entry = removing
                        setRemoving(null)
                        run(
                            () => removeFromLibraryAction(entry.id, targetId),
                            targetId ? 'Quitado y datos pasados al otro ejercicio' : 'Quitado de tu biblioteca'
                        )
                    }}
                />
            )}
        </div>
    )
}

function RowControls({
    label,
    disabled,
    canUp,
    canDown,
    onMove,
    onEdit,
    onRemove,
}: {
    label: string
    disabled: boolean
    canUp: boolean
    canDown: boolean
    onMove: (delta: number) => void
    onEdit: () => void
    onRemove?: () => void
}) {
    return (
        <div className="flex shrink-0 items-center">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || !canUp} aria-label={`Subir ${label}`} onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || !canDown} aria-label={`Bajar ${label}`} onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled} aria-label={`Editar ${label}`} onClick={onEdit}>
                <Pencil className="h-4 w-4" />
            </Button>
            {onRemove && (
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={disabled} aria-label={`Quitar ${label}`} onClick={onRemove}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    )
}

function EditDialog({
    editing,
    saving,
    onClose,
    onSave,
}: {
    editing: Editing
    saving: boolean
    onClose: () => void
    onSave: (fields: LibraryFields) => void
}) {
    const isEntry = editing.kind === 'entry'
    const current = isEntry
        ? {
            title: editing.entry.name,
            name: editing.entry.shortName,
            groupTitle: editing.entry.groupTitle,
            sets: editing.entry.defaultSets,
            reps: editing.entry.defaultReps,
            hidden: editing.entry.isHidden,
        }
        : {
            title: editing.block.name,
            name: editing.block.displayName === editing.block.name ? null : editing.block.displayName,
            groupTitle: editing.block.groupTitle,
            sets: editing.block.defaultSets,
            reps: editing.block.defaultReps,
            hidden: editing.block.isHidden,
        }

    const [name, setName] = useState(current.name ?? '')
    const [title, setTitle] = useState(current.groupTitle ?? '')
    const [sets, setSets] = useState(current.sets?.toString() ?? '')
    const [reps, setReps] = useState(current.reps ?? '')
    const [hidden, setHidden] = useState(current.hidden)

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
                <DialogHeader>
                    <DialogTitle className="break-words">{current.title}</DialogTitle>
                    <DialogDescription>Estos cambios son solo para tu espacio.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="library-name">{isEntry ? 'Nombre corto' : 'Nombre en tu espacio'}</Label>
                        <Input id="library-name" value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder={current.title} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="library-title">Título de grupo</Label>
                        <Input id="library-title" value={title} maxLength={60} onChange={event => setTitle(event.target.value)} placeholder="Ej: Pliometría" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="library-sets">Series por defecto</Label>
                            <Input id="library-sets" inputMode="numeric" value={sets} onChange={event => setSets(event.target.value)} placeholder="3" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="library-reps">Repeticiones</Label>
                            <Input id="library-reps" value={reps} maxLength={20} onChange={event => setReps(event.target.value)} placeholder="8-10" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="library-hidden">Ocultar en tu espacio</Label>
                        <Switch id="library-hidden" checked={hidden} onCheckedChange={setHidden} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button
                        disabled={saving}
                        onClick={() => onSave({ name, title, sets, reps, isHidden: hidden })}
                    >
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function RemoveDialog({
    entry,
    catalog,
    onClose,
    onRemove,
}: {
    entry: LibraryEntry
    catalog: CatalogExercise[]
    onClose: () => void
    onRemove: (targetCatalogId: string | null) => void
}) {
    const [usage, setUsage] = useState<ExerciseUsage | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [target, setTarget] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        void getExerciseUsageAction(entry).then(result => {
            if (!active) return
            if (result.success && result.data) setUsage(result.data)
            else setError(result.success ? 'No se pudo comprobar qué datos hay.' : result.error)
        })
        return () => {
            active = false
        }
    }, [entry])

    const hasData = !!usage && (usage.clients.length > 0 || usage.templates > 0)
    const options = catalog.filter(exercise => exercise.id !== entry.catalogExerciseId)

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="break-words">Quitar «{entry.shortName ?? entry.name}»</DialogTitle>
                    <DialogDescription>
                        Sale de tu biblioteca, pero sigue en el catálogo común.
                    </DialogDescription>
                </DialogHeader>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {!usage && !error && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Comprobando quién lo usa…
                    </div>
                )}

                {usage && !hasData && (
                    <p className="text-sm text-muted-foreground">Ningún cliente ni plantilla lo usa.</p>
                )}

                {usage && hasData && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium">
                                {usage.clients.length === 1 ? '1 cliente tiene' : `${usage.clients.length} clientes tienen`} datos
                                {usage.templates > 0 && ` y lo usan ${usage.templates} ${usage.templates === 1 ? 'plantilla' : 'plantillas'}`}
                            </p>
                            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                                {usage.clients.map(client => (
                                    <li key={client.id} className="flex justify-between gap-3">
                                        <span className="min-w-0 break-words">{client.name}</span>
                                        <span className="shrink-0">
                                            {client.completed_sets} {client.completed_sets === 1 ? 'serie' : 'series'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                Si lo quitas sin más, estos datos siguen donde están.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium">Pasar los datos a otro ejercicio (opcional)</p>
                            {usage.similar.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {usage.similar.map(match => (
                                        <button
                                            key={match.id}
                                            type="button"
                                            aria-pressed={target === match.id}
                                            onClick={() => setTarget(current => (current === match.id ? null : match.id))}
                                            className={cn(
                                                'rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors',
                                                target === match.id
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            {match.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <ExerciseCatalogPicker
                                exercises={options}
                                value={target}
                                onSelect={exercise => setTarget(exercise.id)}
                                placeholder="Buscar otro ejercicio"
                            />
                            {target && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Los programas, el historial y las plantillas de tu espacio pasarán a ese ejercicio.
                                    No se puede deshacer.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant={target ? 'default' : 'destructive'}
                        disabled={!usage}
                        onClick={() => onRemove(target)}
                    >
                        {target ? 'Quitar y pasar los datos' : 'Quitar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
