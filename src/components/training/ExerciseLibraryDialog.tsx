'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { addExerciseToCatalogCache, useExerciseBlocks } from '@/hooks/use-exercise-catalog'
import { createCatalogExerciseAction } from '@/lib/training/exercise-catalog-actions'
import {
    findSimilarExercises,
    type SimilarCatalogExercise,
} from '@/lib/training/exercise-catalog-client'
import {
    CATALOG_GROUPS,
    normalizeExerciseName,
    type CatalogExercise,
} from '@/lib/training/exercise-catalog'
import {
    BLOCK_CATEGORY_LABELS,
    EQUIPMENT_LABELS,
    LATERALITIES,
    LATERALITY_LABELS,
} from '@/lib/training/exercise-catalog-rules'
import { cn } from '@/lib/utils'

interface ExerciseLibraryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    exercises: CatalogExercise[]
    onSelect: (exercise: CatalogExercise) => void | Promise<void>
    value?: string | null
    legacyName?: string | null
    loading?: boolean
    error?: string | null
}

function equipmentLabel(item: string) {
    return EQUIPMENT_LABELS[item as keyof typeof EQUIPMENT_LABELS] ?? item
}

export function ExerciseLibraryDialog({
    open,
    onOpenChange,
    exercises,
    onSelect,
    value,
    legacyName,
    loading,
    error,
}: ExerciseLibraryDialogProps) {
    const { toast } = useToast()
    const [view, setView] = useState<'browse' | 'create'>('browse')
    const [search, setSearch] = useState('')
    const [group, setGroup] = useState<string | null>(null)
    const [newName, setNewName] = useState('')
    const [newGroup, setNewGroup] = useState<string>('')
    const [newBlock, setNewBlock] = useState<string>('')
    const [newLaterality, setNewLaterality] = useState<string>('')
    const [newEquipment, setNewEquipment] = useState<string[]>([])
    const [similar, setSimilar] = useState<SimilarCatalogExercise[]>([])
    const [creating, setCreating] = useState(false)
    const blocks = useExerciseBlocks(open)

    useEffect(() => {
        if (!open) return
        setView('browse')
        setSearch('')
        setGroup(null)
    }, [open])

    const blockNames = useMemo(() => new Map(blocks.map(block => [block.key, block.name])), [blocks])

    const blocksByCategory = useMemo(
        () => Object.entries(BLOCK_CATEGORY_LABELS)
            .map(([category, label]) => ({ label, blocks: blocks.filter(block => block.category === category) }))
            .filter(entry => entry.blocks.length > 0),
        [blocks]
    )

    const groups = useMemo(
        () => CATALOG_GROUPS.filter(item => exercises.some(exercise => exercise.primary_group === item)),
        [exercises]
    )

    const filtered = useMemo(() => {
        const query = normalizeExerciseName(search)
        return exercises.filter(exercise => {
            if (group && exercise.primary_group !== group) return false
            if (!query) return true
            return normalizeExerciseName(exercise.name).includes(query)
                || normalizeExerciseName(exercise.primary_group).includes(query)
                || normalizeExerciseName(blockNames.get(exercise.block_key ?? '') ?? '').includes(query)
                || (exercise.equipment ?? []).some(item => normalizeExerciseName(equipmentLabel(item)).includes(query))
                || (exercise.aliases ?? []).some(alias => alias.includes(query))
        })
    }, [exercises, search, group, blockNames])

    useEffect(() => {
        const name = newName.trim()
        if (view !== 'create' || name.length < 3) {
            setSimilar([])
            return
        }
        let active = true
        const timer = setTimeout(() => {
            void findSimilarExercises(name, newBlock || null).then(matches => {
                if (active) setSimilar(matches)
            })
        }, 300)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [view, newName, newBlock])

    function choose(exercise: CatalogExercise) {
        void onSelect(exercise)
        onOpenChange(false)
    }

    function startCreate() {
        setNewName(search.trim() || legacyName?.trim() || '')
        setNewGroup(group ?? '')
        setNewBlock('')
        setNewLaterality('')
        setNewEquipment([])
        setView('create')
    }

    function chooseSimilar(match: SimilarCatalogExercise) {
        choose(exercises.find(exercise => exercise.id === match.id) ?? match)
    }

    function toggleEquipment(item: string) {
        setNewEquipment(current =>
            current.includes(item) ? current.filter(value => value !== item) : [...current, item]
        )
    }

    async function create() {
        setCreating(true)
        const result = await createCatalogExerciseAction({
            name: newName,
            primaryGroup: newGroup,
            blockKey: newBlock,
            laterality: newLaterality,
            equipment: newEquipment,
        })
        setCreating(false)
        if (!result.success) {
            toast({ title: 'No se pudo crear', description: result.error, variant: 'destructive' })
            return
        }
        addExerciseToCatalogCache(result.exercise)
        toast({
            title: result.existed ? 'Ese ejercicio ya existía' : 'Ejercicio añadido a la biblioteca',
            description: result.exercise.name,
        })
        choose(result.exercise)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(85dvh,700px)] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
                {view === 'browse' ? (
                    <>
                        <DialogHeader className="shrink-0 space-y-3 border-b p-4 text-left">
                            <div>
                                <DialogTitle>Biblioteca de ejercicios</DialogTitle>
                                <DialogDescription className="break-words">
                                    {legacyName && !value ? `Nombre anterior: ${legacyName}` : 'Elige un ejercicio o crea uno nuevo.'}
                                </DialogDescription>
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    autoFocus
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Buscar por nombre, bloque o material…"
                                    className="h-11 pl-9"
                                    aria-label="Buscar ejercicio"
                                />
                            </div>
                            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide" role="group" aria-label="Filtrar por grupo muscular">
                                {[null, ...groups].map(item => (
                                    <button
                                        key={item ?? 'all'}
                                        type="button"
                                        aria-pressed={group === item}
                                        onClick={() => setGroup(item)}
                                        className={cn(
                                            'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                                            group === item
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {item ?? 'Todos'}
                                    </button>
                                ))}
                            </div>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                            {loading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando biblioteca…</p>}
                            {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
                            {!loading && !error && filtered.length === 0 && (
                                <div className="py-8 text-center">
                                    <p className="text-sm text-muted-foreground">
                                        {search ? `No hay ningún ejercicio con «${search}».` : 'No hay ejercicios en este grupo.'}
                                    </p>
                                    <Button size="sm" className="mt-3 gap-1.5 rounded-full" onClick={startCreate}>
                                        <Plus className="h-4 w-4" />
                                        {search ? `Crear «${search.trim()}»` : 'Crear ejercicio'}
                                    </Button>
                                </div>
                            )}
                            {!loading && !error && filtered.map(exercise => (
                                <button
                                    key={exercise.id}
                                    type="button"
                                    onClick={() => choose(exercise)}
                                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="min-w-0">
                                        <span className="block break-words text-sm font-medium">{exercise.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {[blockNames.get(exercise.block_key ?? ''), exercise.primary_group].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    {value === exercise.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </button>
                            ))}
                        </div>

                        {!loading && !error && filtered.length > 0 && (
                            <div className="shrink-0 border-t p-3">
                                <Button variant="outline" className="w-full gap-1.5" onClick={startCreate}>
                                    <Plus className="h-4 w-4" />
                                    ¿No está? Crear ejercicio nuevo
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <DialogHeader className="shrink-0 border-b p-4 text-left">
                            <button
                                type="button"
                                onClick={() => setView('browse')}
                                className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Volver a la biblioteca
                            </button>
                            <DialogTitle>Nuevo ejercicio</DialogTitle>
                            <DialogDescription>
                                Se añade a la biblioteca común y lo verán todos los entrenadores.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                            <label className="block space-y-1.5">
                                <span className="text-sm font-medium">Nombre</span>
                                <Input
                                    autoFocus
                                    value={newName}
                                    onChange={event => setNewName(event.target.value)}
                                    placeholder="Ej: Press de banca plano con barra"
                                    className="h-11"
                                    maxLength={80}
                                />
                                <span className="block text-xs text-muted-foreground">
                                    Incluye el material o la variante: «con barra», «en polea», «unilateral»…
                                </span>
                            </label>

                            <label className="block space-y-1.5">
                                <span className="text-sm font-medium">Grupo muscular</span>
                                <Select value={newGroup} onValueChange={setNewGroup}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Selecciona un grupo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATALOG_GROUPS.map(item => (
                                            <SelectItem key={item} value={item}>{item}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="block space-y-1.5">
                                <span className="text-sm font-medium">Bloque</span>
                                <Select value={newBlock} onValueChange={setNewBlock}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Selecciona un bloque" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {blocksByCategory.map(entry => (
                                            <SelectGroup key={entry.label}>
                                                <SelectLabel>{entry.label}</SelectLabel>
                                                {entry.blocks.map(block => (
                                                    <SelectItem key={block.key} value={block.key}>{block.name}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="block space-y-1.5">
                                <span className="text-sm font-medium">Lateralidad</span>
                                <Select value={newLaterality} onValueChange={setNewLaterality}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Selecciona la lateralidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LATERALITIES.map(item => (
                                            <SelectItem key={item} value={item}>
                                                {LATERALITY_LABELS[item as keyof typeof LATERALITY_LABELS]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>

                            <div className="space-y-1.5">
                                <span className="text-sm font-medium">Material (opcional)</span>
                                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Material">
                                    {Object.entries(EQUIPMENT_LABELS).map(([item, label]) => (
                                        <button
                                            key={item}
                                            type="button"
                                            aria-pressed={newEquipment.includes(item)}
                                            onClick={() => toggleEquipment(item)}
                                            className={cn(
                                                'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                                                newEquipment.includes(item)
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {similar.length > 0 && (
                                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                                    <p className="text-sm font-medium">¿Es alguno de estos?</p>
                                    {similar.map(exercise => (
                                        <button
                                            key={exercise.id}
                                            type="button"
                                            onClick={() => chooseSimilar(exercise)}
                                            className="flex w-full items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
                                        >
                                            <span className="min-w-0 break-words font-medium">{exercise.name}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground">Usar este</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 border-t p-3">
                            <Button
                                className="w-full gap-1.5"
                                onClick={create}
                                disabled={creating || newName.trim().length < 3 || !newGroup || !newBlock || !newLaterality}
                            >
                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Crear y usar
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
