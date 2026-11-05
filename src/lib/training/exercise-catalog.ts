import type { MuscleGroup } from '@/lib/training/muscle-groups'

// Columnas del catálogo que usan los selectores de ejercicios.
export const CATALOG_COLUMNS = 'id, name, primary_group, block_key, laterality, equipment, metrics'

export interface CatalogBlock {
    key: string
    name: string
    category: string
    sort_order: number
}

export interface CatalogExercise {
    id: string
    name: string
    primary_group: string
    block_key?: string | null
    laterality?: string
    equipment?: string[]
    metrics?: string[]
    // Nombres históricos ya normalizados (normalizeExerciseName) que apuntan a este ejercicio.
    aliases?: string[]
}

const GROUP_TO_MUSCLE: Record<string, MuscleGroup> = {
    Abdomen: 'abdomen',
    Aductores: 'aductores',
    Bíceps: 'bíceps',
    Cuádriceps: 'cuádriceps',
    Espalda: 'espalda',
    Gemelos: 'gemelos',
    Glúteos: 'glúteo',
    Hombros: 'hombro',
    Isquiotibiales: 'femorales',
    Pecho: 'pecho',
    Tríceps: 'tríceps',
}

// Grupos del catálogo común (exercise_catalog.primary_group). Misma lista y orden que la tabla muscle_groups.
export const CATALOG_GROUPS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Cuádriceps',
    'Isquiotibiales',
    'Glúteos',
    'Aductores',
    'Gemelos',
    'Tibial anterior',
    'Abdomen',
    'Piernas',
    'Cuerpo completo',
    'Cardio',
    'No aplica',
] as const

export function catalogGroupToMuscleGroup(group: string): MuscleGroup {
    return GROUP_TO_MUSCLE[group] ?? 'otros'
}

// Embed para selects de training_exercises: `exercise_name, ${CATALOG_NAME_EMBED}`.
export const CATALOG_NAME_EMBED = 'exercise_catalog(name)'

type CatalogNameEmbed = { name: string } | { name: string }[] | null | undefined

// Nombre estándar del catálogo si la fila está vinculada; si no, el nombre guardado.
export function exerciseDisplayName(row: {
    exercise_name?: string | null
    exercise_catalog?: CatalogNameEmbed
}): string {
    const embed = Array.isArray(row.exercise_catalog) ? row.exercise_catalog[0] : row.exercise_catalog
    return embed?.name || row.exercise_name || ''
}

export function normalizeExerciseName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es')
        .replace(/\s+/g, ' ')
        .trim()
}

export function findCatalogExercise(
    catalog: CatalogExercise[],
    exercise: { catalog_exercise_id?: string | null; exercise_name?: string | null }
): CatalogExercise | null {
    const byId = exercise.catalog_exercise_id
        ? catalog.find(item => item.id === exercise.catalog_exercise_id)
        : null
    if (byId) return byId
    if (exercise.catalog_exercise_id) return null

    if (!exercise.exercise_name) return null
    const normalizedName = normalizeExerciseName(exercise.exercise_name)
    return catalog.find(item => normalizeExerciseName(item.name) === normalizedName)
        ?? catalog.find(item => item.aliases?.includes(normalizedName))
        ?? null
}
