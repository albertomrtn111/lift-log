'use client'

import { ExerciseCatalogPicker } from '@/components/training/ExerciseCatalogPicker'
import { findCatalogExercise, type CatalogExercise } from '@/lib/training/exercise-catalog'

interface ExerciseCatalogReviewProps {
    names: string[]
    catalog: CatalogExercise[]
    selections: Record<number, string>
    onSelect: (index: number, exercise: CatalogExercise) => void
    loading: boolean
    error: string | null
}

export function selectedCatalogExercise(
    catalog: CatalogExercise[],
    name: string,
    id?: string
): CatalogExercise | null {
    if (id) return catalog.find(exercise => exercise.id === id) ?? null
    return findCatalogExercise(catalog, { exercise_name: name })
}

export function ExerciseCatalogReview({
    names,
    catalog,
    selections,
    onSelect,
    loading,
    error,
}: ExerciseCatalogReviewProps) {
    const missing = names.filter((name, index) =>
        !selectedCatalogExercise(catalog, name, selections[index])
    ).length

    return (
        <div className="space-y-3 rounded-lg border p-3">
            <div>
                <h4 className="text-sm font-semibold">Ejercicios del catálogo</h4>
                <p className="text-xs text-muted-foreground">
                    {missing === 0
                        ? 'Todos los ejercicios están identificados. Puedes cambiar cualquier selección.'
                        : `Selecciona ${missing} ejercicio${missing === 1 ? '' : 's'} antes de continuar.`}
                </p>
            </div>
            <div className="max-h-[35vh] space-y-3 overflow-y-auto pr-1">
                {names.map((name, index) => {
                    const selected = selectedCatalogExercise(catalog, name, selections[index])
                    return (
                        <div key={index} className="min-w-0 space-y-1">
                            <p className="break-words text-xs text-muted-foreground">{name}</p>
                            <ExerciseCatalogPicker
                                exercises={catalog}
                                value={selected?.id}
                                legacyName={name}
                                loading={loading}
                                error={error}
                                onSelect={exercise => onSelect(index, exercise)}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
