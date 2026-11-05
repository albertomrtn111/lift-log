'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ExerciseLibraryDialog } from '@/components/training/ExerciseLibraryDialog'
import {
    refreshWorkspaceLibrary,
    useExerciseBlocks,
    useExerciseCatalog,
    useWorkspaceLibrary,
} from '@/hooks/use-exercise-catalog'
import { normalizeExerciseName, type CatalogExercise } from '@/lib/training/exercise-catalog'
import { addManyToLibraryAction, addToLibraryAction } from '@/lib/training/workspace-library-actions'
import {
    LIBRARY_TEMPLATES,
    presetIds,
    selectionState,
    setManySelected,
} from '@/lib/training/workspace-library-rules'
import { cn } from '@/lib/utils'

/**
 * Selección de ejercicios para la biblioteca. Con `preselect`, los predefinidos salen marcados.
 * Lo que ya está en la biblioteca sale marcado y bloqueado: quitarlo tiene su propio aviso.
 */
export function useLibrarySelection({ preselect }: { preselect: boolean }) {
    const catalog = useExerciseCatalog()
    const blocks = useExerciseBlocks()
    const library = useWorkspaceLibrary()
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [ready, setReady] = useState(false)

    useEffect(() => {
        if (ready || catalog.loading || catalog.exercises.length === 0) return
        if (preselect) setSelected(new Set(presetIds(catalog.exercises)))
        setReady(true)
    }, [ready, catalog.loading, catalog.exercises, preselect])

    const inLibrary = useMemo(() => new Set(library.map(entry => entry.catalog_exercise_id)), [library])
    const pending = useMemo(() => [...selected].filter(id => !inLibrary.has(id)), [selected, inLibrary])

    const save = useCallback(async () => {
        const result = await addManyToLibraryAction(pending)
        if (result.success) {
            await refreshWorkspaceLibrary()
            setSelected(new Set())
        }
        return result
    }, [pending])

    return { catalog, blocks, inLibrary, selected, setSelected, toAdd: pending.length, save }
}

type Selection = ReturnType<typeof useLibrarySelection>

export function LibraryBulkPicker({ selection }: { selection: Selection }) {
    const { catalog, blocks, inLibrary, selected, setSelected, toAdd } = selection
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState<Set<string>>(new Set())
    const [adding, setAdding] = useState(false)

    // Los predefinidos y lo que el espacio ya tiene. El resto del catálogo se busca con «Añadir otro».
    const exercises = useMemo(
        () => catalog.exercises.filter(exercise => exercise.is_predefined || inLibrary.has(exercise.id)),
        [catalog.exercises, inLibrary]
    )

    const query = normalizeExerciseName(search)

    const sections = useMemo(
        () => blocks
            .map(block => {
                const all = exercises.filter(exercise => exercise.block_key === block.key)
                const blockMatches = normalizeExerciseName(block.name).includes(query)
                return {
                    block,
                    all,
                    shown: !query || blockMatches
                        ? all
                        : all.filter(exercise => normalizeExerciseName(exercise.name).includes(query)),
                }
            })
            .filter(section => section.shown.length > 0),
        [blocks, exercises, query]
    )

    const isChecked = useCallback(
        (id: string) => inLibrary.has(id) || selected.has(id),
        [inLibrary, selected]
    )
    const checkedSet = useMemo(() => new Set([...selected, ...inLibrary]), [selected, inLibrary])
    const total = exercises.length
    const marked = exercises.filter(exercise => isChecked(exercise.id)).length

    function replaceSelection(ids: string[]) {
        setSelected(new Set(ids))
    }

    function toggleOpen(key: string) {
        setOpen(current => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    async function addOther(exercise: CatalogExercise) {
        await addToLibraryAction(exercise.id)
        await refreshWorkspaceLibrary()
    }

    if (catalog.loading) {
        return (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando ejercicios…
            </div>
        )
    }

    if (catalog.error) return <p className="p-4 text-sm text-destructive">{catalog.error}</p>

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos">
                <ShortcutButton onClick={() => replaceSelection(presetIds(exercises))}>Seleccionar todos</ShortcutButton>
                {Object.entries(LIBRARY_TEMPLATES).map(([key, template]) => (
                    <ShortcutButton key={key} onClick={() => replaceSelection(presetIds(exercises, key))}>
                        {template.label}
                    </ShortcutButton>
                ))}
                <ShortcutButton onClick={() => replaceSelection([])}>Quitar todos</ShortcutButton>
            </div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar ejercicio o bloque…"
                    className="pl-9"
                    aria-label="Buscar ejercicio o bloque"
                />
            </div>

            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {marked} de {total} marcados{toAdd > 0 && inLibrary.size > 0 ? ` · ${toAdd} por añadir` : ''}
                </p>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" />
                    Añadir otro
                </Button>
            </div>

            <div className="divide-y divide-border rounded-lg border">
                {sections.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                        No hay nada con «{search}». Pulsa «Añadir otro» para buscarlo o crearlo.
                    </p>
                )}
                {sections.map(({ block, all, shown }) => {
                    const ids = all.map(exercise => exercise.id)
                    const free = ids.filter(id => !inLibrary.has(id))
                    const state = selectionState(ids, checkedSet)
                    const expanded = open.has(block.key) || !!query
                    return (
                        <div key={block.key}>
                            <div className="flex items-center gap-3 px-3 py-2">
                                <Checkbox
                                    checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                                    disabled={free.length === 0}
                                    aria-label={`Seleccionar todos en ${block.name}`}
                                    className={cn(state === 'some' && 'border-primary bg-primary/40 text-primary-foreground')}
                                    onCheckedChange={checked => setSelected(current =>
                                        setManySelected(current, free, checked === true))}
                                />
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => toggleOpen(block.key)}
                                    className="flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                >
                                    <span className="min-w-0 break-words text-sm font-medium">{block.name}</span>
                                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                        {ids.filter(id => checkedSet.has(id)).length} de {ids.length}
                                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                                    </span>
                                </button>
                            </div>
                            {expanded && (
                                <ul className="pb-2 pl-10 pr-3">
                                    {shown.map(exercise => {
                                        const locked = inLibrary.has(exercise.id)
                                        return (
                                            <li key={exercise.id}>
                                                <label className="flex min-h-9 cursor-pointer items-center gap-3 py-1 text-sm">
                                                    <Checkbox
                                                        checked={isChecked(exercise.id)}
                                                        disabled={locked}
                                                        onCheckedChange={checked => setSelected(current =>
                                                            setManySelected(current, [exercise.id], checked === true))}
                                                    />
                                                    <span className="min-w-0 break-words">{exercise.name}</span>
                                                    {locked && (
                                                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                                            Ya en tu biblioteca
                                                        </span>
                                                    )}
                                                </label>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </div>

            <ExerciseLibraryDialog
                open={adding}
                onOpenChange={setAdding}
                exercises={catalog.exercises}
                loading={catalog.loading}
                error={catalog.error}
                onSelect={addOther}
            />
        </div>
    )
}

function ShortcutButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="h-8 rounded-full border border-border/70 bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
            {children}
        </button>
    )
}
