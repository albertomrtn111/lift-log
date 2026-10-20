import type { StrengthStructure } from '@/types/templates'
import {
    catalogGroupToMuscleGroup,
    findCatalogExercise,
    type CatalogExercise,
} from '@/lib/training/exercise-catalog'

export function resolveStrengthStructure(
    structure: StrengthStructure,
    catalog: CatalogExercise[]
): { structure: StrengthStructure; unresolved: string[] } {
    const unresolved: string[] = []
    const days = (structure.days ?? []).map(day => ({
        ...day,
        exercises: (day.exercises ?? []).map(exercise => {
            const selected = findCatalogExercise(catalog, exercise)
            if (!selected) {
                unresolved.push(exercise.exercise_name || 'Ejercicio sin nombre')
                return exercise
            }
            return {
                ...exercise,
                catalog_exercise_id: selected.id,
                exercise_name: selected.name,
                muscle_group: catalogGroupToMuscleGroup(selected.primary_group),
            }
        }),
    }))

    return { structure: { ...structure, days }, unresolved }
}
